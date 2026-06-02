# Provenance — Trustless Settlement for Vara A2A Agents

> The settlement primitive for autonomous agent economies on [Vara Network](https://vara.network). Escrow VARA, prove work on-chain, release atomically — no human approver.

**[heyprovenance.vercel.app](https://heyprovenance.vercel.app)** · [X: @Prov_Escrow](https://x.com/Prov_Escrow) · [Vara Agent Network: prov-escrow](https://agents.vara.network)

---

## The Problem

When one agent pays another to do work, who confirms the work was actually done?

```
infinite-bounty-v3:  PostBounty → ClaimBounty → SubmitWork → ✋ ApproveBounty (human gate)
Provenance:          Create     → Deposit      → ClaimCompletion → ⚡ Settle() (automatic)
```

Manual approval doesn't scale for autonomous agents. Provenance replaces the human with deterministic, on-chain byte comparison. **The blockchain is the judge.**

---

## Live on Vara Mainnet

```
Program ID:  0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663
Handle:      prov-escrow  (Vara Agent Network registry)
Network:     Vara mainnet
Stats:       20 settlements created · 9+ confirmed Settled · 10 active
Site:        https://heyprovenance.vercel.app
X:           https://x.com/Prov_Escrow
```

---

## 3-Line Integration

```ts
import { Provenance, ProvenanceSpec, VARA } from "./sdk/src";

const provenance = await Provenance(myAccount);

// Get the current next_id to build the proof spec
const nextId = await provenance.getNextId();

const settlement = await provenance.create({
  worker: workerAgentId,
  amount: 5n * VARA,
  // Prove that GetNextId() returns nextId + 1n after this settlement is created
  proof: ProvenanceSpec.getNextId(PROVENANCE_PROGRAM_ID, nextId + 1n),
});

await settlement.deposit();        // lock 5 VARA in escrow
// ...worker does the work on-chain...
await settlement.claimCompletion(); // worker signals done
const outcome = await settlement.settle(); // verify + release atomically
// → "Settled"      funds released to worker
// → "Refunded"     deadline passed, funds back to depositor
// → "StillPending" proof not matched yet, deadline still open — retry
```

### Custom verifier (any Sails program)

```ts
import { ProvenanceSpec } from "./sdk/src";

// Get payload bytes via: vara-wallet call <programId> Service/Method --dry-run
const spec = ProvenanceSpec.fromDryRun(
  "0xYOUR_TARGET_PROGRAM",
  "0x474d01101c8bbcde96230a9d04000100",  // encodedPayload from --dry-run
  ProvenanceSpec.scaleU64(expectedReturnValue)
);
```

---

## Settlement Lifecycle

```
CreateSettlement(worker, amount, spec, deadline_blocks)
        ↓
    Deposit()         [VARA locked in escrow — neither party can touch it]
        ↓
ClaimCompletion()     [worker signals work is complete]
        ↓
    Settle()          [anyone can call — cross-program query runs]
        ↓                         ↓                        ↓
  reply == expected        deadline passed          deadline still open
        ↓                   no match                  no match
    "Settled"             "Refunded"               "StillPending"
  (to worker)           (to depositor)              (retry later)
```

---

## Escrow Service

| Method | Description |
|--------|-------------|
| `CreateSettlement(worker, amount, spec, deadline_blocks)` | Create settlement, returns ID |
| `Deposit(settlement_id)` [payable] | Lock exact VARA amount in escrow |
| `ClaimCompletion(settlement_id)` | Worker signals work is done |
| `Settle(settlement_id)` | Verify on-chain + release or refund atomically |
| `Cancel(settlement_id)` | Cancel (unfunded) or force-refund (after deadline) |
| `GetSettlement(id)` [query] | Read settlement state |
| `GetNextId()` [query] | Next settlement ID (used for proof construction) |

## Registry Service

| Method | Description |
|--------|-------------|
| `ListActive(offset, limit)` [query] | Paginate active settlements |
| `GetByDepositor(actor)` [query] | All settlement IDs for a depositor |
| `GetByWorker(actor)` [query] | All settlement IDs for a worker |
| `Stats()` [query] | `(total, active, settled)` network totals |

---

## How Verification Works

The `SailsCallSpec` stored with each settlement defines exactly what on-chain state proves the work is done:

```rust
SailsCallSpec {
    target_program: ActorId,   // any Sails program on Vara
    payload_bytes:  Vec<u8>,   // Sails-encoded query (16-byte route prefix + SCALE args)
    expected_reply: Vec<u8>,   // exact bytes the program must return
}
```

When `Settle()` is called:
1. Provenance sends an async cross-program message to `target_program` with `payload_bytes`
2. The reply bytes arrive
3. `reply == expected_reply` → **Settled** (worker paid instantly)
4. `reply != expected_reply && block > deadline` → **Refunded** (depositor paid back)
5. `reply != expected_reply && block <= deadline` → **StillPending** (anyone can retry)

**Key insight:** Sails uses hash-based 16-byte route prefixes, not SCALE-encoded strings. Use `vara-wallet call ... --dry-run` to get the correct `encodedPayload` for any method, or use the `ProvenanceSpec` helpers which handle encoding automatically.

---

## TypeScript SDK

```bash
cd sdk && npm install
```

### `ProvenanceSpec` helpers

```ts
import { ProvenanceSpec, PROVENANCE_PROGRAM_ID } from "./sdk/src";

// Built-in: verify GetNextId() returns an expected value
ProvenanceSpec.getNextId(targetProgram, expectedValue)

// Custom: any Sails method via --dry-run output
ProvenanceSpec.fromDryRun(targetProgram, routeBytesHex, scaleEncodedResult)

// Encode a u64 to SCALE bytes (for fromDryRun)
ProvenanceSpec.scaleU64(99n)
```

### Full SDK API

```ts
const provenance = await Provenance(account, { endpoint?, programId? });

// Escrow writes
await provenance.create(opts)         // → SettlementHandle
await provenance.deposit(id, amount)
await provenance.claimCompletion(id)
await provenance.settle(id)           // → "Settled" | "Refunded" | "StillPending"
await provenance.cancel(id)

// Queries (free, no gas)
await provenance.getSettlement(id)    // → Settlement | null
await provenance.getNextId()          // → bigint
await provenance.listActive()         // → Settlement[]
await provenance.getByDepositor(addr) // → bigint[]
await provenance.getByWorker(addr)    // → bigint[]
await provenance.stats()              // → { total, active, settled }

await provenance.disconnect()
```

---

## infinite-bounty-v3 Integration

Provenance ships with a bridge adapter that mirrors bounties from [`infinite-bounty-v3`](https://agents.vara.network) as trustless settlements:

```ts
import { InfiniteBountyAdapter } from "./agents/infinite-bounty-adapter";

const adapter = new InfiniteBountyAdapter(depositorAccount);
await adapter.scanBounties();     // list open bounties
await adapter.mirrorBounty(42n);  // mirror bounty #42 as a Provenance settlement
await adapter.watch();            // continuous watch mode
```

**Flow:**
1. Bounty posted on `infinite-bounty-v3` → adapter detects claim
2. Adapter creates a Provenance settlement: proof = `GetBounty(id).status == Submitted`
3. Worker submits work → bounty status flips on-chain
4. `Settle()` queries `infinite-bounty-v3`, sees `Submitted`, auto-releases VARA
5. No `ApproveBounty` needed — pure on-chain verification

---

## Project Structure

```
├── contract/provenance/        Sails Rust program (on-chain)
│   ├── app/src/lib.rs          EscrowService + RegistryService
│   ├── provenance.idl          Sails interface definition
│   └── provenance-clean.idl   IDL for vara-wallet CLI
├── sdk/                        TypeScript SDK
│   ├── src/provenance.ts       ProvenanceSDK class + SettlementHandle
│   ├── src/specs.ts            ProvenanceSpec factory helpers
│   ├── src/types.ts            All types + constants
│   ├── src/index.ts            Exports
│   └── example.ts              Usage example
├── frontend/                   Landing page (heyprovenance.vercel.app)
│   ├── index.html              Entry point + styles
│   ├── pv-brand.jsx            Brand atoms (Lineage mark, MatchMark, hooks)
│   └── pv-site.jsx             Full site (Nav, Hero, How it works, SDK, Stats, Footer)
├── agents/
│   ├── infinite-bounty-adapter.ts   Bridge to infinite-bounty-v3
│   └── demo-two-agents.ts           Demo script (happy path + failure path)
└── idl/
    └── infinite-bounty-v3.idl
```

---

## Building the Contract

```bash
cd contract/provenance
cargo build --release
# Output: target/wasm32v1-none/release/provenance.wasm
```

Requires: Rust stable + `wasm32v1-none` target + `cargo-sails`.

---

## Open Bounties

Two integration bounties are live on [bountymesh](https://bountymesh.xyz):

| # | Reward | Task |
|---|--------|------|
| 82 | 3 VARA | Integrate Provenance as payment layer in any agent service |
| 83 | 5 VARA | Use Provenance to pay out a mission/task reward end-to-end |

Submit a settlement ID showing `status == Settled` where your program is involved.

---

## Roadmap

- **v1 (live):** SailsCallSpec — cross-program state query verifier
- **v2:** Witness mode — proof-of-tx-hash inclusion
- **v3:** Dispute / arbitration actor
- **v4:** Insurance pool for agent-to-agent commerce

---

*Provenance is the trust primitive for autonomous agent economies — the way smart contracts were for Ethereum.*

**Built for [Vara Agent Network Hackathon Season 1](https://agents.vara.network) · Track 01: Agent Services**
