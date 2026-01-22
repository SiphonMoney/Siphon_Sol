use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};
use crate::state::{SiphonConfig, SiphonVault, VaultStatus};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct CreateVault<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SiphonConfig>,

    /// The asset mint for this vault (e.g., USDC)
    pub asset_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = owner,
        space = 8 + SiphonVault::INIT_SPACE,
        seeds = [VAULT_SEED, owner.key().as_ref(), asset_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, SiphonVault>,

    /// Token account owned by the vault PDA to hold assets
    #[account(
        init,
        payer = owner,
        seeds = [VAULT_TOKEN_SEED, vault.key().as_ref()],
        bump,
        token::mint = asset_mint,
        token::authority = vault,
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<CreateVault>) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);

    let vault = &mut ctx.accounts.vault;
    vault.owner = ctx.accounts.owner.key();
    vault.asset_mint = ctx.accounts.asset_mint.key();
    vault.amount = 0;
    vault.privacy_pool_amount = 0;
    vault.strategies = Vec::new();
    vault.status = VaultStatus::Active;
    vault.created_at = Clock::get()?.unix_timestamp;
    vault.bump = ctx.bumps.vault;

    msg!("Vault created for owner: {}", vault.owner);
    msg!("Asset mint: {}", vault.asset_mint);

    Ok(())
}
