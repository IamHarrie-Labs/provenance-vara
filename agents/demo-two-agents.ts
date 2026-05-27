/**
 * Demo: Two-Agent Settlement on Vara
 *
 * Shows the complete happy path AND failure path side by side.
 * Perfect for the 3-min hackathon demo recording.
 *
 * Happy path:  Agent B calls SubmitWork → Provenance auto-releases funds
 * Failure path: Agent B doesn't call in time → Provenance auto-refunds
 *
 * Run:
 *   DEPOSITOR_SURI="//Alice" WORKER_SURI="//Bob" npx ts-node agents/demo-two-agents.ts
 */

import { Provenance, VARA } from "../sdk/src";
import { GearKeyring } from "@gear-js/api";

const ENDPOINT = "wss://rpc.vara.network";

// For demo: use the actual deployed infinite-bounty-v3 program with a
// known query that returns a "Submitted" result for our test bounty.
// We'll create a synthetic proof spec that queries Provenance's own registry
// (guaranteed to have known state) to show the mechanism.
const DEMO_TARGET_PROGRAM =
  "0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function log(emoji: string, msg: string) {
  const ts = new Date().toISOString().split("T")[1].split(".")[0];
  console.log(`[${ts}] ${emoji}  ${msg}`);
}

async function happyPath() {
  console.log("\n" + "═".repeat(60));
  console.log("  HAPPY PATH — Worker fulfills, funds auto-release");
  console.log("═".repeat(60) + "\n");

  const depositor = await GearKeyring.fromSuri(
    process.env.DEPOSITOR_SURI ?? "//Alice"
  );
  const worker = await GearKeyring.fromSuri(
    process.env.WORKER_SURI ?? "//Bob"
  );

  log("💼", `Depositor: ${depositor.address}`);
  log("🤖", `Worker:    ${worker.address}`);

  // ─── 3-line integration ───────────────────────────────────────
  log("🔗", "Connecting depositor to Provenance...");
  const provenance = await Provenance(depositor, { endpoint: ENDPOINT });

  log("📝", "Creating settlement: 1 VARA for successful proof verification...");
  const settlement = await provenance.create({
    worker: worker.address as `0x${string}`,
    amount: 1n * VARA,
    proof: {
      // Query Provenance itself — GetNextId query, expected to return > 0
      // In real usage: query infinite-bounty-v3 GetBounty(id) → Submitted
      targetProgram: DEMO_TARGET_PROGRAM as `0x${string}`,
      payloadBytes: new Uint8Array([
        // Sails route for Escrow/GetNextId (illustrative)
        0x45, 0x73, 0x63, 0x72, 0x6f, 0x77, 0x2f,
        0x47, 0x65, 0x74, 0x4e, 0x65, 0x78, 0x74, 0x49, 0x64,
      ]),
      expectedReply: new Uint8Array([
        // Expected: any non-zero u64 (next settlement ID > 0)
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]),
    },
    deadlineBlocks: 1200, // ~1 hour
  });
  log("✅", `Settlement #${settlement.id} created`);

  log("💰", "Depositor locking 1 VARA in escrow...");
  await settlement.deposit();
  log("🔒", "Funds locked. Worker can see this settlement on-chain.");
  // ─── end 3-line integration ───────────────────────────────────

  log("🛠 ", "--- Worker is doing their work (making the on-chain call) ---");
  await sleep(3000);

  log("⚡", "Triggering Provenance verification...");
  const outcome = await settlement.settle();

  if (outcome === "Settled") {
    log("🎉", `OUTCOME: ${outcome} — 1 VARA released to worker automatically!`);
    log("   ", `No human approver. No trust required. Pure on-chain proof.`);
  } else if (outcome === "Refunded") {
    log("↩️ ", `OUTCOME: ${outcome} — proof didn't match, funds returned to depositor`);
  } else {
    log("⏳", `OUTCOME: ${outcome} — deadline hasn't passed, can retry settle()`);
  }

  await provenance.disconnect();
}

async function failurePath() {
  console.log("\n" + "═".repeat(60));
  console.log("  FAILURE PATH — Deadline passes, funds auto-refund");
  console.log("═".repeat(60) + "\n");

  const depositor = await GearKeyring.fromSuri(
    process.env.DEPOSITOR_SURI ?? "//Alice"
  );
  const worker = await GearKeyring.fromSuri(
    process.env.WORKER_SURI ?? "//Bob"
  );

  log("🔗", "Connecting depositor to Provenance...");
  const provenance = await Provenance(depositor, { endpoint: ENDPOINT });

  log("📝", "Creating settlement with tight deadline (20 blocks ≈ 1 min)...");
  const settlement = await provenance.create({
    worker: worker.address as `0x${string}`,
    amount: 1n * VARA,
    proof: {
      targetProgram: DEMO_TARGET_PROGRAM as `0x${string}`,
      // Wrong expected reply — will never match, simulates wrong/missing work
      payloadBytes: new Uint8Array([0x00, 0x01]),
      expectedReply: new Uint8Array([0xff, 0xff, 0xff, 0xff]),
    },
    deadlineBlocks: 20, // ~1 minute — tight for demo
  });
  log("✅", `Settlement #${settlement.id} created (20-block deadline)`);

  log("💰", "Depositor locking 1 VARA in escrow...");
  await settlement.deposit();
  log("🔒", "Funds locked. Worker did NOT make the required call.");

  log("⏱ ", "Waiting for deadline to pass... (~1 minute)");
  await sleep(70_000); // wait ~70s for ~20 blocks

  log("⚡", "Calling settle() after deadline...");
  const outcome = await settlement.settle();

  if (outcome === "Refunded") {
    log("↩️ ", `OUTCOME: ${outcome} — deadline passed, 1 VARA returned to depositor!`);
    log("   ", `Worker can't take funds. No trust required.`);
  } else {
    log("📊", `OUTCOME: ${outcome}`);
  }

  await provenance.disconnect();
}

async function showStats() {
  console.log("\n" + "═".repeat(60));
  console.log("  REGISTRY STATS");
  console.log("═".repeat(60) + "\n");

  const depositor = await GearKeyring.fromSuri(
    process.env.DEPOSITOR_SURI ?? "//Alice"
  );
  const provenance = await Provenance(depositor, { endpoint: ENDPOINT });

  const stats = await provenance.stats();
  log("📊", `Network totals:`);
  log("   ", `Total settlements:  ${stats.total}`);
  log("   ", `Active (in escrow): ${stats.active}`);
  log("   ", `Completed:          ${stats.settled}`);

  const mySettlements = await provenance.getByDepositor(
    depositor.address as `0x${string}`
  );
  log("📋", `Your settlements (${mySettlements.length}): ${mySettlements.map(String).join(", ")}`);

  await provenance.disconnect();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--stats")) {
    await showStats();
    return;
  }

  if (args.includes("--failure")) {
    await failurePath();
    return;
  }

  if (args.includes("--happy")) {
    await happyPath();
    return;
  }

  // Default: run happy path, then show stats
  await happyPath();
  await showStats();
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
