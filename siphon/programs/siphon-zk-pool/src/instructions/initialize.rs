use anchor_lang::prelude::*;
use crate::state::{MerkleTree, PoolConfig};
use crate::constants::*;
use crate::errors::ZkPoolError;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + PoolConfig::INIT_SPACE,
        seeds = [POOL_CONFIG_SEED],
        bump
    )]
    pub pool_config: Account<'info, PoolConfig>,

    /// Merkle tree account — zero_copy, large account
    #[account(
        init,
        payer = admin,
        space = 8 + std::mem::size_of::<MerkleTree>(),
        seeds = [MERKLE_TREE_SEED],
        bump
    )]
    pub merkle_tree: AccountLoader<'info, MerkleTree>,

    /// Pool vault for holding SOL deposits
    /// CHECK: This is a PDA that holds lamports, not a data account
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED],
        bump
    )]
    pub pool_vault: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<Initialize>,
    relayer: Pubkey,
    fee_recipient: Pubkey,
    fee_bps: u16,
) -> Result<()> {
    require!(fee_bps <= MAX_FEE_BPS, ZkPoolError::InvalidFeeConfig);

    // Initialize pool config
    let config = &mut ctx.accounts.pool_config;
    config.admin = ctx.accounts.admin.key();
    config.relayer = relayer;
    config.fee_bps = fee_bps;
    config.fee_recipient = fee_recipient;
    config.verifier_program = Pubkey::default();
    config.paused = false;
    config.bump = ctx.bumps.pool_config;
    config.tree_bump = ctx.bumps.merkle_tree;
    config.vault_bump = ctx.bumps.pool_vault;

    // Initialize Merkle tree
    let mut tree = ctx.accounts.merkle_tree.load_init()?;
    tree.authority = relayer;
    tree.next_index = 0;
    tree.current_root = [0u8; 32];
    tree.root_history = [0u8; 1024];
    tree.root_history_index = 0;
    tree.height = MERKLE_TREE_HEIGHT;
    tree.bump = ctx.bumps.merkle_tree;
    tree._padding = [0u8; 6];

    msg!("ZK Pool initialized");
    msg!("Admin: {}", ctx.accounts.admin.key());
    msg!("Relayer: {}", relayer);
    msg!("Fee: {} bps", fee_bps);
    msg!("Tree height: {}", MERKLE_TREE_HEIGHT);

    Ok(())
}
