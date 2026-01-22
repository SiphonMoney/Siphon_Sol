use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{SiphonConfig, SiphonVault, VaultStatus};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct WithdrawDirect<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, SiphonConfig>,

    #[account(
        mut,
        seeds = [VAULT_SEED, owner.key().as_ref(), asset_mint.key().as_ref()],
        bump = vault.bump,
        has_one = owner,
        has_one = asset_mint,
    )]
    pub vault: Account<'info, SiphonVault>,

    pub asset_mint: Account<'info, Mint>,

    /// User's token account to receive tokens
    #[account(
        mut,
        constraint = user_token_account.owner == owner.key(),
        constraint = user_token_account.mint == asset_mint.key(),
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// Vault's token account to transfer from
    #[account(
        mut,
        seeds = [VAULT_TOKEN_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_token_account.mint == asset_mint.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<WithdrawDirect>, amount: u64) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);
    require!(amount > 0, SiphonError::InvalidAmount);

    let vault = &ctx.accounts.vault;
    require!(vault.status == VaultStatus::Active, SiphonError::VaultNotActive);
    require!(vault.amount >= amount, SiphonError::InsufficientBalance);

    // Create signer seeds for vault PDA
    let owner_key = ctx.accounts.owner.key();
    let asset_mint_key = ctx.accounts.asset_mint.key();
    let seeds = &[
        VAULT_SEED,
        owner_key.as_ref(),
        asset_mint_key.as_ref(),
        &[vault.bump],
    ];
    let signer_seeds = &[&seeds[..]];

    // Transfer tokens from vault to user
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.user_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)?;

    // Update vault balance
    let vault = &mut ctx.accounts.vault;
    vault.amount = vault.amount.checked_sub(amount).ok_or(SiphonError::Overflow)?;

    msg!("Withdrawn {} tokens from vault", amount);
    msg!("Remaining vault balance: {}", vault.amount);

    Ok(())
}
