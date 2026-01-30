use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod events;
pub mod state;
pub mod instructions;

use instructions::*;

declare_id!("3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb");

#[program]
pub mod siphon_zk_pool {
    use super::*;

    /// Initialize the ZK privacy pool: Merkle tree, config, and SOL vault
    pub fn initialize(
        ctx: Context<Initialize>,
        relayer: Pubkey,
        fee_recipient: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, relayer, fee_recipient, fee_bps)
    }

    /// Deposit SOL into the privacy pool with a commitment
    pub fn deposit_sol(
        ctx: Context<DepositSol>,
        commitment: [u8; 32],
        encrypted_output: Vec<u8>,
        amount: u64,
        leaf_index: u64,
    ) -> Result<()> {
        instructions::deposit_sol::handler(ctx, commitment, encrypted_output, amount, leaf_index)
    }

    /// Deposit SPL tokens into the privacy pool with a commitment
    pub fn deposit_spl(
        ctx: Context<DepositSpl>,
        commitment: [u8; 32],
        encrypted_output: Vec<u8>,
        amount: u64,
        leaf_index: u64,
    ) -> Result<()> {
        instructions::deposit_spl::handler(ctx, commitment, encrypted_output, amount, leaf_index)
    }

    /// Update the Merkle root (relayer only, after computing off-chain)
    pub fn update_root(ctx: Context<UpdateRoot>, new_root: [u8; 32]) -> Result<()> {
        instructions::update_root::handler(ctx, new_root)
    }

    /// Withdraw SOL from the privacy pool (relayer submits after off-chain proof verification)
    pub fn withdraw_sol(
        ctx: Context<WithdrawSol>,
        inputs: WithdrawInputs,
        recipient: Pubkey,
        amount: u64,
        fee: u64,
    ) -> Result<()> {
        instructions::withdraw_sol::handler(ctx, inputs, recipient, amount, fee)
    }

    /// Withdraw SPL tokens from the privacy pool
    pub fn withdraw_spl(
        ctx: Context<WithdrawSpl>,
        inputs: WithdrawInputs,
        recipient: Pubkey,
        amount: u64,
        fee: u64,
    ) -> Result<()> {
        instructions::withdraw_spl::handler(ctx, inputs, recipient, amount, fee)
    }
}
