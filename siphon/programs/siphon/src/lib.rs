use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("8msvrbpBsdVKnF2FNwUAMERfCrG8Yqng9HcfJBRxGPgX");

#[program]
pub mod siphon {
    use super::*;
    /// initialize siphon
    pub fn initialize(
        ctx: Context<Initialize>,
        executor: Pubkey,
        treasury: Pubkey,
        fee_bps: u16,
    ) -> Result<()> {
        instructions::initialize::handler(ctx, executor, treasury, fee_bps)
    }

    /// create new vault for a user and asset
    pub fn create_vault(ctx: Context<CreateVault>) -> Result<()> {
        instructions::create_vault::handler(ctx)
    }

    /// deposit
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount)
    }

    /// withdraw (public)
    pub fn withdraw_direct(ctx: Context<WithdrawDirect>, amount: u64) -> Result<()> {
        instructions::withdraw_direct::handler(ctx, amount)
    }

    /// private withdrawal (via privacy cash)
    pub fn initiate_private_withdrawal(
        ctx: Context<InitiatePrivateWithdrawal>,
        amount: u64,
        recipient: Pubkey,
    ) -> Result<()> {
        instructions::initiate_private_withdrawal::handler(ctx, amount, recipient)
    }

    /// complete a private withdrawal (called by executor)
    pub fn complete_private_withdrawal(ctx: Context<CompletePrivateWithdrawal>) -> Result<()> {
        instructions::complete_private_withdrawal::handler(ctx)
    }

    /// create a strategy
    pub fn create_strategy(ctx: Context<CreateStrategy>, strategy_id: u64) -> Result<()> {
        instructions::create_strategy::handler(ctx, strategy_id)
    }

    /// execute a strategy (called by executor after FHE check)
    pub fn execute_strategy(
        ctx: Context<ExecuteStrategy>,
        strategy_id: u64,
        amount: u64,
    ) -> Result<()> {
        instructions::execute_strategy::handler(ctx, strategy_id, amount)
    }

    /// remove a strategy from a vault
    pub fn remove_strategy(ctx: Context<RemoveStrategy>, strategy_id: u64) -> Result<()> {
        instructions::execute_strategy::remove_strategy_handler(ctx, strategy_id)
    }

    // admin functions
    pub fn update_executor(ctx: Context<UpdateConfig>, new_executor: Pubkey) -> Result<()> {
        instructions::admin::update_executor(ctx, new_executor)
    }

    pub fn update_treasury(ctx: Context<UpdateConfig>, new_treasury: Pubkey) -> Result<()> {
        instructions::admin::update_treasury(ctx, new_treasury)
    }

    pub fn update_fee(ctx: Context<UpdateConfig>, new_fee_bps: u16) -> Result<()> {
        instructions::admin::update_fee(ctx, new_fee_bps)
    }

    pub fn pause_protocol(ctx: Context<UpdateConfig>) -> Result<()> {
        instructions::admin::pause_protocol(ctx)
    }

    pub fn unpause_protocol(ctx: Context<UpdateConfig>) -> Result<()> {
        instructions::admin::unpause_protocol(ctx)
    }

    pub fn transfer_admin(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
        instructions::admin::transfer_admin(ctx, new_admin)
    }

    pub fn freeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::admin::freeze_vault_handler(ctx)
    }

    pub fn unfreeze_vault(ctx: Context<FreezeVault>) -> Result<()> {
        instructions::admin::unfreeze_vault_handler(ctx)
    }
}
