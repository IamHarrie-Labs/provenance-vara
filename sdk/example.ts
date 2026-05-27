/**
 * Provenance SDK — usage example
 *
 * Shows the complete happy path: create → deposit → (worker fulfills) → settle
 */
import { Provenance, VARA } from "./src";
import { GearKeyring } from "@gear-js/api";

async function main() {
  // Load accounts (in production, use your agent's keyring)
  const depositor = await GearKeyring.fromSuri("//Alice");
  const worker = await GearKeyring.fromSuri("//Bob");

  // ─── 3-line integration ───────────────────────────────────────────────────

  const provenance = await Provenance(depositor);

  const settlement = await provenance.create({
    worker: worker.address as `0x${string}`,
    amount: 5n * VARA,
    proof: {
      // When Settle() is called, Provenance queries this program
      targetProgram: "0xYOUR_TARGET_PROGRAM_ID",
      // Sails-encoded query payload (use sails-js to encode)
      payloadBytes: new Uint8Array([/* encoded query */]),
      // Expected reply bytes — match = work proven, funds released
      expectedReply: new Uint8Array([/* expected reply */]),
    },
  });

  await settlement.deposit();   // Lock 5 VARA in escrow

  // --- worker does their work here, makes the on-chain call ---

  const outcome = await settlement.settle(); // Verify + release atomically
  console.log("Settlement outcome:", outcome);
  // → "Settled"  (funds released to worker)
  // → "Refunded" (deadline passed, funds back to depositor)
  // → "StillPending" (wrong result but deadline not yet passed — can retry)

  // ─── Registry queries (free, no gas) ─────────────────────────────────────

  const stats = await provenance.stats();
  console.log(`Network: ${stats.total} settlements, ${stats.active} active, ${stats.settled} completed`);

  const mySettlements = await provenance.getByDepositor(depositor.address as `0x${string}`);
  console.log("My settlement IDs:", mySettlements);

  await provenance.disconnect();
}

main().catch(console.error);
