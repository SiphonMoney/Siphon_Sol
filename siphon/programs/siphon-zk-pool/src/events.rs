use anchor_lang::prelude::*;

#[event]
pub struct CommitmentInserted {
    pub index: u64,
    pub commitment: [u8; 32],
    pub encrypted_output: Vec<u8>,
    pub amount: u64,
    /// None for SOL, Some(mint) for SPL tokens
    pub mint: Option<Pubkey>,
}

#[event]
pub struct WithdrawalProcessed {
    pub nullifier_hash: [u8; 32],
    pub recipient: Pubkey,
    pub amount: u64,
    pub fee: u64,
    pub mint: Option<Pubkey>,
    /// Change commitment (if partial withdrawal)
    pub new_commitment: Option<[u8; 32]>,
    pub new_index: Option<u64>,
}

#[event]
pub struct RootUpdated {
    pub new_root: [u8; 32],
    pub root_index: u64,
}
