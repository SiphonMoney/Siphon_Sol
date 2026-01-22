use anchor_lang::prelude::*;
use crate::state::{SiphonConfig, SiphonVault, VaultStatus};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct UpdateConfig<'info> {
    #[account(
        constraint = admin.key() == config.admin @ SiphonError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SiphonConfig>,
}

pub fn update_executor(ctx: Context<UpdateConfig>, new_executor: Pubkey) -> Result<()> {
    ctx.accounts.config.executor = new_executor;
    msg!("Executor updated to: {}", new_executor);
    Ok(())
}

pub fn update_treasury(ctx: Context<UpdateConfig>, new_treasury: Pubkey) -> Result<()> {
    ctx.accounts.config.treasury = new_treasury;
    msg!("Treasury updated to: {}", new_treasury);
    Ok(())
}

pub fn update_fee(ctx: Context<UpdateConfig>, new_fee_bps: u16) -> Result<()> {
    require!(new_fee_bps <= MAX_FEE_BPS, SiphonError::InvalidFeeConfig);
    ctx.accounts.config.fee_bps = new_fee_bps;
    msg!("Fee updated to: {} bps", new_fee_bps);
    Ok(())
}

pub fn pause_protocol(ctx: Context<UpdateConfig>) -> Result<()> {
    ctx.accounts.config.paused = true;
    msg!("Protocol paused");
    Ok(())
}

pub fn unpause_protocol(ctx: Context<UpdateConfig>) -> Result<()> {
    ctx.accounts.config.paused = false;
    msg!("Protocol unpaused");
    Ok(())
}

pub fn transfer_admin(ctx: Context<UpdateConfig>, new_admin: Pubkey) -> Result<()> {
    ctx.accounts.config.admin = new_admin;
    msg!("Admin transferred to: {}", new_admin);
    Ok(())
}

/// freeze a vault (added for compliance issues)
#[derive(Accounts)]
pub struct FreezeVault<'info> {
    #[account(
        constraint = admin.key() == config.admin @ SiphonError::UnauthorizedAdmin
    )]
    pub admin: Signer<'info>,

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
}

pub fn freeze_vault_handler(ctx: Context<FreezeVault>) -> Result<()> {
    ctx.accounts.vault.status = VaultStatus::Frozen;
    msg!("Vault frozen: {}", ctx.accounts.vault.key());
    Ok(())
}

pub fn unfreeze_vault_handler(ctx: Context<FreezeVault>) -> Result<()> {
    ctx.accounts.vault.status = VaultStatus::Active;
    msg!("Vault unfrozen: {}", ctx.accounts.vault.key());
    Ok(())
}
