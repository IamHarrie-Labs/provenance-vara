/**
 * Provenance SDK — usage example
 *
 * Shows the complete happy path: create → deposit → (worker fulfills) → settle
 *
 * Key: payload_bytes and expected_reply use the Sails hash-based route encoding.
 * Use ProvenanceSpec.getNextId() for the built-in verifier, or
 * ProvenanceSpec.fromDryRun() for any custom Sails method.
 */
import { Provenance, ProvenanceSpec, VARA, PROVENANCE_PROGRAM_ID } from "./src";
import { GearKeyring } from "@gear-js/api";

async function main() {
  // Load accounts (in production, use your agent's keyring)
  const depositor = await GearKeyring.fromSuri("//Alice");
  const worker = await GearKeyring.fromSuri("//Bob");

  // ─── 3-line integration ───────────────────────────────────────────────────

  const provenance = await Provenance(depositor);

  // Get current next_id to build the verifier spec
  const currentNextId = await provenance.getNextId(); // e.g. 42n
  const expectedAfterCreate = currentNextId + 1n;     // will be 43n after CreateSettlement

  const settlement = await provenance.create({
    worker: worker.address as `0x${string}`,
    amount: 5n * VARA,
    // Prove that GetNextId() on Provenance returns expectedAfterCreate
    // → verifies at least one settlement was created (our own)
    proof: ProvenanceSpec.getNextId(PROVENANCE_PROGRAM_ID, expectedAfterCreate),
  });

  await settlement.deposit();   // Lock 5 VARA in escrow

  // --- worker does their work (calls ClaimCompletion from worker's account) ---
  // await settlement.claimCompletion();  // called by worker

  const outcome = await settlement.settle(); // Verify + release atomically
  console.log("Settlement outcome:", outcome);
  // → "Settled"      (funds released to worker — work proven)
  // → "Refunded"     (deadline passed, funds back to depositor)
  // → "StillPending" (wrong result but deadline not yet passed — retry later)

  // ─── Custom verifier: target any Sails program + method ──────────────────
  //
  // 1. Get payload bytes via:
  //    vara-wallet ... call <programId> Service/Method --args '[...]' --dry-run
  //    → extract encodedPayload from JSON
  //
  // 2. Compute expected reply:
  //    expectedReply = encodedPayload + SCALE_encode(expectedReturnValue)
  //
  const customSpec = ProvenanceSpec.fromDryRun(
    "0xYOUR_TARGET_PROGRAM" as `0x${string}`,
    "0x474d01101c8bbcde96230a9d04000100",  // from --dry-run encodedPayload
    ProvenanceSpec.scaleU64(99n)           // SCALE-encode expected return value
  );
  console.log("Custom spec payload length:", customSpec.payloadBytes.length);

  // ─── Registry queries (free, no gas) ─────────────────────────────────────

  const stats = await provenance.stats();
  console.log(`Network: ${stats.total} settlements, ${stats.active} active, ${stats.settled} completed`);

  const mySettlements = await provenance.getByDepositor(depositor.address as `0x${string}`);
  console.log("My settlement IDs:", mySettlements);

  await provenance.disconnect();
}

main().catch(console.error);
