use anchor_lang::prelude::*;

#[error_code]
pub enum SiphonError {
    #[msg("Protocol is currently paused")]
    ProtocolPaused,

    #[msg("Unauthorized call: caller is not the admin")]
    UnauthorizedAdmin,

    #[msg("Unauthorized call: caller is not the executor")]
    UnauthorizedExecutor,

    #[msg("Unauthorized call: caller is not the vault owner")]
    UnauthorizedOwner,

    #[msg("Vault is not in active status")]
    VaultNotActive,

    #[msg("Vault already has a pending withdrawal")]
    WithdrawalAlreadyPending,

    #[msg("No pending withdrawal found")]
    NoPendingWithdrawal,

    #[msg("Withdrawal has expired")]
    WithdrawalExpired,

    #[msg("Insufficient vault balance")]
    InsufficientBalance,

    #[msg("Insufficient privacy pool balance")]
    InsufficientPrivacyPoolBalance,

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("Maximum strategies limit reached")]
    MaxStrategiesReached,

    #[msg("Strategy not found")]
    StrategyNotFound,

    #[msg("Compliance check failed")]
    ComplianceFailed,

    #[msg("Invalid fee configuration")]
    InvalidFeeConfig,

    #[msg("Arithmetic overflow")]
    Overflow,

    #[msg("Vault is frozen")]
    VaultFrozen,
}
