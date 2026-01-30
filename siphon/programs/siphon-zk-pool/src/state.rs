use anchor_lang::prelude::*;

/// Global pool configuration
#[account]
#[derive(InitSpace)]
pub struct PoolConfig {
    /// Admin authority (can update config, pause)
    pub admin: Pubkey,
    /// Relayer authority (can submit withdrawals, update roots)
    pub relayer: Pubkey,
    /// Withdrawal fee in basis points
    pub fee_bps: u16,
    /// Account that receives fees
    pub fee_recipient: Pubkey,
    /// Sunspot verifier program ID (for future on-chain proof verification)
    pub verifier_program: Pubkey,
    /// Whether the pool is paused
    pub paused: bool,
    /// PDA bump
    pub bump: u8,
    /// Merkle tree account bump (cached for easy access)
    pub tree_bump: u8,
    /// Pool vault bump (cached for easy access)
    pub vault_bump: u8,
}

/// Merkle tree state — stores root history and next leaf index.
/// The full tree is maintained off-chain by the relayer using Poseidon BN254.
/// On-chain we only store roots (for withdrawal verification) and the leaf counter.
///
/// Uses zero_copy for efficient large account access.
#[account(zero_copy)]
#[repr(C)]
pub struct MerkleTree {
    /// Authority that can insert leaves and update roots
    pub authority: Pubkey,
    /// Next available leaf index
    pub next_index: u64,
    /// Current Merkle root
    pub current_root: [u8; 32],
    /// Ring buffer of recent roots — flattened to [u8; 1024] (32 entries × 32 bytes)
    /// because bytemuck only implements Pod/Zeroable for arrays up to 1024.
    /// Access via get_root_history / set_root_history helpers.
    pub root_history: [u8; 1024],
    /// Current position in root_history ring buffer
    pub root_history_index: u64,
    /// Tree height (determines max capacity: 2^height leaves)
    pub height: u8,
    /// PDA bump
    pub bump: u8,
    /// Padding for alignment
    pub _padding: [u8; 6],
}

impl MerkleTree {
    /// Get the i-th root from the history ring buffer
    pub fn get_root_history(&self, i: usize) -> [u8; 32] {
        let offset = i * 32;
        let mut root = [0u8; 32];
        root.copy_from_slice(&self.root_history[offset..offset + 32]);
        root
    }

    /// Set the i-th root in the history ring buffer
    pub fn set_root_history(&mut self, i: usize, root: &[u8; 32]) {
        let offset = i * 32;
        self.root_history[offset..offset + 32].copy_from_slice(root);
    }

    /// Check if a root exists in the root history
    pub fn is_known_root(&self, root: &[u8; 32]) -> bool {
        if self.current_root == *root {
            return true;
        }
        for i in 0..32 {
            if self.get_root_history(i) == *root {
                return true;
            }
        }
        false
    }

    /// Check if tree has capacity for more leaves
    pub fn is_full(&self) -> bool {
        self.next_index >= (1u64 << self.height as u64)
    }
}

/// Nullifier account — existence proves this nullifier has been spent.
/// Created during withdrawal to prevent double-spending.
#[account]
#[derive(InitSpace)]
pub struct NullifierAccount {
    /// The nullifier hash (for reference)
    pub nullifier_hash: [u8; 32],
    /// PDA bump
    pub bump: u8,
}

/// Commitment record — stores each deposit's commitment on-chain
/// for queryability by the relayer and clients.
#[account]
#[derive(InitSpace)]
pub struct CommitmentRecord {
    /// Leaf index in the Merkle tree
    pub index: u64,
    /// The commitment hash (Poseidon(value, Poseidon(nullifier, secret)))
    pub commitment: [u8; 32],
    /// PDA bump
    pub bump: u8,
}
