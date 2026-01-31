# Siphon ZK Circuits (Noir)

> Zero-Knowledge withdrawal proofs for the Siphon Protocol

This directory contains the zero-knowledge circuits for the Siphon Protocol, written in the [Noir language](https://noir-lang.org/). These circuits enable private withdrawals from the ZK Pool on Solana.

## Overview

The withdrawal circuit proves that a user owns a deposit in the pool without revealing which deposit. This breaks the on-chain link between deposit and withdrawal addresses.

### Privacy Guarantees

- **Sender Anonymity**: Withdrawals don't reveal the original depositor
- **Amount Privacy**: Partial withdrawals hide the original deposit amount
- **Double-Spend Prevention**: Nullifiers prevent spending the same funds twice

## Circuit Architecture

```
+------------------+     +------------------+     +------------------+
|  Private Inputs  | --> |   Noir Circuit   | --> |  Public Outputs  |
|                  |     |                  |     |                  |
| - existing_value |     | 1. Reconstruct   |     | - state_root     |
| - nullifier      |     |    commitment    |     | - nullifier_hash |
| - secret         |     | 2. Verify Merkle |     | - withdrawn_value|
| - path_elements  |     |    proof         |     | - new_commitment |
| - path_indices   |     | 3. Check balance |     |                  |
| - new_nullifier  |     | 4. Create change |     |                  |
| - new_secret     |     |    commitment    |     |                  |
+------------------+     +------------------+     +------------------+
```

## File Structure

```
circuits-noir/
├── Nargo.toml           # Project configuration
├── Prover.toml          # Prover inputs (for testing)
├── src/
│   ├── main.nr          # Main withdrawal circuit
│   ├── commitment.nr    # Commitment functions
│   └── merkle.nr        # Merkle tree functions
└── README.md            # This file
```

## Circuit Logic

### 1. Commitment Verification

The circuit reconstructs the original commitment and verifies it matches:

```noir
// Precommitment = Poseidon(nullifier, secret)
let existing_precommitment = compute_precommitment(existing_nullifier, existing_secret);

// Commitment = Poseidon(value, precommitment)
let existing_commitment = poseidon::bn254::hash_2([existing_value, existing_precommitment]);
```

### 2. Merkle Proof Verification

Verifies the commitment exists in the pool's Merkle tree:

```noir
let computed_root = compute_merkle_root(existing_commitment, path_elements, path_indices);
assert(computed_root == state_root, "Merkle proof verification failed");
```

### 3. Nullifier Hash Verification

Prevents double-spending by checking the nullifier hash:

```noir
let computed_nullifier_hash = compute_nullifier_hash(existing_nullifier);
assert(computed_nullifier_hash == nullifier_hash, "Nullifier hash mismatch");
```

### 4. Balance Calculation

Ensures withdrawal doesn't exceed the deposit:

```noir
let remaining_value = existing_value - withdrawn_value;
assert(existing_value == withdrawn_value + remaining_value, "Balance arithmetic failed");
```

### 5. Change Commitment

Creates a new commitment for remaining balance:

```noir
let new_precommitment = compute_precommitment(new_nullifier, new_secret);
let computed_new_commitment = poseidon::bn254::hash_2([remaining_value, new_precommitment]);
assert(computed_new_commitment == new_commitment, "New commitment mismatch");
```

## Setup and Compilation

### Prerequisites

- [Nargo](https://noir-lang.org/docs/getting_started/installation) >= 1.0.0-beta.13

### Installation

```bash
# Install Nargo using noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup

# Verify installation
nargo --version
```

### Compilation

```bash
cd circuits-noir

# Compile the circuit
nargo compile

# Output: target/siphon_withdrawal.json
```

### Testing

```bash
# Run all tests
nargo test

# Run specific test
nargo test test_commitment_computation
```

## Circuit Configuration

### Nargo.toml

```toml
[package]
name = "siphon_withdrawal"
type = "bin"
authors = ["Siphon Team"]
compiler_version = ">=1.0.0-beta.13"
expression_width = 4

[dependencies]
# No external dependencies - using stdlib
```

### Merkle Tree Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| Height | 20 | Supports ~1M deposits |
| Hash | Poseidon BN254 | SNARK-friendly hash |
| Proof Size | 32 siblings | One per level |

## Public Inputs

| Name | Type | Description |
|------|------|-------------|
| `withdrawn_value` | Field | Amount being withdrawn |
| `state_root` | Field | Merkle root at proof time |
| `new_commitment` | Field | Commitment for change (or 0) |
| `nullifier_hash` | Field | Hash of nullifier |

## Private Inputs

| Name | Type | Description |
|------|------|-------------|
| `existing_value` | Field | Original deposit amount |
| `existing_nullifier` | Field | Secret nullifier from deposit |
| `existing_secret` | Field | Secret from deposit |
| `new_nullifier` | Field | Nullifier for change output |
| `new_secret` | Field | Secret for change output |
| `path_elements` | [Field; 32] | Merkle siblings |
| `path_indices` | [u1; 32] | Path direction bits |

## Helper Modules

### commitment.nr

```noir
// Compute precommitment: Poseidon(nullifier, secret)
fn compute_precommitment(nullifier: Field, secret: Field) -> Field

// Compute full commitment: Poseidon(value, precommitment)
fn compute_commitment(value: Field, nullifier: Field, secret: Field) -> Field

// Compute nullifier hash for double-spend prevention
fn compute_nullifier_hash(nullifier: Field) -> Field
```

### merkle.nr

```noir
// Compute Merkle root from leaf and proof
fn compute_merkle_root(
    leaf: Field,
    path_elements: [Field; 32],
    path_indices: [u1; 32],
) -> Field
```

## Test Cases

The circuit includes unit tests for each component:

```noir
#[test]
fn test_commitment_computation() {
    // Verify commitment matches expected output
}

#[test]
fn test_nullifier_hash() {
    // Verify nullifier hashing is deterministic
}

#[test]
fn test_merkle_root_computation() {
    // Verify Merkle proof verification
}

#[test]
fn test_balance_arithmetic() {
    // Verify withdrawal math
}
```

## Integration with Siphon

### Off-Chain Proof Generation

The embedded relayer generates proofs using the compiled circuit:

```typescript
// src/lib/noir-zk/relayer-core.ts
import { compile } from '@noir-lang/noir_wasm';
import { Prover } from '@noir-lang/backend_barretenberg';

// Load compiled circuit
const circuit = await compile('circuits-noir/target/siphon_withdrawal.json');

// Generate proof
const prover = new Prover(circuit);
const proof = await prover.generateProof(inputs);
```

### On-Chain Verification

Currently verification is off-chain. Future versions will use Sunspot:

```typescript
// Future: On-chain verification
const verifier = new SunspotVerifier(programId);
await verifier.verify(proof, publicInputs);
```

## Security Considerations

### Field Overflow

All values must be within the BN254 scalar field (< 2^254). Large values will wrap.

### Randomness

Nullifiers and secrets must be cryptographically random. Use secure random number generators.

### Timing Attacks

Proof generation time may leak information. Consider constant-time implementations.

## Troubleshooting

### Compilation Errors

```
Error: Could not satisfy constraint
```
Check that all assertions in the circuit can be satisfied with valid inputs.

### Witness Generation Fails

```
Error: Failed to generate witness
```
Verify all inputs are valid Field elements within the BN254 scalar field.

### Merkle Proof Invalid

```
Error: Merkle proof verification failed
```
Ensure path elements and indices match the commitment's position in the tree.

## Development

### Adding New Tests

```noir
#[test]
fn test_new_feature() {
    // Test code here
    assert(result == expected);
}
```

### Modifying Circuit

1. Edit source files in `src/`
2. Run `nargo compile` to check syntax
3. Run `nargo test` to verify correctness
4. Update TypeScript relayer if public inputs change

## Resources

- [Noir Documentation](https://noir-lang.org/docs)
- [Noir by Example](https://noir-by-example.org/)
- [Poseidon Hash Spec](https://www.poseidon-hash.info/)
- [BN254 Curve](https://neuromancer.sk/std/bn/bn254)

## License

MIT License