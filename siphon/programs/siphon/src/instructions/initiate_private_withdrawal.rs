use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{SiphonConfig, SiphonVault, VaultStatus, PendingWithdrawal};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct InitiatePrivateWithdrawal<'info> {
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

    /// Create pending withdrawal record
    #[account(
        init,
        payer = owner,
        space = 8 + PendingWithdrawal::INIT_SPACE,
        seeds = [WITHDRAWAL_SEED, vault.key().as_ref()],
        bump
    )]
    pub pending_withdrawal: Account<'info, PendingWithdrawal>,

    /// Vault's token account
    #[account(
        mut,
        seeds = [VAULT_TOKEN_SEED, vault.key().as_ref()],
        bump,
        constraint = vault_token_account.mint == asset_mint.key(),
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// Executor's token account (to hold funds during private withdrawal)
    /// This is controlled by the executor keypair for Privacy Cash operations
    #[account(
        mut,
        constraint = executor_token_account.mint == asset_mint.key(),
    )]
    pub executor_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<InitiatePrivateWithdrawal>,
    amount: u64,
    recipient: Pubkey,
) -> Result<()> {
    require!(!ctx.accounts.config.paused, SiphonError::ProtocolPaused);
    require!(amount > 0, SiphonError::InvalidAmount);

    let vault = &ctx.accounts.vault;
    require!(vault.status == VaultStatus::Active, SiphonError::VaultNotActive);
    require!(vault.amount >= amount, SiphonError::InsufficientBalance);

    let clock = Clock::get()?;

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

    // Transfer tokens from vault to executor (for Privacy Cash deposit)
    let cpi_accounts = Transfer {
        from: ctx.accounts.vault_token_account.to_account_info(),
        to: ctx.accounts.executor_token_account.to_account_info(),
        authority: ctx.accounts.vault.to_account_info(),
    };
    let cpi_program = ctx.accounts.token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)?;

    // Update vault
    let vault = &mut ctx.accounts.vault;
    vault.amount = vault.amount.checked_sub(amount).ok_or(SiphonError::Overflow)?;
    vault.privacy_pool_amount = vault.privacy_pool_amount.checked_add(amount).ok_or(SiphonError::Overflow)?;
    vault.status = VaultStatus::PendingPrivateWithdrawal;

    // Create pending withdrawal record
    let pending = &mut ctx.accounts.pending_withdrawal;
    pending.vault = ctx.accounts.vault.key();
    pending.amount = amount;
    pending.recipient = recipient;
    pending.initiated_at = clock.unix_timestamp;
    pending.expires_at = clock.unix_timestamp + WITHDRAWAL_TIMEOUT_SECONDS;
    pending.bump = ctx.bumps.pending_withdrawal;

    msg!("Private withdrawal initiated");
    msg!("Amount: {}", amount);
    msg!("Recipient: {}", recipient);
    msg!("Expires at: {}", pending.expires_at);

    Ok(())
}
