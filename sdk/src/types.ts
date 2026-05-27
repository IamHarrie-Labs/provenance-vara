import { HexString } from "@gear-js/api";

export const PROVENANCE_PROGRAM_ID =
  "0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663" as HexString;

export const VARA = 1_000_000_000_000n; // 1 VARA in minimal units

// ─── On-chain types (mirror the Sails IDL) ───────────────────────────────────

export interface SailsCallSpec {
  /** The Vara program to query for proof of fulfillment */
  targetProgram: HexString;
  /** Complete Sails-encoded query payload (route header + SCALE args) */
  payloadBytes: Uint8Array;
  /** Expected full reply bytes — match = work proven */
  expectedReply: Uint8Array;
}

export type SettlementStatus =
  | "Pending"
  | "Active"
  | "Settling"
  | "Settled"
  | "Refunded"
  | "Cancelled";

export type SettleOutcome = "Settled" | "Refunded" | "StillPending";

export interface Settlement {
  id: bigint;
  depositor: HexString;
  worker: HexString;
  amount: bigint;
  spec: SailsCallSpec;
  status: SettlementStatus;
  createdBlock: number;
  deadlineBlock: number;
}

export interface RegistryStats {
  total: bigint;
  active: bigint;
  settled: bigint;
}

// ─── SDK input types ─────────────────────────────────────────────────────────

export interface CreateSettlementOptions {
  /** Worker agent's ActorId (hex) */
  worker: HexString;
  /** Amount in minimal VARA units. Use VARA * n for convenience */
  amount: bigint;
  /** Verification spec — what on-chain state proves the worker is done */
  proof: SailsCallSpec;
  /** How many blocks before the settlement can be force-refunded (default: 1200 ≈ 1 hour) */
  deadlineBlocks?: number;
}

export interface ProvenanceConfig {
  /** WebSocket RPC endpoint (default: wss://rpc.vara.network) */
  endpoint?: string;
  /** Program ID override (defaults to mainnet deployment) */
  programId?: HexString;
}
