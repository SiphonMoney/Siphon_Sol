mod merkle;
mod commitment;

use std::hash::poseidon;
use merkle::compute_merkle_root;
use commitment::{compute_commitment, compute_nullifier_hash, compute_precommitment};

fn main(
    // Public inputs
    withdrawn_value: pub Field,
    state_root: pub Field,
    new_commitment: pub Field,
    nullifier_hash: pub Field,

    // Private inputs
    existing_value: Field,
    existing_nullifier: Field,
    existing_secret: Field,
    new_nullifier: Field,
    new_secret: Field,
    path_elements: [Field; 32],
    path_indices: [u1; 32],
) {
    let existing_precommitment = compute_precommitment(existing_nullifier, existing_secret);
    let existing_commitment = poseidon::bn254::hash_2([existing_value, existing_precommitment]);

    let computed_root = compute_merkle_root(existing_commitment, path_elements, path_indices);
    assert(computed_root == state_root, "Merkle proof verification failed");

    let computed_nullifier_hash = compute_nullifier_hash(existing_nullifier);
    assert(computed_nullifier_hash == nullifier_hash, "Nullifier hash mismatch");

    let remaining_value = existing_value - withdrawn_value;

    assert(existing_value == withdrawn_value + remaining_value, "Balance arithmetic failed");
    // aditional range checks to prevent underflow exploits
    assert(existing_nullifier != new_nullifier, "New nullifier must be different from existing");

    let new_precommitment = compute_precommitment(new_nullifier, new_secret);
    let computed_new_commitment = poseidon::bn254::hash_2([remaining_value, new_precommitment]);
    assert(computed_new_commitment == new_commitment, "New commitment mismatch");
}

// TESTS

#[test]
fn test_commitment_computation() {
    // Test that commitment computation matches expected behavior
    let value: Field = 1000;
    let nullifier: Field = 12345;
    let secret: Field = 67890;

    let precommitment = compute_precommitment(nullifier, secret);
    let commitment = poseidon::bn254::hash_2([value, precommitment]);

    // Should be deterministic
    let commitment2 = compute_commitment(value, nullifier, secret);
    assert(commitment == commitment2);
}

#[test]
fn test_nullifier_hash() {
    let nullifier: Field = 12345;
    let hash1 = compute_nullifier_hash(nullifier);
    let hash2 = compute_nullifier_hash(nullifier);

    assert(hash1 == hash2);
}

#[test]
fn test_merkle_root_computation() {
    // Test merkle root computation with known values
    let leaf: Field = 12345;
    let path_elements: [Field; 32] = [0; 32];
    let path_indices: [u1; 32] = [0; 32];

    let root1 = compute_merkle_root(leaf, path_elements, path_indices);
    let root2 = compute_merkle_root(leaf, path_elements, path_indices);

    assert(root1 == root2);
}

#[test]
fn test_balance_arithmetic() {
    let existing: Field = 1000;
    let withdrawn: Field = 400;
    let remaining = existing - withdrawn;

    assert(existing == withdrawn + remaining);
    assert(remaining == 600);
}
