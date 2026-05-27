use ::provenance_client::{ProvenanceClient as _, ProvenanceClientCtors as _};
use sails_rs::prelude::futures::StreamExt as _;
#[allow(unused_imports)]
use sails_rs::{client::*, gtest::*, prelude::*};

/// Helper: deploy the Provenance program and return (program, escrow_client)
async fn deploy(env: &GtestEnv) -> (
    ::provenance_client::ProvenanceClientProgram,
    impl ::provenance_client::ProvenanceClient,
) {
    let code_id = env.system().submit_code(::provenance::WASM_BINARY);
    let program = env
        .deploy::<::provenance_client::ProvenanceClientProgram>(code_id, b"salt".to_vec())
        .create()
        .await
        .unwrap();
    let escrow = program.escrow();
    (program, escrow)
}

// ─── CreateSettlement ─────────────────────────────────────────────────────────

#[tokio::test]
async fn create_settlement_returns_id() {
    let env = GtestEnv::system_default();
    let (_program, mut escrow) = deploy(&env).await;

    let worker = ActorId::from([2u8; 32]);
    let spec = provenance_client::escrow::SailsCallSpec {
        target_program: ActorId::from([3u8; 32]),
        payload_bytes: vec![0xde, 0xad],
        expected_reply: vec![0xbe, 0xef],
    };

    let id = escrow
        .create_settlement(worker, 1_000_000_000_000u128, spec, 100u32)
        .await
        .unwrap();

    assert_eq!(id, 0, "first settlement should have id 0");
}

// ─── GetSettlement ────────────────────────────────────────────────────────────

#[tokio::test]
async fn get_settlement_returns_created_record() {
    let env = GtestEnv::system_default();
    let (_program, mut escrow) = deploy(&env).await;

    let worker = ActorId::from([5u8; 32]);
    let amount = 2_000_000_000_000u128;
    let spec = provenance_client::escrow::SailsCallSpec {
        target_program: ActorId::from([7u8; 32]),
        payload_bytes: vec![1, 2, 3],
        expected_reply: vec![4, 5, 6],
    };

    let id = escrow
        .create_settlement(worker, amount, spec.clone(), 50u32)
        .await
        .unwrap();

    let settlement = escrow.get_settlement(id).await.unwrap();
    assert!(settlement.is_some(), "settlement should exist");
    let s = settlement.unwrap();
    assert_eq!(s.worker, worker);
    assert_eq!(s.amount, amount);
    assert_eq!(s.spec.payload_bytes, spec.payload_bytes);
    assert_eq!(s.spec.expected_reply, spec.expected_reply);
    assert_eq!(
        s.status,
        provenance_client::escrow::SettlementStatus::Pending
    );
}

// ─── GetNextId ────────────────────────────────────────────────────────────────

#[tokio::test]
async fn next_id_increments() {
    let env = GtestEnv::system_default();
    let (_program, mut escrow) = deploy(&env).await;

    let worker = ActorId::from([9u8; 32]);
    let spec = provenance_client::escrow::SailsCallSpec {
        target_program: ActorId::from([10u8; 32]),
        payload_bytes: vec![],
        expected_reply: vec![],
    };

    assert_eq!(escrow.get_next_id().await.unwrap(), 0);
    escrow
        .create_settlement(worker, 1_000_000_000_000u128, spec.clone(), 10u32)
        .await
        .unwrap();
    assert_eq!(escrow.get_next_id().await.unwrap(), 1);
    escrow
        .create_settlement(worker, 1_000_000_000_000u128, spec, 10u32)
        .await
        .unwrap();
    assert_eq!(escrow.get_next_id().await.unwrap(), 2);
}

// ─── Created event ────────────────────────────────────────────────────────────

#[tokio::test]
async fn create_settlement_emits_created_event() {
    let env = GtestEnv::system_default();
    let (program, mut escrow) = deploy(&env).await;
    let mut events = escrow.listen().await.unwrap();

    let worker = ActorId::from([20u8; 32]);
    let amount = 5_000_000_000_000u128;
    let spec = provenance_client::escrow::SailsCallSpec {
        target_program: ActorId::from([21u8; 32]),
        payload_bytes: vec![0xaa],
        expected_reply: vec![0xbb],
    };

    let id = escrow
        .create_settlement(worker, amount, spec, 200u32)
        .await
        .unwrap();

    let (_actor_id, event) = events.next().await.unwrap();
    match event {
        provenance_client::escrow::EscrowEvent::Created {
            id: eid,
            worker: ew,
            amount: ea,
            ..
        } => {
            assert_eq!(eid, id);
            assert_eq!(ew, worker);
            assert_eq!(ea, amount);
        }
        other => panic!("expected Created event, got {:?}", other),
    }
}

// ─── Cancel (Pending) ─────────────────────────────────────────────────────────

#[tokio::test]
async fn cancel_pending_settlement_transitions_to_cancelled() {
    let env = GtestEnv::system_default();
    let (_program, mut escrow) = deploy(&env).await;

    let worker = ActorId::from([30u8; 32]);
    let spec = provenance_client::escrow::SailsCallSpec {
        target_program: ActorId::from([31u8; 32]),
        payload_bytes: vec![],
        expected_reply: vec![],
    };

    let id = escrow
        .create_settlement(worker, 1_000_000_000_000u128, spec, 100u32)
        .await
        .unwrap();

    escrow.cancel(id).await.unwrap();

    let s = escrow.get_settlement(id).await.unwrap().unwrap();
    assert_eq!(
        s.status,
        provenance_client::escrow::SettlementStatus::Cancelled
    );
}

// ─── Registry: stats ─────────────────────────────────────────────────────────

#[tokio::test]
async fn registry_stats_starts_at_zero() {
    let env = GtestEnv::system_default();
    let code_id = env.system().submit_code(::provenance::WASM_BINARY);
    let program = env
        .deploy::<::provenance_client::ProvenanceClientProgram>(code_id, b"stats-salt".to_vec())
        .create()
        .await
        .unwrap();

    let mut registry = program.registry();
    let (total, active, settled) = registry.stats().await.unwrap();
    assert_eq!(total, 0);
    assert_eq!(active, 0);
    assert_eq!(settled, 0);
}
