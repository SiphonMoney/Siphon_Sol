use anchor_lang::prelude::*;

#[error_code]
pub enum ZkPoolError {
    #[msg("Protocol is paused")]
    ProtocolPaused,

    #[msg("Unauthorized: caller is not admin")]
    UnauthorizedAdmin,

    #[msg("Unauthorized: caller is not relayer")]
    UnauthorizedRelayer,

    #[msg("Merkle tree is full")]
    TreeFull,

    #[msg("Invalid commitment: must be non-zero")]
    InvalidCommitment,

    #[msg("Nullifier already spent (double-spend attempt)")]
    NullifierAlreadySpent,

    #[msg("State root not found in root history")]
    InvalidStateRoot,

    #[msg("Invalid amount: must be greater than zero")]
    InvalidAmount,

    #[msg("Insufficient pool balance")]
    InsufficientBalance,

    #[msg("Invalid fee configuration")]
    InvalidFeeConfig,

    #[msg("Arithmetic overflow")]
    Overflow,
}
