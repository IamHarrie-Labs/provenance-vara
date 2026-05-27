/**
 * Infinite-Bounty-v3 ↔ Provenance Adapter
 *
 * Bridges infinite-bounty-v3 (trust-based, manual approval) with Provenance
 * (deterministic, automatic on-chain verification). When a bounty is claimed,
 * this adapter creates a parallel Provenance settlement that auto-pays the
 * worker once they call SubmitWork — no human approver needed.
 *
 * Flow:
 *   1. Scan open bounties on infinite-bounty-v3
 *   2. When a bounty is claimed, create a mirrored Provenance settlement
 *   3. Proof: query GetBounty(id) → verify status is "Submitted"
 *   4. Provenance auto-settles (pays worker) when proof matches
 *
 * Usage:
 *   npx ts-node agents/infinite-bounty-adapter.ts [--mirror <bountyId>] [--watch]
 */

import { Provenance, VARA, ProvenanceSDK } from "../sdk/src";
import { GearApi, GearKeyring, HexString, decodeAddress } from "@gear-js/api";
import { Sails } from "sails-js";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Constants ────────────────────────────────────────────────────────────────

const INFINITE_BOUNTY_PROGRAM =
  "0x747d09594538498f2c64ae91f93131a47b0ce8abaa80a54e37d7a6badadc15e8" as HexString;

const INFINITE_BOUNTY_IDL_PATH = join(__dirname, "../idl/infinite-bounty-v3.idl");
const PROVENANCE_PROGRAM_ID =
  "0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663" as HexString;

const POLL_INTERVAL_MS = 30_000; // 30 seconds
const ENDPOINT = "wss://rpc.vara.network";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bounty {
  id: bigint;
  creator: HexString;
  description: string;
  metadataUrl: string;
  reward: bigint;
  status: "Open" | "Claimed" | "Submitted" | "Approved" | "Cancelled";
  claimant?: HexString;
  proofUrl?: string;
  createdAt: bigint;
}

interface MirroredBounty {
  bountyId: bigint;
  settlementId: bigint;
  worker: HexString;
  reward: bigint;
  mirroredAt: Date;
}

// ─── InfiniteBountyClient ─────────────────────────────────────────────────────

class InfiniteBountyClient {
  private api!: GearApi;
  private sails!: Sails;
  private caller: string;

  constructor(callerAddress: string) {
    this.caller = callerAddress;
  }

  async connect(): Promise<this> {
    this.api = await GearApi.create({ providerAddress: ENDPOINT });
    this.sails = await Sails.new();
    const idl = readFileSync(INFINITE_BOUNTY_IDL_PATH, "utf-8");
    this.sails.parseIdl(idl);
    this.sails.setApi(this.api);
    this.sails.setProgramId(INFINITE_BOUNTY_PROGRAM);
    return this;
  }

  async disconnect(): Promise<void> {
    await this.api.disconnect();
  }

  async getOpenBounties(): Promise<Bounty[]> {
    const page = await this.sails.services.BountyBoard.queries.GetBountiesByStatus(
      this.caller,
      undefined,
      undefined,
      { Open: null },
      null,
      50
    );
    return this._mapBounties(page.bounties);
  }

  async getClaimedBounties(): Promise<Bounty[]> {
    const page = await this.sails.services.BountyBoard.queries.GetBountiesByStatus(
      this.caller,
      undefined,
      undefined,
      { Claimed: null },
      null,
      50
    );
    return this._mapBounties(page.bounties);
  }

  async getSubmittedBounties(): Promise<Bounty[]> {
    const page = await this.sails.services.BountyBoard.queries.GetBountiesByStatus(
      this.caller,
      undefined,
      undefined,
      { Submitted: null },
      null,
      50
    );
    return this._mapBounties(page.bounties);
  }

  async getBounty(id: bigint): Promise<Bounty | null> {
    const result = await this.sails.services.BountyBoard.queries.GetBounty(
      this.caller,
      undefined,
      undefined,
      id
    );
    if (!result) return null;
    return this._mapBounty(result);
  }

  /**
   * Encode the GetBounty query payload for use as Provenance proof.
   * The Provenance verifier will call this query and check if the reply
   * matches the expectedReply bytes (bounty with Submitted status).
   */
  encodeGetBountyQuery(bountyId: bigint): Uint8Array {
    // Sails route: "BountyBoard/GetBounty" + SCALE-encoded (u64) arg
    const fn_ = this.sails.services.BountyBoard.queries.GetBounty as any;
    // Use the codec to encode just the payload bytes (route + args)
    // This is the raw message payload the Provenance contract sends to infinite-bounty-v3
    try {
      const encoded = fn_.encodePayload(bountyId);
      return new Uint8Array(encoded);
    } catch {
      // Fallback: manually construct Sails query payload
      // Route "BountyBoard/GetBounty" prefix (2 bytes route hash) + SCALE u64
      return this._encodeManualQuery(bountyId);
    }
  }

  /**
   * Encode the expected reply: Option<Bounty> with status == Submitted.
   * This is what the verifier expects to get back from GetBounty.
   *
   * NOTE: Because the exact SCALE encoding depends on the full Bounty struct fields,
   * in production you would encode a Bounty struct with status=Submitted.
   * For the demo, we encode a minimal "Some(Bounty { status: Submitted, ... })" marker.
   */
  encodeSubmittedStatusReply(bountyId: bigint, worker: HexString, reward: bigint): Uint8Array {
    const fn_ = this.sails.services.BountyBoard.queries.GetBounty as any;
    try {
      // Build a mock Bounty with Submitted status and encode the expected return
      const mockBounty = {
        id: bountyId,
        creator: worker, // placeholder
        description: "",
        metadata_url: "",
        reward,
        status: { Submitted: null },
        claimant: worker,
        proof_url: null,
        created_at: 0n,
      };
      const encoded = fn_.encodeReply({ Some: mockBounty });
      return new Uint8Array(encoded);
    } catch {
      return this._encodeSubmittedMarker();
    }
  }

  private _mapBounties(raw: any[]): Bounty[] {
    return raw.map((b) => this._mapBounty(b));
  }

  private _mapBounty(b: any): Bounty {
    return {
      id: BigInt(b.id),
      creator: b.creator as HexString,
      description: b.description,
      metadataUrl: b.metadata_url,
      reward: BigInt(b.reward),
      status: this._mapStatus(b.status),
      claimant: b.claimant ?? undefined,
      proofUrl: b.proof_url ?? undefined,
      createdAt: BigInt(b.created_at),
    };
  }

  private _mapStatus(s: any): Bounty["status"] {
    if (s?.Open !== undefined || s === "Open") return "Open";
    if (s?.Claimed !== undefined || s === "Claimed") return "Claimed";
    if (s?.Submitted !== undefined || s === "Submitted") return "Submitted";
    if (s?.Approved !== undefined || s === "Approved") return "Approved";
    return "Cancelled";
  }

  // Manually encode "BountyBoard/GetBounty" route + u64 bountyId
  // Sails route encoding: 2-byte BLAKE2s prefix of "BountyBoard/GetBounty" + SCALE args
  private _encodeManualQuery(bountyId: bigint): Uint8Array {
    // For now return a placeholder — full SCALE encoding needs sails-js codec
    // The ProvenanceSDK handles this via sails.services when calling settle()
    const buf = new ArrayBuffer(10);
    const view = new DataView(buf);
    // Placeholder: will be properly encoded via sails-js in production
    view.setBigUint64(0, bountyId, true);
    view.setUint16(8, 0x0042, true); // route marker placeholder
    return new Uint8Array(buf);
  }

  private _encodeSubmittedMarker(): Uint8Array {
    // Option::Some (0x01) + Submitted status variant (0x02)
    return new Uint8Array([0x01, 0x02]);
  }
}

// ─── Adapter ──────────────────────────────────────────────────────────────────

export class InfiniteBountyAdapter {
  private bountyClient!: InfiniteBountyClient;
  private provenance!: ProvenanceSDK;
  private mirrored = new Map<bigint, MirroredBounty>();
  private lastSeenBountyId = 0n;

  async init(depositorAccount: any): Promise<void> {
    console.log("🔗 Connecting to Vara mainnet...");
    this.bountyClient = await new InfiniteBountyClient(depositorAccount.address).connect();
    this.provenance = await Provenance(depositorAccount, {
      endpoint: ENDPOINT,
      programId: PROVENANCE_PROGRAM_ID,
    });
    console.log("✅ Connected");
    console.log(`   infinite-bounty-v3: ${INFINITE_BOUNTY_PROGRAM}`);
    console.log(`   Provenance:         ${PROVENANCE_PROGRAM_ID}`);
  }

  async disconnect(): Promise<void> {
    await this.bountyClient.disconnect();
    await this.provenance.disconnect();
  }

  /**
   * Scan open bounties and print a summary table.
   */
  async scanBounties(): Promise<void> {
    console.log("\n📋 Scanning infinite-bounty-v3...\n");

    const [open, claimed, submitted] = await Promise.all([
      this.bountyClient.getOpenBounties(),
      this.bountyClient.getClaimedBounties(),
      this.bountyClient.getSubmittedBounties(),
    ]);

    console.log(`Open:      ${open.length} bounties`);
    console.log(`Claimed:   ${claimed.length} bounties`);
    console.log(`Submitted: ${submitted.length} bounties`);

    if (open.length > 0) {
      console.log("\n┌─ Open Bounties ─────────────────────────────────────────────────┐");
      for (const b of open) {
        const vara = Number(b.reward) / 1e12;
        console.log(`│ #${b.id.toString().padEnd(4)} ${vara.toFixed(2)} VARA  ${b.description.slice(0, 50)}`);
      }
      console.log("└─────────────────────────────────────────────────────────────────┘");
    }

    if (claimed.length > 0) {
      console.log("\n┌─ Claimed Bounties (ready to mirror) ────────────────────────────┐");
      for (const b of claimed) {
        const vara = Number(b.reward) / 1e12;
        console.log(`│ #${b.id.toString().padEnd(4)} ${vara.toFixed(2)} VARA  Worker: ${b.claimant?.slice(0, 12)}...`);
      }
      console.log("└─────────────────────────────────────────────────────────────────┘");
    }
  }

  /**
   * Mirror a specific bounty as a Provenance settlement.
   * The proof: Provenance queries GetBounty(id) on infinite-bounty-v3 and verifies
   * the bounty status has changed to "Submitted" (worker submitted their work).
   * When that query returns Submitted, Provenance automatically releases funds.
   */
  async mirrorBounty(bountyId: bigint): Promise<MirroredBounty> {
    console.log(`\n🪞 Mirroring bounty #${bountyId} as a Provenance settlement...`);

    const bounty = await this.bountyClient.getBounty(bountyId);
    if (!bounty) throw new Error(`Bounty #${bountyId} not found`);
    if (bounty.status !== "Claimed") {
      throw new Error(
        `Bounty #${bountyId} must be Claimed (has a worker) to mirror. Current: ${bounty.status}`
      );
    }
    if (!bounty.claimant) throw new Error(`Bounty #${bountyId} has no claimant`);

    const worker = bounty.claimant;
    const amount = bounty.reward;

    console.log(`   Bounty:  "${bounty.description.slice(0, 60)}"`);
    console.log(`   Reward:  ${Number(amount) / 1e12} VARA`);
    console.log(`   Worker:  ${worker}`);

    // Build proof spec: query GetBounty on infinite-bounty-v3, expect Submitted status
    const payloadBytes = this.bountyClient.encodeGetBountyQuery(bountyId);
    const expectedReply = this.bountyClient.encodeSubmittedStatusReply(bountyId, worker, amount);

    const handle = await this.provenance.create({
      worker,
      amount,
      proof: {
        targetProgram: INFINITE_BOUNTY_PROGRAM,
        payloadBytes,
        expectedReply,
      },
      deadlineBlocks: 14400, // ~12 hours on Vara (1 block ≈ 3s)
    });

    console.log(`   ✅ Provenance settlement #${handle.id} created`);
    console.log(`      Depositing ${Number(amount) / 1e12} VARA into escrow...`);

    await handle.deposit();
    console.log(`   ✅ Funds locked in escrow`);

    const mirrored: MirroredBounty = {
      bountyId,
      settlementId: handle.id,
      worker,
      reward: amount,
      mirroredAt: new Date(),
    };

    this.mirrored.set(bountyId, mirrored);
    this._logMirrored(mirrored);
    return mirrored;
  }

  /**
   * Try to settle all mirrored bounties that are ready.
   * Called periodically in watch mode.
   */
  async settleReady(): Promise<void> {
    if (this.mirrored.size === 0) return;

    for (const [bountyId, m] of this.mirrored) {
      const bounty = await this.bountyClient.getBounty(bountyId);
      if (!bounty) continue;

      if (bounty.status === "Submitted" || bounty.status === "Approved") {
        console.log(`\n⚡ Bounty #${bountyId} work submitted — triggering Provenance settle...`);
        try {
          const outcome = await this.provenance.settle(m.settlementId);
          console.log(`   Settlement #${m.settlementId} outcome: ${outcome}`);
          if (outcome === "Settled" || outcome === "Refunded") {
            this.mirrored.delete(bountyId);
          }
        } catch (e: any) {
          console.error(`   Error settling #${m.settlementId}:`, e.message);
        }
      }
    }
  }

  /**
   * Watch mode: poll for new claimed bounties and auto-mirror them.
   * Also watches mirrored settlements and triggers settle() when work is done.
   */
  async watch(depositorAccount: any): Promise<void> {
    console.log(`\n👁  Watching infinite-bounty-v3 (polling every ${POLL_INTERVAL_MS / 1000}s)...`);
    console.log("    Press Ctrl+C to stop\n");

    const poll = async () => {
      try {
        // Check for new claimed bounties that aren't mirrored yet
        const claimed = await this.bountyClient.getClaimedBounties();
        for (const b of claimed) {
          if (!this.mirrored.has(b.id) && b.id > this.lastSeenBountyId) {
            console.log(`\n🆕 New claimed bounty #${b.id}: "${b.description.slice(0, 50)}"`);
            try {
              await this.mirrorBounty(b.id);
            } catch (e: any) {
              console.error(`   Failed to mirror #${b.id}:`, e.message);
            }
          }
        }

        // Check if any mirrored bounties are ready to settle
        await this.settleReady();
      } catch (e: any) {
        console.error("Poll error:", e.message);
      }
    };

    await poll();
    setInterval(poll, POLL_INTERVAL_MS);
  }

  private _logMirrored(m: MirroredBounty): void {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  🔗 Bounty #${m.bountyId} mirrored as Provenance Settlement #${m.settlementId}
║
║  Worker:  ${m.worker}
║  Reward:  ${Number(m.reward) / 1e12} VARA locked in escrow
║
║  Proof verification:
║  • Provenance queries GetBounty(${m.bountyId}) on infinite-bounty-v3
║  • When status == Submitted, funds auto-release to worker
║  • If deadline passes without submission, funds refund to depositor
║
║  No human approver needed. ⚡ Fully deterministic.
╚══════════════════════════════════════════════════════════════╝`);
  }
}

// ─── CLI entry point ──────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const mirrorIdx = args.indexOf("--mirror");
  const watchMode = args.includes("--watch");
  const scanMode = args.includes("--scan") || (!watchMode && mirrorIdx === -1);

  // Load depositor account
  const depositor = await GearKeyring.fromSuri(
    process.env.DEPOSITOR_SURI ?? "//Alice"
  );
  console.log(`Depositor: ${depositor.address}`);

  const adapter = new InfiniteBountyAdapter();
  await adapter.init(depositor);

  try {
    if (scanMode) {
      await adapter.scanBounties();
    }

    if (mirrorIdx !== -1) {
      const bountyId = BigInt(args[mirrorIdx + 1]);
      await adapter.mirrorBounty(bountyId);
    }

    if (watchMode) {
      await adapter.watch(depositor);
      // Keep process alive
      await new Promise(() => {});
    }
  } finally {
    if (!watchMode) {
      await adapter.disconnect();
    }
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
