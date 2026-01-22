use anchor_lang::prelude::*;
use crate::state::{SiphonConfig, SiphonVault, VaultStatus};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct CreateStrategy<'info> {
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

/// Creates a strategy and stores the ID on-chain
/// The actual strategy parameters are stored off-chain (encrypted with FHE)
pub fn handler(ctx: Context<CreateStrategy>, strategy_id: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);

    let vault = &ctx.accounts.vault;
    require!(vault.status == VaultStatus::Active, SiphonError::VaultNotActive);
    require!(
        vault.strategies.len() < MAX_STRATEGIES_PER_VAULT,
        SiphonError::MaxStrategiesReached
    );

    // Add strategy ID to vault
    let vault = &mut ctx.accounts.vault;
    vault.strategies.push(strategy_id);

    msg!("Strategy created: {}", strategy_id);
    msg!("Total strategies: {}", vault.strategies.len());

    Ok(())
}
