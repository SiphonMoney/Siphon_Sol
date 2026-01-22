use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{SiphonConfig, SiphonVault, VaultStatus};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct ExecuteStrategy<'info> {
    /// Executor authority (backend) executes strategies
    #[account(
        constraint = executor.key() == config.executor @ SiphonError::UnauthorizedExecutor
    )]
    pub executor: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SiphonConfig>,

    #[account(
        mut,
        seeds = [VAULT_SEED, vault.owner.as_ref(), vault.asset_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, SiphonVault>,

    pub asset_mint: Account<'info, Mint>,

    /// Vault's token account
    #[account(
        mut,
        seeds = [VAULT_TOKEN_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_token_account.mint == asset_mint.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,

    // Note: In a full implementation, we would include:
    // - Jupiter swap accounts for executing trades
    // - Destination token accounts
    // For now, this is a placeholder that the executor calls after
    // verifying FHE conditions off-chain
}

/// Execute a strategy (called by executor after FHE condition check passes)
/// The actual swap is performed via Jupiter in a separate instruction
pub fn handler(
    ctx: Context<ExecuteStrategy>,
    strategy_id: u64,
    _amount: u64, // Amount to use in the strategy execution
) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);

    let vault = &ctx.accounts.vault;
    require!(vault.status == VaultStatus::Active, SiphonError::VaultNotActive);

    // Verify strategy exists
    require!(
        vault.strategies.contains(&strategy_id),
        SiphonError::StrategyNotFound
    );

    // In a full implementation:
    // 1. FHE server has already checked the condition
    // 2. This instruction prepares the vault for the swap
    // 3. A follow-up Jupiter swap instruction performs the actual trade
    // 4. Results are recorded

    msg!("Strategy execution initiated: {}", strategy_id);
    msg!("Vault owner: {}", vault.owner);

    // The actual swap would happen via Jupiter CPI here
    // For the hackathon, this demonstrates the structure

    Ok(())
}

/// Remove a strategy from the vault
#[derive(Accounts)]
pub struct RemoveStrategy<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SiphonConfig>,

    #[account(
        mut,
        seeds = [VAULT_SEED, owner.key().as_ref(), vault.asset_mint.as_ref()],
        bump = vault.bump,
        has_one = owner,
    )]
    pub vault: Account<'info, SiphonVault>,
}

pub fn remove_strategy_handler(ctx: Context<RemoveStrategy>, strategy_id: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);

    let vault = &mut ctx.accounts.vault;

    // Find and remove strategy
    let position = vault
        .strategies
        .iter()
        .position(|&id| id == strategy_id)
        .ok_or(SiphonError::StrategyNotFound)?;

    vault.strategies.remove(position);

    msg!("Strategy removed: {}", strategy_id);
    msg!("Remaining strategies: {}", vault.strategies.len());

    Ok(())
}
