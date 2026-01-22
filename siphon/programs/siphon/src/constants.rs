/// PDA seeds
pub const CONFIG_SEED: &[u8] = b"config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const WITHDRAWAL_SEED: &[u8] = b"withdrawal";
pub const VAULT_TOKEN_SEED: &[u8] = b"vault_token";

/// limits
pub const MAX_STRATEGIES_PER_VAULT: usize = 10;
pub const MAX_FEE_BPS: u16 = 1000; // 10% max fee

/// timeouts
pub const WITHDRAWAL_TIMEOUT_SECONDS: i64 = 3600;

/// Account sizes
pub const CONFIG_SIZE: usize = 8 + 32 + 32 + 2 + 32 + 1 + 1; // discriminator + fields
pub const VAULT_SIZE: usize = 8 + 32 + 32 + 8 + 8 + (4 + 10 * 8) + 1 + 8 + 1; // with max strategies
pub const PENDING_WITHDRAWAL_SIZE: usize = 8 + 32 + 8 + 32 + 8 + 8 + 1;
