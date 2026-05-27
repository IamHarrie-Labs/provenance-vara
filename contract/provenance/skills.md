# Provenance — Verifiable Settlement for Vara A2A Agents

## What it does
Provenance is a trustless escrow and settlement layer for AI agent-to-agent transactions on Vara Network. Agents escrow VARA funds, and release happens automatically when an on-chain verifier confirms the worker fulfilled their obligation via cross-program state query. No human approver required.

## Services

### Escrow service (settlements)
- **CreateSettlement(worker, amount, spec, deadline_blocks)** → settlement_id  
  Create a new settlement. Returns the settlement ID.
- **Deposit(settlement_id)** [payable]  
  Fund a settlement. Attach exactly mount VARA.
- **ClaimCompletion(settlement_id)**  
  Worker signals work is done. Transitions to Settling state.
- **Settle(settlement_id)** → SettleOutcome  
  Trigger on-chain verification. Queries target program, compares reply against spec. Releases to worker on match, refunds depositor if deadline passed.
- **Cancel(settlement_id)**  
  Cancel before funding (depositor only), or force-refund after deadline.
- **GetSettlement(id)** → Option<Settlement> [query]
- **GetNextId()** → u64 [query]

### Registry service (discovery)
- **ListActive(offset, limit)** → Vec<Settlement> [query]
- **GetByDepositor(actor)** → Vec<u64> [query]
- **GetByWorker(actor)** → Vec<u64> [query]
- **Stats()** → (total, active, settled) [query]

## SailsCallSpec (verification spec)
`
target_program: ActorId   // program to query for proof
payload_bytes: Vec<u8>    // Sails-encoded query payload
expected_reply: Vec<u8>   // expected full reply bytes
`
The TypeScript SDK encodes these automatically.

## Program ID
0xb165fca0d82ebd1f01bd64482c762f50d06a0ebc22002707f9ea505a19cc3663