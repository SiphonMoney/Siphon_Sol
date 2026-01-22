use anchor_lang::prelude::*;
use crate::state::{SiphonConfig, SiphonVault, VaultStatus, PendingWithdrawal};
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct CompletePrivateWithdrawal<'info> {
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

    /// close the pending withdrawal record
    #[account(
        mut,
        seeds = [WITHDRAWAL_SEED, vault.key().as_ref()],
        bump = pending_withdrawal.bump,
        constraint = pending_withdrawal.vault == vault.key(),
        close = refund_recipient
    )]
    pub pending_withdrawal: Account<'info, PendingWithdrawal>,

    /// Account to receive rent refund from closing pending_withdrawal
    /// CHECK: This is the vault owner who should receive the rent back
    #[account(mut, constraint = refund_recipient.key() == vault.owner)]
    pub refund_recipient: AccountInfo<'info>,
}

pub fn handler(ctx: Context<CompletePrivateWithdrawal>) -> Result<()> {
    let vault = &ctx.accounts.vault;
    let pending = &ctx.accounts.pending_withdrawal;

    require!(
        vault.status == VaultStatus::PendingPrivateWithdrawal,
        SiphonError::NoPendingWithdrawal
    );

    let clock = Clock::get()?;
    require!(clock.unix_timestamp <= pending.expires_at, SiphonError::WithdrawalExpired);

    // Update vault - funds have been sent via Privacy Cash
    let vault = &mut ctx.accounts.vault;
    vault.privacy_pool_amount = vault
        .privacy_pool_amount
        .checked_sub(pending.amount)
        .ok_or(SiphonError::Overflow)?;
    vault.status = VaultStatus::Active;

    msg!("Private withdrawal completed");
    msg!("Amount: {}", pending.amount);
    msg!("Recipient: {}", pending.recipient);

    Ok(())
}
