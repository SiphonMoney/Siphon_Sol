# Siphon ZK Pool - Anchor Program

> Privacy-preserving pool for Solana using Poseidon Merkle trees

## Overview

The `siphon-zk-pool` Anchor program implements a UTXO-based privacy pool on Solana. Users can deposit SOL or SPL tokens with cryptographic commitments and later withdraw to any address without revealing which deposit they're spending.

## Program ID

```
3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb
```

Deployed to: **Solana Devnet**

## Architecture

```
+---------------------+     +---------------------+     +---------------------+
|     PoolConfig      |     |     MerkleTree      |     |     PoolVault       |
|      (PDA)          |     |       (PDA)         |     |       (PDA)         |
|                     |     |                     |     |                     |
| - admin             |     | - authority         |     | - SOL balance       |
| - relayer           |     | - next_index        |     | - Token accounts    |
| - fee_bps           |     | - current_root      |     |                     |
| - fee_recipient     |     | - root_history[32]  |     |                     |
| - verifier_program  |     | - height            |     |                     |
+---------------------+     +---------------------+     +---------------------+
           |                          |                          |
           |                          |                          |
           v                          v                          v
+---------------------+     +---------------------+     +---------------------+
|  CommitmentRecord   |     |  NullifierAccount   |     |   Token Accounts    |
|      (PDA)          |     |       (PDA)         |     |       (ATAs)        |
|                     |     |                     |     |                     |
| - index             |     | - nullifier_hash    |     | - USDC, USDT, etc.  |
| - commitment        |     | - bump              |     |                     |
+---------------------+     +---------------------+     +---------------------+
```

## Instructions

### `initialize`

Initialize the pool with configuration.

```rust
pub fn initialize(
    ctx: Context<Initialize>,
    relayer: Pubkey,
    fee_recipient: Pubkey,
    fee_bps: u16,
) -> Result<()>
```

**Parameters:**
- `relayer`: Authority that can submit withdrawals and update roots
- `fee_recipient`: Account that receives withdrawal fees
- `fee_bps`: Fee in basis points (e.g., 25 = 0.25%)

**Accounts:**
- `admin`: Signer, pays for account creation
- `pool_config`: PDA `["pool_config"]`
- `merkle_tree`: PDA `["merkle_tree"]`
- `pool_vault`: PDA `["pool_vault"]`

### `deposit_sol`

Deposit SOL into the privacy pool.

```rust
pub fn deposit_sol(
    ctx: Context<DepositSol>,
    commitment: [u8; 32],
    encrypted_output: Vec<u8>,
    amount: u64,
    leaf_index: u64,
) -> Result<()>
```

**Parameters:**
- `commitment`: Poseidon hash commitment `= Poseidon(value, Poseidon(nullifier, secret))`
- `encrypted_output`: Encrypted UTXO data for the depositor
- `amount`: Amount in lamports
- `leaf_index`: Expected leaf index in Merkle tree

**Accounts:**
- `depositor`: Signer, source of SOL
- `pool_vault`: Destination for SOL
- `merkle_tree`: Updated with new commitment
- `commitment_record`: Created to store commitment

### `deposit_spl`

Deposit SPL tokens into the privacy pool.

```rust
pub fn deposit_spl(
    ctx: Context<DepositSpl>,
    commitment: [u8; 32],
    encrypted_output: Vec<u8>,
    amount: u64,
    leaf_index: u64,
) -> Result<()>
```

**Additional Accounts:**
- `token_mint`: SPL token mint
- `depositor_token_account`: Source token account
- `pool_token_account`: Pool's token account (ATA)

### `withdraw_sol`

Withdraw SOL from the privacy pool.

```rust
pub fn withdraw_sol(
    ctx: Context<WithdrawSol>,
    inputs: WithdrawInputs,
    recipient: Pubkey,
    amount: u64,
    fee: u64,
) -> Result<()>
```

**Parameters:**
- `inputs`: Withdrawal proof data
  - `nullifier_hash`: Hash of the nullifier (prevents double-spend)
  - `state_root`: Merkle root used for the proof
  - `new_commitment`: Commitment for change output (or zeros)
- `recipient`: Address to receive the withdrawal
- `amount`: Amount after fee deduction
- `fee`: Fee amount

**Accounts:**
- `relayer`: Signer, must be authorized relayer
- `pool_vault`: Source of SOL
- `nullifier_account`: Created to mark nullifier as spent
- `recipient`: Receives the withdrawal
- `fee_recipient`: Receives the fee

### `withdraw_spl`

Withdraw SPL tokens from the privacy pool.

```rust
pub fn withdraw_spl(
    ctx: Context<WithdrawSpl>,
    inputs: WithdrawInputs,
    recipient: Pubkey,
    amount: u64,
    fee: u64,
) -> Result<()>
```

**Additional Accounts:**
- `pool_token_account`: Source of tokens
- `recipient_token_account`: Receives tokens
- `fee_recipient_token_account`: Receives fee

### `update_root`

Update the Merkle root (relayer only).

```rust
pub fn update_root(ctx: Context<UpdateRoot>, new_root: [u8; 32]) -> Result<()>
```

**Parameters:**
- `new_root`: New Merkle root after tree update

**Accounts:**
- `relayer`: Signer, must be authorized
- `merkle_tree`: Updated with new root

## PDA Seeds

| Account | Seeds |
|---------|-------|
| PoolConfig | `["pool_config"]` |
| MerkleTree | `["merkle_tree"]` |
| PoolVault | `["pool_vault"]` |
| CommitmentRecord | `["commitment", leaf_index (u64 LE)]` |
| NullifierAccount | `["nullifier", nullifier_hash (32 bytes)]` |

## State Accounts

### PoolConfig

```rust
#[account]
pub struct PoolConfig {
    pub admin: Pubkey,           // Can update config
    pub relayer: Pubkey,         // Can submit withdrawals
    pub fee_bps: u16,            // Fee in basis points
    pub fee_recipient: Pubkey,   // Receives fees
    pub verifier_program: Pubkey,// For future on-chain proofs
    pub paused: bool,            // Emergency pause
    pub bump: u8,
    pub tree_bump: u8,
    pub vault_bump: u8,
}
```

### MerkleTree

```rust
#[account(zero_copy)]
pub struct MerkleTree {
    pub authority: Pubkey,
    pub next_index: u64,
    pub current_root: [u8; 32],
    pub root_history: [u8; 1024], // 32 roots x 32 bytes
    pub root_history_index: u64,
    pub height: u8,               // 20 levels
    pub bump: u8,
}
```

### CommitmentRecord

```rust
#[account]
pub struct CommitmentRecord {
    pub index: u64,
    pub commitment: [u8; 32],
    pub bump: u8,
}
```

### NullifierAccount

```rust
#[account]
pub struct NullifierAccount {
    pub nullifier_hash: [u8; 32],
    pub bump: u8,
}
```

## Events

### CommitmentInserted

Emitted on every deposit:

```rust
#[event]
pub struct CommitmentInserted {
    pub index: u64,
    pub commitment: [u8; 32],
    pub encrypted_output: Vec<u8>,
    pub amount: u64,
    pub mint: Option<Pubkey>,
}
```

### Withdrawal

Emitted on every withdrawal:

```rust
#[event]
pub struct Withdrawal {
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub mint: Option<Pubkey>,
}
```

## Error Codes

```rust
#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid leaf index")]
    InvalidLeafIndex,
    #[msg("Tree is full")]
    TreeFull,
    #[msg("Invalid state root")]
    InvalidStateRoot,
    #[msg("Nullifier already spent")]
    NullifierAlreadySpent,
    #[msg("Pool is paused")]
    PoolPaused,
    #[msg("Insufficient balance")]
    InsufficientBalance,
}
```

## Development

### Prerequisites

- Rust 1.70+
- Solana CLI 1.18+
- Anchor CLI 0.32+

### Build

```bash
cd siphon
anchor build
```

### Test

```bash
anchor test
```

### Deploy

```bash
# Deploy to devnet
anchor deploy --provider.cluster devnet

# Or use Solana Playground for easier builds
# https://beta.solpg.io/
```

### Local Validator

```bash
# Start local validator
solana-test-validator

# Deploy to localnet
anchor deploy --provider.cluster localnet
```

## Configuration

### Anchor.toml

```toml
[toolchain]
package_manager = "yarn"

[programs.localnet]
siphon = "8msvrbpBsdVKnF2FNwUAMERfCrG8Yqng9HcfJBRxGPgX"
siphon_zk_pool = "3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 \"tests/**/*.ts\""
```

## Usage Example

### Initialize Pool

```typescript
import { Program, AnchorProvider } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';

const [poolConfigPDA] = PublicKey.findProgramAddressSync(
  [Buffer.from('pool_config')],
  programId
);

await program.methods
  .initialize(
    relayerPubkey,
    feeRecipientPubkey,
    25 // 0.25% fee
  )
  .accounts({
    admin: wallet.publicKey,
    poolConfig: poolConfigPDA,
    merkleTree: merkleTreePDA,
    poolVault: poolVaultPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Deposit SOL

```typescript
const commitment = await generateCommitment(amount);

await program.methods
  .depositSol(
    commitment.bytes,
    Buffer.from(encryptedOutput),
    new BN(amount),
    new BN(leafIndex)
  )
  .accounts({
    depositor: wallet.publicKey,
    poolConfig: poolConfigPDA,
    merkleTree: merkleTreePDA,
    poolVault: poolVaultPDA,
    commitmentRecord: commitmentRecordPDA,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
```

### Withdraw SOL

```typescript
const withdrawInputs = {
  nullifierHash: nullifierHashBytes,
  stateRoot: stateRootBytes,
  newCommitment: newCommitmentBytes,
};

await program.methods
  .withdrawSol(
    withdrawInputs,
    recipientPubkey,
    new BN(amountAfterFee),
    new BN(fee)
  )
  .accounts({
    relayer: relayerKeypair.publicKey,
    poolConfig: poolConfigPDA,
    merkleTree: merkleTreePDA,
    poolVault: poolVaultPDA,
    nullifierAccount: nullifierPDA,
    recipient: recipientPubkey,
    feeRecipient: feeRecipientPubkey,
    systemProgram: SystemProgram.programId,
  })
  .signers([relayerKeypair])
  .rpc();
```

## Security Considerations

1. **Relayer Trust**: Currently, the relayer is trusted to verify proofs off-chain
2. **Root History**: Pool maintains 32 recent roots for timing flexibility
3. **Nullifier Double-Spend**: Each nullifier can only be used once
4. **Fee Handling**: Fees are deducted before withdrawal

## Future Improvements

1. **On-Chain Proof Verification**: Integrate Sunspot for Noir proof verification
2. **Multi-Asset Pools**: Support more SPL tokens
3. **Variable Denomination**: Support arbitrary deposit amounts
4. **Governance**: DAO-controlled pool parameters

## License

MIT License
