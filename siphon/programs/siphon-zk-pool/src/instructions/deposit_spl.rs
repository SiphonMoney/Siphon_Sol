use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use anchor_spl::associated_token::AssociatedToken;
use crate::state::{MerkleTree, PoolConfig, CommitmentRecord};
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::CommitmentInserted;

#[derive(Accounts)]
#[instruction(commitment: [u8; 32], encrypted_output: Vec<u8>, amount: u64, leaf_index: u64)]
pub struct DepositSpl<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(
        seeds = [POOL_CONFIG_SEED],
        bump = pool_config.bump,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        mut,
        seeds = [MERKLE_TREE_SEED],
        bump = pool_config.tree_bump,
    )]
    pub merkle_tree: AccountLoader<'info, MerkleTree>,

    /// SPL token mint (e.g., USDC)
    pub token_mint: Account<'info, Mint>,

    /// Depositor's token account
    #[account(
        mut,
        constraint = depositor_token_account.mint == token_mint.key(),
        constraint = depositor_token_account.owner == depositor.key(),
    )]
    pub depositor_token_account: Account<'info, TokenAccount>,

    /// Pool's token account for this mint
    #[account(
        init_if_needed,
        payer = depositor,
        associated_token::mint = token_mint,
        associated_token::authority = pool_vault,
    )]
    pub pool_token_account: Account<'info, TokenAccount>,

    /// Pool vault (authority for token accounts)
    /// CHECK: PDA used as authority
    #[account(
        seeds = [POOL_VAULT_SEED],
        bump = pool_config.vault_bump,
    )]
    pub pool_vault: SystemAccount<'info>,

    /// Commitment record for this deposit
    #[account(
        init,
        payer = depositor,
        space = 8 + CommitmentRecord::INIT_SPACE,
        seeds = [COMMITMENT_SEED, &leaf_index.to_le_bytes()],
        bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DepositSpl>,
    commitment: [u8; 32],
    encrypted_output: Vec<u8>,
    amount: u64,
    leaf_index: u64,
) -> Result<()> {
    require!(!ctx.accounts.pool_config.paused, ZkPoolError::ProtocolPaused);
    require!(amount > 0, ZkPoolError::InvalidAmount);
    require!(commitment != [0u8; 32], ZkPoolError::InvalidCommitment);

    let mut tree = ctx.accounts.merkle_tree.load_mut()?;
    require!(!tree.is_full(), ZkPoolError::TreeFull);
    require!(leaf_index == tree.next_index, ZkPoolError::InvalidAmount);

    // Transfer SPL tokens from depositor to pool token account
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.depositor_token_account.to_account_info(),
                to: ctx.accounts.pool_token_account.to_account_info(),
                authority: ctx.accounts.depositor.to_account_info(),
            },
        ),
        amount,
    )?;

    // Store commitment record
    let record = &mut ctx.accounts.commitment_record;
    record.index = leaf_index;
    record.commitment = commitment;
    record.bump = ctx.bumps.commitment_record;

    // Increment leaf index
    tree.next_index = leaf_index.checked_add(1).ok_or(ZkPoolError::Overflow)?;

    let mint_key = ctx.accounts.token_mint.key();

    // Emit event for relayer indexing
    emit!(CommitmentInserted {
        index: leaf_index,
        commitment,
        encrypted_output,
        amount,
        mint: Some(mint_key),
    });

    msg!("SPL deposit: index={}, amount={}, mint={}", leaf_index, amount, mint_key);

    Ok(())
}
