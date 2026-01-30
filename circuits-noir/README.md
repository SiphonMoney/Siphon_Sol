# Siphon Protocol - Noir ZK Circuits

Zero-knowledge circuits for the Siphon Protocol, migrated from Circom to Noir.
Uses **Groth16 proving backend via Sunspot** for on-chain verification on Solana.

## Architecture

```
circuits-noir/
├── Nargo.toml          # Noir project config
├── Prover.toml         # Example prover inputs
├── src/
│   ├── main.nr         # Main withdrawal circuit (entry point)
│   ├── merkle.nr       # Merkle tree verification
│   └── commitment.nr   # Commitment generation utilities
└── README.md
```

## Circuit Overview

### Withdrawal Circuit (`main.nr`)

Proves a valid withdrawal without revealing sensitive data:

| Public Inputs | Description |
|---------------|-------------|
| `withdrawn_value` | Amount being withdrawn |
| `state_root` | Current Merkle tree root |
| `new_commitment` | Commitment for remaining balance |
| `nullifier_hash` | Hash of nullifier (prevents double-spend) |

| Private Inputs | Description |
|----------------|-------------|
| `existing_value` | Total value in commitment |
| `existing_nullifier` | Current nullifier |
| `existing_secret` | Current secret |
| `new_nullifier` | New nullifier for change |
| `new_secret` | New secret for change |
| `path_elements[32]` | Merkle proof siblings |
| `path_indices[32]` | Merkle proof directions |

### What the Circuit Proves

1. **Ownership**: Prover knows `(nullifier, secret)` that hash to a commitment
2. **Membership**: The commitment exists in the Merkle tree
3. **Balance**: `existing_value = withdrawn_value + remaining_value`
4. **Change Output**: New commitment is correctly computed
5. **Non-Replay**: Nullifier has changed

## Prerequisites

### 1. Install Noir (Nargo)

```bash
# Install noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/refs/heads/main/install | bash

# Install specific version for Sunspot compatibility
noirup -v 1.0.0-beta.13

# Verify installation
nargo --version
```

### 2. Install Sunspot (Groth16 Backend for Solana)

```bash
# Clone Sunspot
git clone https://github.com/reilabs/sunspot.git ~/sunspot

# Build (requires Go 1.24+)
cd ~/sunspot/go
go build -o sunspot .

# Add to PATH
export PATH="$HOME/sunspot/go:$PATH"
export GNARK_VERIFIER_BIN="$HOME/sunspot/gnark-solana/crates/verifier-bin"

# Verify
sunspot --help
```

### 3. Install Solana CLI

```bash
# Install Solana
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"

# Configure for devnet
solana config set --url devnet
```

## Usage

### Compile Circuit

```bash
cd circuits-noir

# Run tests first
nargo test

# Compile to ACIR
nargo compile
```

### Generate Groth16 Proof (via Sunspot)

```bash
# 1. Compile circuit for Groth16
sunspot compile --circuit target/siphon_withdrawal.json

# 2. Generate proving/verifying keys (one-time trusted setup)
sunspot setup --circuit target/siphon_withdrawal.json

# 3. Generate witness
nargo execute

# 4. Generate Groth16 proof
sunspot prove \
  --circuit target/siphon_withdrawal.json \
  --witness target/siphon_withdrawal.gz \
  --output proof.bin

# 5. Verify locally (optional)
sunspot verify --proof proof.bin
```

### Deploy Verifier to Solana

```bash
# Generate Solana verifier program
sunspot deploy \
  --circuit target/siphon_withdrawal.json \
  --network devnet

# This outputs:
# - Verifier program ID
# - Deployment transaction signature
```

### Verify On-Chain

The verifier program accepts instruction data in format:
```
proof_bytes || public_inputs_bytes
```

Public inputs order (each 32 bytes, big-endian):
1. `withdrawn_value`
2. `state_root`
3. `new_commitment`
4. `nullifier_hash`

## Integration with Siphon

### TypeScript Client

```typescript
import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';

const VERIFIER_PROGRAM_ID = new PublicKey('YOUR_VERIFIER_PROGRAM_ID');

async function verifyWithdrawalProof(
  connection: Connection,
  proof: Uint8Array,
  publicInputs: {
    withdrawnValue: bigint,
    stateRoot: bigint,
    newCommitment: bigint,
    nullifierHash: bigint,
  }
): Promise<TransactionInstruction> {
  // Encode public inputs (32 bytes each, big-endian)
  const publicInputsBytes = Buffer.concat([
    bigintToBytes32BE(publicInputs.withdrawnValue),
    bigintToBytes32BE(publicInputs.stateRoot),
    bigintToBytes32BE(publicInputs.newCommitment),
    bigintToBytes32BE(publicInputs.nullifierHash),
  ]);

  // Instruction data = proof || public_inputs
  const data = Buffer.concat([proof, publicInputsBytes]);

  return new TransactionInstruction({
    keys: [], // No accounts needed for verification
    programId: VERIFIER_PROGRAM_ID,
    data,
  });
}

function bigintToBytes32BE(value: bigint): Buffer {
  const hex = value.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}
```

### Anchor Program Integration

```rust
use anchor_lang::prelude::*;
use solana_program::instruction::Instruction;

pub fn verify_withdrawal_proof(
    verifier_program: &Pubkey,
    proof: &[u8],
    withdrawn_value: [u8; 32],
    state_root: [u8; 32],
    new_commitment: [u8; 32],
    nullifier_hash: [u8; 32],
) -> Result<()> {
    // Build verification instruction
    let mut data = Vec::with_capacity(proof.len() + 128);
    data.extend_from_slice(proof);
    data.extend_from_slice(&withdrawn_value);
    data.extend_from_slice(&state_root);
    data.extend_from_slice(&new_commitment);
    data.extend_from_slice(&nullifier_hash);

    let ix = Instruction {
        program_id: *verifier_program,
        accounts: vec![],
        data,
    };

    // CPI to verifier
    solana_program::program::invoke(&ix, &[])?;

    Ok(())
}
```

## Differences from Circom Version

| Aspect | Circom | Noir |
|--------|--------|------|
| Language | Custom DSL | Rust-like |
| Hash function | circomlib Poseidon | std::hash::poseidon (bn254) |
| Proving system | PLONK (snarkjs) | Groth16 (Sunspot/gnark) |
| Proof size | ~800 bytes | ~256 bytes |
| Verification cost | ~400k CU | ~200k CU |
| Solana support | Custom verifier | Native syscalls |

## Testing

```bash
# Run all tests
nargo test

# Run specific test
nargo test test_commitment_computation

# Run with output
nargo test --show-output
```

## Compute Units on Solana

Groth16 verification via Solana's `alt_bn128_pairing` syscall:
- **~200,000 compute units** per verification
- Syscalls available on Solana 1.18.x+
- Active on mainnet-beta

## Security Considerations

1. **Trusted Setup**: Groth16 requires a trusted setup. Use Sunspot's MPC ceremony or existing Powers of Tau.
2. **Field Size**: BN254 scalar field (~254 bits). Values must fit within this range.
3. **Nullifier Uniqueness**: Ensure nullifiers are truly random to prevent correlation attacks.
4. **Range Checks**: Consider adding explicit range proofs for values to prevent overflow exploits.
