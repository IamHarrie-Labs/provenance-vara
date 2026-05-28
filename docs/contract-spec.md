# Provenance — Contract Specification

## Overview

Verifiable settlement layer for Vara A2A agents. Agents escrow funds with a
deterministic proof spec; funds release only when the on-chain verifier confirms
the worker fulfilled the obligation.

## State

```
ProvenanceState
├── settlements: BTreeMap<u64, Settlement>
├── next_id: u64
└── settlements_by_depositor: BTreeMap<ActorId, Vec<u64>>
```

### Settlement

```rust
Settlement {
    id: u64,
    depositor: ActorId,          // funds source
    worker: ActorId,             // funds destination on success
    amount: u128,                // locked VARA (native)
    spec: SailsCallSpec,         // verification spec
    status: SettlementStatus,
    created_block: u32,
    deadline_block: u32,         // refund after this block if not verified
}
```

### SailsCallSpec (v1 — Observable State Verifier)

```rust
SailsCallSpec {
    target_program: ActorId,     // program whose state we query
    query_method: String,        // e.g. "Bounties/GetSubmission"
    query_args: Vec<u8>,         // SCALE-encoded query args
    expected_hash: [u8; 32],     // SHA-256 of expected SCALE-encoded result
}
```

v1 verification: when `Settle` is called, Provenance sends a cross-program
async query to `target_program.query_method(query_args)`. SHA-256 of the
returned bytes is compared against `expected_hash`. Match → release. No match
past deadline → refund.

### SettlementStatus

```rust
enum SettlementStatus {
    Pending,     // created, not funded
    Active,      // funded, awaiting ClaimCompletion
    Settling,    // Settle in-flight (async query pending)
    Settled,     // funds released to worker
    Refunded,    // funds returned to depositor
}
```

## Services

### EscrowService

| Method | Mutability | Description |
|---|---|---|
| `CreateSettlement(worker, amount, spec, deadline_blocks)` | `&mut self` | Create settlement, returns `settlement_id` |
| `Deposit(settlement_id)` `[payable]` | `&mut self` | Lock VARA against settlement |
| `ClaimCompletion(settlement_id)` | `&mut self` | Worker signals work done, triggers async verify |
| `Settle(settlement_id)` | `&mut self [async]` | Query target, release or hold |
| `Cancel(settlement_id)` | `&mut self` | Depositor cancels before funding or past deadline |
| `GetSettlement(id)` | `&self` | Read-only query |

### RegistryService (discovery)

| Method | Description |
|---|---|
| `ListActive(offset, limit)` | Paginated list of Active settlements |
| `GetByDepositor(actor)` | Settlement IDs for a depositor |
| `GetByWorker(actor)` | Settlement IDs for a worker |

### Events

```rust
enum EscrowEvent {
    Created { id: u64, depositor: ActorId, worker: ActorId, amount: u128, deadline_block: u32 },
    Deposited { id: u64, amount: u128 },
    CompletionClaimed { id: u64, worker: ActorId },
    Settled { id: u64, worker: ActorId, amount: u128 },
    Refunded { id: u64, depositor: ActorId, amount: u128, reason: String },
    Cancelled { id: u64 },
}
```

## Verification Flow

```
Depositor                  Provenance                  Target Program
    │                          │                              │
    │──CreateSettlement()──────►│                              │
    │◄──settlement_id───────────│                              │
    │──Deposit(id) + VARA──────►│ [funds locked]               │
    │                          │                              │
                 Worker does their work ──────────────────────►│
                                                              │ [state updated]
    │                          │◄──ClaimCompletion(id)─────── Worker
    │                          │                              │
    │                          │──query(query_method(args))──►│
    │                          │◄──result_bytes───────────────│
    │                          │ sha256(result) == expected?   │
    │                          │ YES → transfer to worker      │
    │                          │ NO + past deadline → refund   │
    │◄──events (Settled|Refunded)│                              │
```

## Access Control

- `CreateSettlement`: any actor
- `Deposit`: any actor (becomes verified depositor for that settlement)
- `ClaimCompletion`: only `settlement.worker`
- `Cancel`: only `settlement.depositor`, only in `Pending` or past `deadline_block`
- `Settle`: any actor can trigger (permissionless settlement)
- All read methods: any actor

## Call Multiplication per Lifecycle

Each settlement generates 4–6 cross-program calls:
1. `CreateSettlement` → Provenance write
2. `Deposit` → Provenance payable write
3. Worker calls target program (external)
4. `ClaimCompletion` → Provenance write
5. `Settle` → Provenance async read of target
6. Receipt event emission

## Future: Insurance Layer (roadmap slide)

An `InsurancePool` actor that:
- Accepts premium payments on `Deposit`
- Pays out when a settlement is Refunded due to verified fraud
- Requires witness attestation for fraud proof

Not in v1. Pitch narrative only.
