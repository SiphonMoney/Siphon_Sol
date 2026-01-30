/// PDA seeds
pub const MERKLE_TREE_SEED: &[u8] = b"merkle_tree";
pub const POOL_CONFIG_SEED: &[u8] = b"pool_config";
pub const POOL_VAULT_SEED: &[u8] = b"pool_vault";
pub const POOL_TOKEN_SEED: &[u8] = b"pool_token";
pub const NULLIFIER_SEED: &[u8] = b"nullifier";
pub const COMMITMENT_SEED: &[u8] = b"commitment";

/// Merkle tree height (2^20 = ~1M leaves, sufficient for devnet)
pub const MERKLE_TREE_HEIGHT: u8 = 20;

/// Root history size (ring buffer of recent roots for withdrawal verification)
/// Limited to 32 because bytemuck Pod/Zeroable only supports arrays up to 1024 bytes
pub const ROOT_HISTORY_SIZE: usize = 32;

/// Maximum fee in basis points (10%)
pub const MAX_FEE_BPS: u16 = 1000;
