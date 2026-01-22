use anchor_lang::prelude::*;
use crate::state::SiphonConfig;
use crate::constants::*;
use crate::errors::SiphonError;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + SiphonConfig::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, SiphonConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    executor: Pubkey,
    treasury: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, SiphonError::InvalidFeeConfig);

    let config = &mut ctx.accounts.config;
    config.admin = ctx.accounts.admin.key();
    config.executor = executor;
    config.treasury = treasury;
    config.fee_bps = fee_bps;
    config.paused = false;
    config.bump = ctx.bumps.config;

    msg!("Siphon Protocol initialized");
    msg!("Admin: {}", config.admin);
    msg!("Executor: {}", config.executor);
    msg!("Fee: {} bps", config.fee_bps);

    Ok(())
}
