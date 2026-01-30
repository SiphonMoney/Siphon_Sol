// uses poseidon hash on BN254 curve for groth16/sunspot compatibility
use std::hash::poseidon;

pub fn compute_nullifier_hash(nullifier: Field) -> Field {
    poseidon::bn254::hash_1([nullifier])
}

pub fn compute_precommitment(nullifier: Field, secret: Field) -> Field {
    poseidon::bn254::hash_2([nullifier, secret])
}

pub fn compute_commitment_from_precommitment(value: Field, precommitment: Field) -> Field {
    poseidon::bn254::hash_2([value, precommitment])
}

pub fn compute_commitment(value: Field, nullifier: Field, secret: Field) -> Field {
    let precommitment = compute_precommitment(nullifier, secret);
    compute_commitment_from_precommitment(value, precommitment)
}

pub fn generate_commitment_data(
    value: Field,
    nullifier: Field,
    secret: Field,
) -> (Field, Field) {
    let nullifier_hash = compute_nullifier_hash(nullifier);
    let commitment = compute_commitment(value, nullifier, secret);
    (commitment, nullifier_hash)
}

pub fn verify_commitment(
    commitment: Field,
    value: Field,
    nullifier: Field,
    secret: Field,
) -> bool {
    let computed = compute_commitment(value, nullifier, secret);
    computed == commitment
}

#[test]
fn test_commitment_determinism() {
    let value: Field = 1000;
    let nullifier: Field = 12345;
    let secret: Field = 67890;

    let commitment1 = compute_commitment(value, nullifier, secret);
    let commitment2 = compute_commitment(value, nullifier, secret);

    assert(commitment1 == commitment2);
}

#[test]
fn test_nullifier_hash_determinism() {
    let nullifier: Field = 12345;

    let hash1 = compute_nullifier_hash(nullifier);
    let hash2 = compute_nullifier_hash(nullifier);

    assert(hash1 == hash2);
}

#[test]
fn test_different_inputs_different_commitments() {
    let value: Field = 1000;
    let nullifier1: Field = 12345;
    let nullifier2: Field = 12346;
    let secret: Field = 67890;

    let commitment1 = compute_commitment(value, nullifier1, secret);
    let commitment2 = compute_commitment(value, nullifier2, secret);

    assert(commitment1 != commitment2);
}

#[test]
fn test_generate_commitment_data() {
    let value: Field = 1000;
    let nullifier: Field = 12345;
    let secret: Field = 67890;

    let (commitment, nullifier_hash) = generate_commitment_data(value, nullifier, secret);

    // Verify components
    let expected_nullifier_hash = compute_nullifier_hash(nullifier);
    let expected_commitment = compute_commitment(value, nullifier, secret);

    assert(nullifier_hash == expected_nullifier_hash);
    assert(commitment == expected_commitment);
}
