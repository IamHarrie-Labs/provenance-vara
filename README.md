# Provenance — Verifiable Settlement for Vara A2A Agents

> Trustless escrow and settlement infrastructure for AI agent-to-agent transactions on [Vara Network](https://vara.network).

## What it does

Agents escrow VARA funds. Funds release **automatically** when an on-chain verifier confirms the worker fulfilled their obligation — no human approver, no trust required.

**The gap:** `infinite-bounty-v3` uses manual approval. Manual doesn't scale for autonomous agents. Provenance replaces the human approver with cryptographic, deterministic, on-chain proof.

```
infinite-bounty-v3:  PostBounty → ClaimBounty → SubmitWork → ✋ ApproveBounty (human)
Provenance:          Create     → Deposit      → [work done] → ⚡ Settle() (automatic)
```

## Live on Vara Mainnet

```
Program ID:  0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663
Handle:      prov-escrow  (Vara Agent Network registry)
Network:     Vara mainnet
```

## 3-Line Integration (TypeScript SDK)

```ts
import { Provenance, VARA } from "./sdk/src";

const provenance = await Provenance(myAccount);

const settlement = await provenance.create({
  worker: workerAgentId,
  amount: 5n * VARA,
  proof: {
    // Provenance queries this program to verify work
    targetProgram: "0xYOUR_TARGET_PROGRAM",
    // Sails-encoded query payload (route + SCALE args)
    payloadBytes: encodedQuery,
    // Expected reply bytes — match = work proven, funds released
    expectedReply: encodedExpectedReply,
  },
});

await settlement.deposit();   // lock 5 VARA in escrow
// ...worker does the work, makes their on-chain call...
const outcome = await settlement.settle(); // verify + release atomically
// → "Settled"      (funds released to worker)
// → "Refunded"     (deadline passed, funds back to depositor)
// → "StillPending" (wrong proof but deadline not passed — retry)
```

## infinite-bounty-v3 Integration

Provenance ships with a bridge adapter that connects to [`infinite-bounty-v3`](https://agents-api.vara.network/graphql) (`0x747d09...`):

```ts
import { InfiniteBountyAdapter } from "./agents/infinite-bounty-adapter";

// Scan open bounties
await adapter.scanBounties();

// Mirror a claimed bounty as a Provenance settlement
// Proof: GetBounty(id) returns status == Submitted
await adapter.mirrorBounty(42n);

// Watch for new claims and auto-mirror them
await adapter.watch(depositorAccount);
```

**How it works:**
1. Agent A posts a bounty on infinite-bounty-v3 (`PostBounty`)
2. Agent B claims it (`ClaimBounty`) → adapter detects the claim
3. Adapter creates a parallel Provenance settlement with proof spec:
   - Target: `infinite-bounty-v3` program
   - Query: `GetBounty(id)` — reads on-chain state
   - Expected: bounty status == `Submitted`
4. Agent B submits work (`SubmitWork`) → bounty status changes on-chain
5. Provenance `Settle()` queries infinite-bounty-v3, sees `Submitted`, auto-releases VARA
6. **No manual `ApproveBounty` needed** — pure on-chain verification

```bash
# Demo commands
npm run adapter:scan          # list open bounties
npm run adapter:mirror 42     # mirror bounty #42
npm run adapter:watch         # continuous watch mode

# Two-agent demo
npm run demo:happy    # worker fulfills → funds auto-released
npm run demo:failure  # deadline passes → funds auto-refunded
npm run demo:stats    # network totals
```

## Settlement Lifecycle

```
CreateSettlement
      ↓
   Deposit  [funds locked in escrow]
      ↓
ClaimCompletion  [worker signals done]
      ↓
   Settle()  ──→  cross-program query to target_program
      ↓                    ↓
  reply == expected   reply != expected + deadline passed
      ↓                    ↓
  "Settled"           "Refunded"
  (to worker)         (to depositor)
```

## Escrow Service

| Method | Description |
|--------|-------------|
| `CreateSettlement(worker, amount, spec, deadline_blocks)` | Create settlement, returns ID |
| `Deposit(settlement_id)` [payable] | Lock exact VARA amount in escrow |
| `ClaimCompletion(settlement_id)` | Worker signals work is done |
| `Settle(settlement_id)` | Verify on-chain + release or refund atomically |
| `Cancel(settlement_id)` | Cancel (unfunded) or force-refund (after deadline) |
| `GetSettlement(id)` [query] | Read settlement state |
| `GetNextId()` [query] | Next settlement ID |

## Registry Service

| Method | Description |
|--------|-------------|
| `ListActive(offset, limit)` [query] | Paginate active settlements |
| `GetByDepositor(actor)` [query] | All settlement IDs for a depositor |
| `GetByWorker(actor)` [query] | All settlement IDs for a worker |
| `Stats()` [query] | `(total, active, settled)` network totals |

## Verifier v1: SailsCallSpec

```rust
SailsCallSpec {
    target_program: ActorId,   // program to query for proof of fulfillment
    payload_bytes:  Vec<u8>,   // Sails-encoded query payload (route + SCALE args)
    expected_reply: Vec<u8>,   // expected full reply bytes — match = work proven
}
```

When `Settle()` is called, Provenance sends an async cross-program message to `target_program` with `payload_bytes` and compares the reply to `expected_reply`. Exact match → release. No match and deadline passed → refund. No match and deadline still open → StillPending (can retry).

## Project Structure

```
├── contract/provenance/    Sails Rust program (on-chain)
│   ├── app/src/lib.rs      EscrowService + RegistryService
│   ├── provenance.idl      Sails interface definition
│   └── provenance-clean.idl IDL for vara-wallet CLI
├── sdk/src/                TypeScript SDK
│   ├── provenance.ts       ProvenanceSDK + SettlementHandle
│   ├── types.ts            All types
│   └── index.ts            Exports
├── agents/
│   ├── infinite-bounty-adapter.ts  Bridge to infinite-bounty-v3
│   └── demo-two-agents.ts          Hackathon demo script
├── idl/
│   └── infinite-bounty-v3.idl
└── README.md
```

## Building the Contract

```bash
cd contract/provenance
cargo build --release
# Output: target/wasm-projects/release/wasm32v1-none/release/provenance.wasm
```

Requires: Rust stable + `wasm32v1-none` target + `cargo-sails`.

## Roadmap

- **v1 (live):** Cross-program state query verifier — SailsCallSpec
- **v2:** Witness mode (proof-of-tx-hash inclusion)
- **v3:** Dispute / arbitration actor
- **v4:** Insurance pool for agent-to-agent commerce

---

*Provenance is the settlement primitive for autonomous agent economies.*

**Built for [Vara Agent Network Hackathon Season 1](https://agents.vara.network) — Track 01: Agent Services.**
