/// Provenance — Verifiable Settlement Layer for Vara A2A Network
///
/// This is the draft app/src/lib.rs to be placed into the cargo-sails scaffolded workspace.
/// Run `cargo sails new provenance` first, then replace app/src/lib.rs with this content.

use core::cell::RefCell;
use sails_rs::collections::BTreeMap;
use sails_rs::gstd::{exec, msg};
use sails_rs::prelude::*;

// ─── State ───────────────────────────────────────────────────────────────────

static STATE: RefCell<ProvenanceState> = RefCell::new(ProvenanceState::new());

pub struct ProvenanceState {
    pub settlements: BTreeMap<u64, Settlement>,
    pub next_id: u64,
    pub by_depositor: BTreeMap<ActorId, Vec<u64>>,
    pub by_worker: BTreeMap<ActorId, Vec<u64>>,
}

impl ProvenanceState {
    pub const fn new() -> Self {
        Self {
            settlements: BTreeMap::new(),
            next_id: 0,
            by_depositor: BTreeMap::new(),
            by_worker: BTreeMap::new(),
        }
    }
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[sails_rs::sails_type]
#[derive(Clone, Debug)]
pub struct Settlement {
    pub id: u64,
    pub depositor: ActorId,
    pub worker: ActorId,
    /// Amount in minimal VARA units (10^12 per VARA)
    pub amount: u128,
    pub spec: SailsCallSpec,
    pub status: SettlementStatus,
    pub created_block: u32,
    pub deadline_block: u32,
}

/// v1 verifier: cross-program state query.
/// When Settle is called, Provenance sends a query to target_program's
/// query_method with query_args, and compares the SCALE-encoded result bytes
/// against expected_result bytes. Match → release. No match + past deadline → refund.
#[sails_rs::sails_type]
#[derive(Clone, Debug)]
pub struct SailsCallSpec {
    /// The Vara program whose state we query to verify fulfillment
    pub target_program: ActorId,
    /// e.g. "Bounties/GetSubmission" — the Sails service/method route
    pub query_method: String,
    /// SCALE-encoded args for the query call
    pub query_args: Vec<u8>,
    /// Expected SCALE-encoded return bytes — if result matches, work is proven
    pub expected_result: Vec<u8>,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq)]
pub enum SettlementStatus {
    /// Created, not yet funded
    Pending,
    /// Funded, awaiting ClaimCompletion
    Active,
    /// ClaimCompletion submitted, Settle pending
    Settling,
    /// Funds released to worker
    Settled,
    /// Funds returned to depositor
    Refunded,
    /// Cancelled before funding
    Cancelled,
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[sails_rs::event]
#[sails_rs::sails_type]
pub enum EscrowEvent {
    Created {
        id: u64,
        depositor: ActorId,
        worker: ActorId,
        amount: u128,
        deadline_block: u32,
    },
    Deposited {
        id: u64,
        amount: u128,
    },
    CompletionClaimed {
        id: u64,
        worker: ActorId,
    },
    Settled {
        id: u64,
        worker: ActorId,
        amount: u128,
    },
    Refunded {
        id: u64,
        depositor: ActorId,
        amount: u128,
        reason: String,
    },
    Cancelled {
        id: u64,
    },
}

// ─── EscrowService ────────────────────────────────────────────────────────────

pub struct EscrowService(());

#[service(events = EscrowEvent)]
impl EscrowService {
    /// Create a new settlement. Returns the settlement_id.
    /// `deadline_blocks` — number of blocks from now until auto-refund is possible.
    #[export]
    pub fn create_settlement(
        &mut self,
        worker: ActorId,
        amount: u128,
        spec: SailsCallSpec,
        deadline_blocks: u32,
    ) -> u64 {
        let state = unsafe { &mut *STATE.as_ptr() };
        let id = state.next_id;
        state.next_id += 1;

        let current_block = exec::block_height();
        let deadline_block = current_block + deadline_blocks;
        let depositor = msg::source();

        state.settlements.insert(
            id,
            Settlement {
                id,
                depositor,
                worker,
                amount,
                spec,
                status: SettlementStatus::Pending,
                created_block: current_block,
                deadline_block,
            },
        );

        state.by_depositor.entry(depositor).or_default().push(id);
        state.by_worker.entry(worker).or_default().push(id);

        self.emit_event(EscrowEvent::Created {
            id,
            depositor,
            worker,
            amount,
            deadline_block,
        })
        .expect("Event emit failed");

        id
    }

    /// Deposit VARA to activate the settlement. Value attached to this message
    /// must exactly equal `settlement.amount`.
    #[export(payable)]
    pub fn deposit(&mut self, settlement_id: u64) {
        let state = unsafe { &mut *STATE.as_ptr() };
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        assert!(
            settlement.status == SettlementStatus::Pending,
            "InvalidStatus"
        );

        let value = msg::value();
        assert!(value >= settlement.amount, "InsufficientDeposit");

        // Refund excess
        if value > settlement.amount {
            let excess = value - settlement.amount;
            msg::send(settlement.depositor, (), excess).expect("Refund failed");
        }

        settlement.status = SettlementStatus::Active;

        self.emit_event(EscrowEvent::Deposited {
            id: settlement_id,
            amount: settlement.amount,
        })
        .expect("Event emit failed");
    }

    /// Worker signals work is done. Transitions status to Settling.
    /// Anyone can then call Settle to trigger the on-chain verification.
    #[export]
    pub fn claim_completion(&mut self, settlement_id: u64) {
        let state = unsafe { &mut *STATE.as_ptr() };
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        assert_eq!(msg::source(), settlement.worker, "Unauthorized");
        assert!(
            settlement.status == SettlementStatus::Active,
            "InvalidStatus"
        );

        let worker = settlement.worker;
        settlement.status = SettlementStatus::Settling;

        self.emit_event(EscrowEvent::CompletionClaimed {
            id: settlement_id,
            worker,
        })
        .expect("Event emit failed");
    }

    /// Settle: send async query to target_program, compare result, release or refund.
    /// This is async — Gear suspends execution until the cross-program reply arrives.
    /// Anyone can call this once ClaimCompletion has been submitted.
    #[export]
    pub async fn settle(&mut self, settlement_id: u64) {
        let (target_program, query_method, query_args, expected_result, worker, depositor, amount, deadline_block) = {
            let state = unsafe { &mut *STATE.as_ptr() };
            let s = state
                .settlements
                .get_mut(&settlement_id)
                .expect("SettlementNotFound");
            assert!(
                s.status == SettlementStatus::Settling,
                "InvalidStatus"
            );
            (
                s.spec.target_program,
                s.spec.query_method.clone(),
                s.spec.query_args.clone(),
                s.spec.expected_result.clone(),
                s.worker,
                s.depositor,
                s.amount,
                s.deadline_block,
            )
        };

        // Build the Sails-encoded query message: [service/method header] + SCALE args
        // The method route is encoded as the method name bytes prefixed with service name.
        // In Sails wire format: encode_route(query_method) ++ query_args
        // For v1 we pass the raw query_args as-is (caller is responsible for correct encoding)
        let payload = encode_sails_payload(&query_method, &query_args);

        // Send cross-program query and await reply
        let reply_result = msg::send_bytes_for_reply(target_program, payload, 0, 0)
            .expect("Send failed")
            .await;

        let current_block = exec::block_height();
        let state = unsafe { &mut *STATE.as_ptr() };
        let settlement = state.settlements.get_mut(&settlement_id).expect("SettlementNotFound");

        match reply_result {
            Ok(reply_bytes) => {
                // Strip the Sails route header from the reply (first N bytes are method route)
                let result_bytes = strip_sails_route_header(&reply_bytes, &query_method);

                if result_bytes == expected_result {
                    // Work verified — release to worker
                    settlement.status = SettlementStatus::Settled;
                    msg::send(worker, (), amount).expect("Transfer failed");
                    self.emit_event(EscrowEvent::Settled {
                        id: settlement_id,
                        worker,
                        amount,
                    })
                    .expect("Event emit failed");
                } else if current_block >= deadline_block {
                    // Wrong result + deadline passed — refund depositor
                    settlement.status = SettlementStatus::Refunded;
                    msg::send(depositor, (), amount).expect("Refund failed");
                    self.emit_event(EscrowEvent::Refunded {
                        id: settlement_id,
                        depositor,
                        amount,
                        reason: "VerificationFailed".into(),
                    })
                    .expect("Event emit failed");
                }
                // else: wrong result but still within deadline — keep Settling, allow retry
            }
            Err(_) => {
                // Query failed — if past deadline, refund
                if current_block >= deadline_block {
                    settlement.status = SettlementStatus::Refunded;
                    msg::send(depositor, (), amount).expect("Refund failed");
                    self.emit_event(EscrowEvent::Refunded {
                        id: settlement_id,
                        depositor,
                        amount,
                        reason: "QueryFailed".into(),
                    })
                    .expect("Event emit failed");
                }
            }
        }
    }

    /// Cancel: depositor cancels before funding, or anyone cancels past deadline.
    #[export]
    pub fn cancel(&mut self, settlement_id: u64) {
        let state = unsafe { &mut *STATE.as_ptr() };
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        let caller = msg::source();
        let current_block = exec::block_height();

        match settlement.status {
            SettlementStatus::Pending => {
                assert_eq!(caller, settlement.depositor, "Unauthorized");
                settlement.status = SettlementStatus::Cancelled;
            }
            SettlementStatus::Active | SettlementStatus::Settling => {
                // Only depositor can cancel, only past deadline
                assert_eq!(caller, settlement.depositor, "Unauthorized");
                assert!(current_block > settlement.deadline_block, "DeadlineNotPassed");
                let amount = settlement.amount;
                let depositor = settlement.depositor;
                settlement.status = SettlementStatus::Refunded;
                msg::send(depositor, (), amount).expect("Refund failed");
                self.emit_event(EscrowEvent::Refunded {
                    id: settlement_id,
                    depositor,
                    amount,
                    reason: "Cancelled".into(),
                })
                .expect("Event emit failed");
                return;
            }
            _ => panic!("InvalidStatus"),
        }

        self.emit_event(EscrowEvent::Cancelled { id: settlement_id })
            .expect("Event emit failed");
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    #[export]
    pub fn get_settlement(&self, id: u64) -> Option<Settlement> {
        let state = unsafe { &*STATE.as_ptr() };
        state.settlements.get(&id).cloned()
    }
}

// ─── RegistryService ──────────────────────────────────────────────────────────

pub struct RegistryService(());

#[service]
impl RegistryService {
    #[export]
    pub fn list_active(&self, offset: u64, limit: u64) -> Vec<Settlement> {
        let state = unsafe { &*STATE.as_ptr() };
        state
            .settlements
            .values()
            .filter(|s| s.status == SettlementStatus::Active || s.status == SettlementStatus::Settling)
            .skip(offset as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }

    #[export]
    pub fn get_by_depositor(&self, actor: ActorId) -> Vec<u64> {
        let state = unsafe { &*STATE.as_ptr() };
        state.by_depositor.get(&actor).cloned().unwrap_or_default()
    }

    #[export]
    pub fn get_by_worker(&self, actor: ActorId) -> Vec<u64> {
        let state = unsafe { &*STATE.as_ptr() };
        state.by_worker.get(&actor).cloned().unwrap_or_default()
    }

    #[export]
    pub fn stats(&self) -> (u64, u64, u64) {
        let state = unsafe { &*STATE.as_ptr() };
        let total = state.next_id;
        let active = state.settlements.values()
            .filter(|s| s.status == SettlementStatus::Active || s.status == SettlementStatus::Settling)
            .count() as u64;
        let settled = state.settlements.values()
            .filter(|s| s.status == SettlementStatus::Settled)
            .count() as u64;
        (total, active, settled)
    }
}

// ─── Program ─────────────────────────────────────────────────────────────────

pub struct ProvenanceProgram(());

#[program]
impl ProvenanceProgram {
    pub fn new() -> Self {
        Self(())
    }

    pub fn escrow(&self) -> EscrowService {
        EscrowService(())
    }

    pub fn registry(&self) -> RegistryService {
        RegistryService(())
    }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/// Encode a Sails method route + raw args into a single payload Vec<u8>.
/// Sails wire format: SCALE-encoded method route string ++ raw args bytes.
/// For a route like "Bounties/GetSubmission", encode as SCALE string then append args.
fn encode_sails_payload(route: &str, args: &[u8]) -> Vec<u8> {
    use sails_rs::scale_codec::Encode;
    let mut payload = route.encode();
    payload.extend_from_slice(args);
    payload
}

/// Strip the Sails route header echo from a reply.
/// Sails reply payloads prefix the reply with the route string echo.
/// This is a best-effort strip — verify against actual reply format in testing.
fn strip_sails_route_header(reply: &[u8], route: &str) -> Vec<u8> {
    use sails_rs::scale_codec::Encode;
    let header = route.encode();
    if reply.starts_with(&header) {
        reply[header.len()..].to_vec()
    } else {
        reply.to_vec()
    }
}
