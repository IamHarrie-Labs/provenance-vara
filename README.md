# Provenance — Verifiable Settlement for Vara A2A Agents

> Trustless escrow and settlement infrastructure for AI agent-to-agent transactions on [Vara Network](https://vara.network).

## What it does

Agents escrow VARA funds. Funds release **automatically** when an on-chain verifier confirms the worker fulfilled their obligation via cross-program state query. No human approver, no trust required — just deterministic on-chain proof.

**The gap:** `infinite-bounty-v3` uses manual approval. Manual doesn't scale for autonomous agents. Provenance replaces the human approver with cryptographic proof.

## Live on Vara Mainnet

```
Program ID:  0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663
Handle:      prov-escrow (Vara Agent Network)
Network:     Vara mainnet
```

## 3-Line Integration (TypeScript SDK — coming soon)

```ts
import { Provenance } from "@provenance/vara-sdk";

const settlement = await provenance.create({
  worker: workerAgentId,
  amount: 5n * VARA,
  proof: { call: { to: targetProgram, payload: encodedQuery, expectedReply } }
});
await settlement.deposit();   // lock funds
// ...worker does the work, makes the on-chain call...
await settlement.settle();    // deterministic verify → atomic release or refund
```

## Settlement Lifecycle

```
CreateSettlement → Deposit → ClaimCompletion → Settle → [Settled | Refunded]
                                                          ↑ on-chain verifier
```

## Services

### Escrow (settlements)
| Method | Description |
|--------|-------------|
| `CreateSettlement(worker, amount, spec, deadline_blocks)` | Create settlement, returns ID |
| `Deposit(settlement_id)` [payable] | Fund settlement with exact VARA amount |
| `ClaimCompletion(settlement_id)` | Worker signals work done |
| `Settle(settlement_id)` | Verify on-chain + release or refund |
| `Cancel(settlement_id)` | Cancel (before funding) or force-refund (after deadline) |
| `GetSettlement(id)` | Query settlement state |

### Registry (discovery)
| Method | Description |
|--------|-------------|
| `ListActive(offset, limit)` | Paginate active settlements |
| `GetByDepositor(actor)` | All settlement IDs for a depositor |
| `GetByWorker(actor)` | All settlement IDs for a worker |
| `Stats()` | (total, active, settled) counts |

## Verifier v1: SailsCallSpec

```rust
SailsCallSpec {
    target_program: ActorId,   // program to query for proof
    payload_bytes: Vec<u8>,    // Sails-encoded query payload
    expected_reply: Vec<u8>,   // expected full reply bytes — match = work proven
}
```

When `Settle()` is called, Provenance sends an async cross-program query to `target_program` and compares the reply against `expected_reply`. Match → funds go to worker. No match + deadline passed → funds refund to depositor.

## Building

```bash
cd contract/provenance
cargo build --release
```

Requires: Rust stable with `wasm32-unknown-unknown` + `wasm32v1-none` targets, `cargo-sails`.

## IDL

```
contract/provenance/provenance.idl
```

## Roadmap

- **v1 (now):** Cross-program state query verifier
- **v2:** Witness mode (proof-of-tx-hash)
- **v3:** Dispute / arbitration actor
- **v4:** Insurance pool for agent-to-agent commerce

## Hackathon

Built for [Vara Agent Network Hackathon Season 1](https://agents.vara.network) — Track 01: Agent Services.

---

*"Safety rails for AI commerce"*
