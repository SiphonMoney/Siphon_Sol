# Aztec/Noir Integration

> Zero-Knowledge circuit implementation for Siphon Protocol using Noir

## Overview

Siphon Protocol uses [Noir](https://noir-lang.org/) for zero-knowledge proofs, to implement privacy-preserving withdrawals. The circuit proves ownership of a deposit without revealing which deposit is being spent.

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   User Wallet     | --> |   Noir Circuit    | --> |   On-Chain        |
|                   |     |   (Withdrawal)    |     |   Verification    |
|   - nullifier     |     |   - Merkle proof  |     |   - Nullifier     |
|   - secret        |     |   - Balance check |     |   - Root check    |
+-------------------+     +-------------------+     +-------------------+
```

## Circuit Design

### Withdrawal Circuit (`circuits-noir/src/main.nr`)

The withdrawal circuit proves:

1. **Merkle Membership**: The commitment exists in the Merkle tree
2. **Nullifier Correctness**: The nullifier hash matches the secret nullifier
3. **Balance Validity**: The withdrawal amount doesn't exceed the deposit

#### Public Inputs

| Input | Type | Description |
|-------|------|-------------|
| `withdrawn_value` | Field | Amount being withdrawn |
| `state_root` | Field | Current Merkle root |
| `new_commitment` | Field | Commitment for remaining balance (or 0) |
| `nullifier_hash` | Field | Hash of the nullifier (prevents double-spend) |

#### Private Inputs

| Input | Type | Description |
|-------|------|-------------|
| `existing_value` | Field | Original deposit amount |
| `existing_nullifier` | Field | Secret nullifier from deposit |
| `existing_secret` | Field | Secret from deposit |
| `new_nullifier` | Field | New nullifier for change output |
| `new_secret` | Field | New secret for change output |
| `path_elements` | [Field; 32] | Merkle proof siblings |
| `path_indices` | [u1; 32] | Merkle proof path (left/right) |

### Commitment Scheme

We use Poseidon hash (BN254 curve) for all commitments:

```noir
// Precommitment = Poseidon(nullifier, secret)
let precommitment = poseidon::bn254::hash_2([nullifier, secret]);

// Commitment = Poseidon(value, precommitment)
let commitment = poseidon::bn254::hash_2([value, precommitment]);
```

### Merkle Tree

- **Height**: 20 levels (supports ~1M deposits)
- **Hash Function**: Poseidon BN254
- **Zero Value**: `0` (empty leaves)

```noir
fn compute_merkle_root(
    leaf: Field,
    path_elements: [Field; 32],
    path_indices: [u1; 32],
) -> Field {
    let mut current = leaf;
    for i in 0..32 {
        let sibling = path_elements[i];
        current = if path_indices[i] == 0 {
            poseidon::bn254::hash_2([current, sibling])
        } else {
            poseidon::bn254::hash_2([sibling, current])
        };
    }
    current
}
```

## Setup Instructions

### Prerequisites

- [Nargo](https://noir-lang.org/docs/getting_started/installation) >= 1.0.0-beta.13
- Rust (for building native components)

### Installation

```bash
# Install Nargo
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Navigate to circuits
cd circuits-noir

# Compile the circuit
nargo compile

# Run tests
nargo test
```

### Compilation Output

After compilation, you'll find:
- `target/siphon_withdrawal.json` - Circuit artifact
- `target/vk.json` - Verification key (if generated)

## Integration with Siphon

### Off-Chain Proof Generation

The embedded relayer (`src/lib/noir-zk/relayer-core.ts`) handles proof generation:

```typescript
// Generate Merkle proof for a commitment
const proof = await relayer.generateMerkleProof(commitment);

// The proof contains:
// - pathElements: sibling hashes
// - pathIndices: left/right indicators
// - root: current Merkle root
```

### On-Chain Verification (Current)

Currently, proof verification happens off-chain in the relayer. The on-chain program trusts the relayer to only submit valid withdrawals.

```rust
// siphon-zk-pool/src/instructions/withdraw_sol.rs
pub fn handler(
    ctx: Context<WithdrawSol>,
    inputs: WithdrawInputs,  // Contains nullifier_hash, state_root
    recipient: Pubkey,
    amount: u64,
    fee: u64,
) -> Result<()> {
    // Verify relayer authority
    require!(ctx.accounts.relayer.key() == ctx.accounts.pool_config.relayer);

    // Check nullifier not already spent
    // Check state_root is known
    // Execute withdrawal
}
```

### Future: On-Chain Verification with Sunspot

We plan to integrate [Sunspot](https://github.com/Sunspot-io/sunspot) for on-chain Noir proof verification on Solana:

```rust
// Future implementation
pub fn withdraw_with_proof(
    ctx: Context<WithdrawWithProof>,
    proof: Vec<u8>,
    public_inputs: WithdrawPublicInputs,
) -> Result<()> {
    // Verify Noir proof on-chain via Sunspot
    sunspot::verify_proof(
        &ctx.accounts.verifier_program,
        &proof,
        &public_inputs,
    )?;

    // Execute withdrawal
}
```

## Circuit Tests

The circuit includes comprehensive tests:

```bash
cd circuits-noir
nargo test
```

### Test Cases

1. **Commitment Computation**: Verify Poseidon hash matches expected output
2. **Nullifier Hash**: Ensure deterministic nullifier hashing
3. **Merkle Root**: Verify tree construction with known values
4. **Balance Arithmetic**: Test partial and full withdrawals

```noir
#[test]
fn test_commitment_computation() {
    let value: Field = 1000;
    let nullifier: Field = 12345;
    let secret: Field = 67890;

    let precommitment = compute_precommitment(nullifier, secret);
    let commitment = poseidon::bn254::hash_2([value, precommitment]);

    // Should be deterministic
    let commitment2 = compute_commitment(value, nullifier, secret);
    assert(commitment == commitment2);
}
```

## Security Considerations

### Nullifier Uniqueness

Each deposit must have a unique nullifier. Reusing nullifiers allows double-spending.

```noir
assert(existing_nullifier != new_nullifier, "New nullifier must be different");
```

### Field Overflow

All values must be within the BN254 scalar field. Large values may wrap around.

### Timing Attacks

Proof generation time may leak information about the Merkle path. Consider constant-time implementations for production.

## Resources

- [Noir Documentation](https://noir-lang.org/docs)
- [Aztec Protocol](https://aztec.network/)
- [Poseidon Hash](https://www.poseidon-hash.info/)
- [Sunspot Verifier](https://github.com/Sunspot-io/sunspot)
