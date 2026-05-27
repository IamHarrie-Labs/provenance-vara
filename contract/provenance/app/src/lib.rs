#![no_std]

use core::cell::RefCell;
use gstd::{exec, msg};
use sails_rs::collections::BTreeMap;
use sails_rs::prelude::*;

// ─── State ───────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct ProvenanceState {
    pub settlements: BTreeMap<u64, Settlement>,
    pub next_id: u64,
    pub by_depositor: BTreeMap<ActorId, Vec<u64>>,
    pub by_worker: BTreeMap<ActorId, Vec<u64>>,
}

// ─── Types ────────────────────────────────────────────────────────────────────

#[sails_rs::sails_type]
#[derive(Clone, Debug)]
pub struct Settlement {
    pub id: u64,
    pub depositor: ActorId,
    pub worker: ActorId,
    /// Locked amount in minimal VARA units (1 VARA = 10^12)
    pub amount: u128,
    pub spec: SailsCallSpec,
    pub status: SettlementStatus,
    pub created_block: u32,
    pub deadline_block: u32,
}

/// v1 Verifier: cross-program observable state query.
///
/// When `Settle` is called, Provenance sends `payload_bytes` to `target_program`
/// and compares the full reply bytes against `expected_reply`. A match proves
/// the worker fulfilled the obligation.
///
/// Callers are responsible for encoding `payload_bytes` in the Sails wire
/// format (route header + SCALE args) and encoding `expected_reply` to match
/// the full reply the target program emits (route echo + result).
/// The TypeScript SDK handles this automatically.
#[sails_rs::sails_type]
#[derive(Clone, Debug)]
pub struct SailsCallSpec {
    /// The Vara program whose state we query to verify fulfillment
    pub target_program: ActorId,
    /// Complete Sails-encoded query payload (route header + SCALE args)
    pub payload_bytes: Vec<u8>,
    /// Expected full reply bytes from target — match = work proven
    pub expected_reply: Vec<u8>,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq)]
pub enum SettlementStatus {
    /// Created, not yet funded
    Pending,
    /// Funded, awaiting ClaimCompletion
    Active,
    /// ClaimCompletion submitted, Settle can be triggered
    Settling,
    /// Funds released to worker — terminal
    Settled,
    /// Funds returned to depositor — terminal
    Refunded,
    /// Cancelled before funding — terminal
    Cancelled,
}

#[sails_rs::sails_type]
#[derive(Clone, Debug, PartialEq)]
pub enum SettleOutcome {
    Settled,
    Refunded,
    StillPending, // wrong result but deadline not passed yet
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

pub struct EscrowService<'a> {
    state: &'a RefCell<ProvenanceState>,
}

#[sails_rs::service(events = EscrowEvent)]
impl EscrowService<'_> {
    /// Create a settlement. Returns `settlement_id`.
    /// `deadline_blocks` — blocks from now before a stalled settlement can be refunded.
    #[export]
    pub fn create_settlement(
        &mut self,
        worker: ActorId,
        amount: u128,
        spec: SailsCallSpec,
        deadline_blocks: u32,
    ) -> u64 {
        let state = &mut *self.state.borrow_mut();
        let id = state.next_id;
        state.next_id += 1;

        let current_block = exec::block_height();
        let deadline_block = current_block + deadline_blocks;
        let depositor = Syscall::message_source();

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
        .unwrap();

        id
    }

    /// Fund a settlement. The attached VARA value must equal `settlement.amount`.
    /// Excess is refunded to the caller.
    #[export]
    pub fn deposit(&mut self, settlement_id: u64) {
        let state = &mut *self.state.borrow_mut();
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

        // Refund excess value to depositor
        if value > settlement.amount {
            let excess = value - settlement.amount;
            msg::send(settlement.depositor, (), excess).expect("ExcessRefundFailed");
        }

        settlement.status = SettlementStatus::Active;

        self.emit_event(EscrowEvent::Deposited {
            id: settlement_id,
            amount: settlement.amount,
        })
        .unwrap();
    }

    /// Worker signals work is done. Transitions to Settling.
    /// After this, anyone can call `settle()` to trigger verification.
    #[export]
    pub fn claim_completion(&mut self, settlement_id: u64) {
        let state = &mut *self.state.borrow_mut();
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        assert_eq!(Syscall::message_source(), settlement.worker, "Unauthorized");
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
        .unwrap();
    }

    /// Trigger on-chain verification. Sends async query to target_program,
    /// compares reply against spec. Releases to worker on match, or refunds
    /// depositor if deadline has passed. Anyone can call this.
    #[export]
    pub async fn settle(&mut self, settlement_id: u64) -> SettleOutcome {
        // Snapshot what we need before the async boundary
        let (target_program, payload_bytes, expected_reply, worker, depositor, amount, deadline_block) = {
            let state = self.state.borrow();
            let s = state
                .settlements
                .get(&settlement_id)
                .expect("SettlementNotFound");
            assert!(s.status == SettlementStatus::Settling, "InvalidStatus");
            (
                s.spec.target_program,
                s.spec.payload_bytes.clone(),
                s.spec.expected_reply.clone(),
                s.worker,
                s.depositor,
                s.amount,
                s.deadline_block,
            )
        };

        // Send cross-program query and suspend until reply arrives.
        // reply_deposit provides gas for the reply handler; 0 works here because
        // the resumed continuation runs under the original message's remaining gas.
        let reply_result =
            msg::send_bytes_for_reply(target_program, payload_bytes, 0, 0)
                .expect("CrossProgramSendFailed")
                .await;

        // Re-read state after async resume (state may have changed)
        let current_block = exec::block_height();
        let state = &mut *self.state.borrow_mut();
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        match reply_result {
            Ok(reply_bytes) if reply_bytes == expected_reply => {
                // ✅ Work verified — release to worker
                settlement.status = SettlementStatus::Settled;
                msg::send(worker, (), amount).expect("TransferToWorkerFailed");
                self.emit_event(EscrowEvent::Settled {
                    id: settlement_id,
                    worker,
                    amount,
                })
                .unwrap();
                SettleOutcome::Settled
            }
            _ if current_block >= deadline_block => {
                // ⏰ Deadline passed — refund depositor
                settlement.status = SettlementStatus::Refunded;
                msg::send(depositor, (), amount).expect("RefundFailed");
                let reason = "VerificationFailedOrTimeout".into();
                self.emit_event(EscrowEvent::Refunded {
                    id: settlement_id,
                    depositor,
                    amount,
                    reason,
                })
                .unwrap();
                SettleOutcome::Refunded
            }
            _ => {
                // 🔄 Wrong result but still within deadline — keep Settling, allow retry
                SettleOutcome::StillPending
            }
        }
    }

    /// Cancel a settlement. Depositor can cancel before funding.
    /// Depositor can also force-refund after deadline if stuck in Active/Settling.
    #[export]
    pub fn cancel(&mut self, settlement_id: u64) {
        let state = &mut *self.state.borrow_mut();
        let settlement = state
            .settlements
            .get_mut(&settlement_id)
            .expect("SettlementNotFound");

        let caller = Syscall::message_source();
        let current_block = exec::block_height();

        match &settlement.status {
            SettlementStatus::Pending => {
                // Only depositor can cancel unfunded settlements
                assert_eq!(caller, settlement.depositor, "Unauthorized");
                settlement.status = SettlementStatus::Cancelled;
                let id = settlement.id;
                self.emit_event(EscrowEvent::Cancelled { id }).unwrap();
            }
            SettlementStatus::Active | SettlementStatus::Settling => {
                // Depositor can refund past deadline
                assert_eq!(caller, settlement.depositor, "Unauthorized");
                assert!(current_block > settlement.deadline_block, "DeadlineNotPassed");
                let (id, depositor, amount) = (settlement.id, settlement.depositor, settlement.amount);
                settlement.status = SettlementStatus::Refunded;
                msg::send(depositor, (), amount).expect("RefundFailed");
                self.emit_event(EscrowEvent::Refunded {
                    id,
                    depositor,
                    amount,
                    reason: "CancelledByDepositor".into(),
                })
                .unwrap();
            }
            _ => panic!("InvalidStatus"),
        }
    }

    // ─── Queries ─────────────────────────────────────────────────────────────

    #[export]
    pub fn get_settlement(&self, id: u64) -> Option<Settlement> {
        self.state.borrow().settlements.get(&id).cloned()
    }

    #[export]
    pub fn get_next_id(&self) -> u64 {
        self.state.borrow().next_id
    }
}

// ─── RegistryService ──────────────────────────────────────────────────────────

pub struct RegistryService<'a> {
    state: &'a RefCell<ProvenanceState>,
}

#[sails_rs::service]
impl RegistryService<'_> {
    #[export]
    pub fn list_active(&self, offset: u64, limit: u64) -> Vec<Settlement> {
        self.state
            .borrow()
            .settlements
            .values()
            .filter(|s| {
                s.status == SettlementStatus::Active
                    || s.status == SettlementStatus::Settling
            })
            .skip(offset as usize)
            .take(limit as usize)
            .cloned()
            .collect()
    }

    #[export]
    pub fn get_by_depositor(&self, actor: ActorId) -> Vec<u64> {
        self.state
            .borrow()
            .by_depositor
            .get(&actor)
            .cloned()
            .unwrap_or_default()
    }

    #[export]
    pub fn get_by_worker(&self, actor: ActorId) -> Vec<u64> {
        self.state
            .borrow()
            .by_worker
            .get(&actor)
            .cloned()
            .unwrap_or_default()
    }

    /// Returns (total_settlements, active_count, settled_count)
    #[export]
    pub fn stats(&self) -> (u64, u64, u64) {
        let state = self.state.borrow();
        let active = state
            .settlements
            .values()
            .filter(|s| {
                s.status == SettlementStatus::Active
                    || s.status == SettlementStatus::Settling
            })
            .count() as u64;
        let settled = state
            .settlements
            .values()
            .filter(|s| s.status == SettlementStatus::Settled)
            .count() as u64;
        (state.next_id, active, settled)
    }
}

// ─── Program ─────────────────────────────────────────────────────────────────

#[derive(Default)]
pub struct Program {
    state: RefCell<ProvenanceState>,
}

#[sails_rs::program]
impl Program {
    /// Deploy the Provenance settlement program.
    pub fn new() -> Self {
        Self::default()
    }

    /// Escrow service — create, fund, verify, and settle obligations.
    pub fn escrow(&self) -> EscrowService<'_> {
        EscrowService { state: &self.state }
    }

    /// Registry service — discovery queries for active settlements.
    pub fn registry(&self) -> RegistryService<'_> {
        RegistryService { state: &self.state }
    }
}
