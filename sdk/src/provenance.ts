import { GearApi, HexString, decodeAddress } from "@gear-js/api";
import { Sails } from "sails-js";
import { readFileSync } from "fs";
import { join } from "path";
import {
  PROVENANCE_PROGRAM_ID,
  CreateSettlementOptions,
  Settlement,
  SettleOutcome,
  RegistryStats,
  SailsCallSpec,
  ProvenanceConfig,
} from "./types";

const IDL_PATH = join(__dirname, "../idl/provenance.idl");

// ─── SettlementHandle — fluent builder returned by create() ──────────────────

export class SettlementHandle {
  constructor(
    private readonly sdk: ProvenanceSDK,
    public readonly id: bigint
  ) {}

  /** Fund this settlement. Attaches the correct VARA value automatically. */
  async deposit(): Promise<void> {
    const s = await this.sdk.getSettlement(this.id);
    if (!s) throw new Error(`Settlement ${this.id} not found`);
    await this.sdk.deposit(this.id, s.amount);
  }

  /** Worker signals work is done. Must be called from the worker's account. */
  async claimCompletion(): Promise<void> {
    await this.sdk.claimCompletion(this.id);
  }

  /** Trigger on-chain verification. Anyone can call this. */
  async settle(): Promise<SettleOutcome> {
    return this.sdk.settle(this.id);
  }

  /** Cancel (before funding) or force-refund (after deadline). Depositor only. */
  async cancel(): Promise<void> {
    await this.sdk.cancel(this.id);
  }

  /** Poll the current on-chain state of this settlement. */
  async status(): Promise<Settlement | null> {
    return this.sdk.getSettlement(this.id);
  }
}

// ─── ProvenanceSDK ────────────────────────────────────────────────────────────

export class ProvenanceSDK {
  private api!: GearApi;
  private sails!: Sails;
  private programId: HexString;
  private account: any;
  private readonly endpoint: string;

  constructor(config: ProvenanceConfig = {}) {
    this.endpoint = config.endpoint ?? "wss://rpc.vara.network";
    this.programId = config.programId ?? PROVENANCE_PROGRAM_ID;
  }

  /** Connect to the network and load the IDL. Must be called before any other method. */
  async connect(account: any): Promise<this> {
    this.api = await GearApi.create({ providerAddress: this.endpoint });
    this.sails = await Sails.new();
    const idl = readFileSync(IDL_PATH, "utf-8");
    this.sails.parseIdl(idl);
    this.sails.setApi(this.api);
    this.sails.setProgramId(this.programId);
    this.account = account;
    return this;
  }

  /** Disconnect from the network. */
  async disconnect(): Promise<void> {
    await this.api.disconnect();
  }

  // ─── Escrow write methods ─────────────────────────────────────────────────

  /**
   * Create a new settlement and return a handle for the next steps.
   *
   * @example
   * const settlement = await provenance.create({
   *   worker: workerAgentId,
   *   amount: 5n * VARA,
   *   proof: { targetProgram, payloadBytes, expectedReply },
   * });
   * await settlement.deposit();
   */
  async create(opts: CreateSettlementOptions): Promise<SettlementHandle> {
    const deadlineBlocks = opts.deadlineBlocks ?? 1200;
    const spec = this._encodeSpec(opts.proof);

    const tx = this.sails.services.Escrow.functions.CreateSettlement(
      opts.worker,
      opts.amount,
      spec,
      deadlineBlocks
    );

    const id = await this._sendAndWait<bigint>(tx, 0n);
    return new SettlementHandle(this, id);
  }

  async deposit(settlementId: bigint, amount: bigint): Promise<void> {
    const tx = this.sails.services.Escrow.functions.Deposit(settlementId);
    await this._sendAndWait(tx, amount);
  }

  async claimCompletion(settlementId: bigint): Promise<void> {
    const tx =
      this.sails.services.Escrow.functions.ClaimCompletion(settlementId);
    await this._sendAndWait(tx, 0n);
  }

  async settle(settlementId: bigint): Promise<SettleOutcome> {
    const tx = this.sails.services.Escrow.functions.Settle(settlementId);
    return this._sendAndWait<SettleOutcome>(tx, 0n);
  }

  async cancel(settlementId: bigint): Promise<void> {
    const tx = this.sails.services.Escrow.functions.Cancel(settlementId);
    await this._sendAndWait(tx, 0n);
  }

  // ─── Escrow queries (free, no gas) ───────────────────────────────────────

  async getSettlement(id: bigint): Promise<Settlement | null> {
    const result = await this.sails.services.Escrow.queries.GetSettlement(
      this.account.address,
      undefined,
      undefined,
      id
    );
    return result ?? null;
  }

  async getNextId(): Promise<bigint> {
    return this.sails.services.Escrow.queries.GetNextId(
      this.account.address,
      undefined,
      undefined
    );
  }

  // ─── Registry queries ─────────────────────────────────────────────────────

  async listActive(offset = 0n, limit = 20n): Promise<Settlement[]> {
    return this.sails.services.Registry.queries.ListActive(
      this.account.address,
      undefined,
      undefined,
      offset,
      limit
    );
  }

  async getByDepositor(actor: HexString): Promise<bigint[]> {
    return this.sails.services.Registry.queries.GetByDepositor(
      this.account.address,
      undefined,
      undefined,
      actor
    );
  }

  async getByWorker(actor: HexString): Promise<bigint[]> {
    return this.sails.services.Registry.queries.GetByWorker(
      this.account.address,
      undefined,
      undefined,
      actor
    );
  }

  async stats(): Promise<RegistryStats> {
    const [total, active, settled] =
      await this.sails.services.Registry.queries.Stats(
        this.account.address,
        undefined,
        undefined
      );
    return { total, active, settled };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private _encodeSpec(spec: SailsCallSpec) {
    return {
      target_program: spec.targetProgram,
      payload_bytes: Array.from(spec.payloadBytes),
      expected_reply: Array.from(spec.expectedReply),
    };
  }

  private _sendAndWait<T>(tx: any, value: bigint): Promise<T> {
    return new Promise((resolve, reject) => {
      tx.signAndSend(this.account, { value }, ({ status, reply }: any) => {
        if (status.isFinalized) {
          if (reply?.hasError) {
            reject(new Error(reply.error.toString()));
          } else {
            resolve(reply?.payload as T);
          }
        }
      }).catch(reject);
    });
  }
}

// ─── Factory function — the 3-line integration entry point ───────────────────

/**
 * Connect to the Provenance settlement network.
 *
 * @example
 * const provenance = await Provenance(account);
 * const settlement = await provenance.create({ worker, amount: 5n * VARA, proof });
 * await settlement.deposit();
 */
export async function Provenance(
  account: any,
  config?: ProvenanceConfig
): Promise<ProvenanceSDK> {
  return new ProvenanceSDK(config).connect(account);
}
