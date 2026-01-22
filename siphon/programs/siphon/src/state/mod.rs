use anchor_lang::prelude::*;
/// global configuration

#[account]

#[derive(InitSpace)]
pub struct SiphonConfig {
    pub admin: Pubkey,        // admin authority - who can update config
    pub executor: Pubkey,     // executor authority - who can execute strategies and manage privacy cash calls
    pub fee_bps: u16,         // fee basis points (e.g., 100 = 1%)
    pub treasury: Pubkey,     // account to collect fees
    pub paused: bool,         // protocol status: running or paused
    pub bump: u8,
}

/// status of a user's vault
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum VaultStatus {
    Active,                         // vault is active and can accept deposits or withdrawals
    PendingPrivateWithdrawal,       // vault has a pending private withdrawal
    Frozen,                         // vault is frozen (e.g., compliance issue)
}

impl Default for VaultStatus {
    fn default() -> Self {
        VaultStatus::Active
    }
}

/// seed format: ["vault", owner, asset_mint]
#[account]
#[derive(InitSpace)]
pub struct SiphonVault {
    pub owner: Pubkey,     
    pub asset_mint: Pubkey,    
    pub amount: u64,     // direct vault balance (not private)
    pub privacy_pool_amount: u64,     // amount deposited into privacy cash pool (tracked, not stored here)

    #[max_len(10)]
    pub strategies: Vec<u64>,      // off-chain strategy IDs associated with this vault

    pub status: VaultStatus,
    pub created_at: i64,     // timestamp when vault was created
    pub bump: u8,

}

/// pending private withdrawal record
/// PDA seed format: ["withdrawal", vault]
#[account]
#[derive(InitSpace)]
pub struct PendingWithdrawal {
    pub vault: Pubkey,
    pub amount: u64,     // withdrawal amount
    pub recipient: Pubkey,
    pub initiated_at: i64,     // timestamp when withdrawal was initiated
    pub expires_at: i64,     // expiry timestamp - withdrawal must complete in this time frame
    pub bump: u8,
}
