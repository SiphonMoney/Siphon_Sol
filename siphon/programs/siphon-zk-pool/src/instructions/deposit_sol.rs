use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{MerkleTree, PoolConfig, CommitmentRecord};
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::CommitmentInserted;

#[derive(Accounts)]
#[instruction(commitment: [u8; 32], encrypted_output: Vec<u8>, amount: u64, leaf_index: u64)]
pub struct DepositSol<'info> {
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

    /// Pool vault that receives SOL deposits
    /// CHECK: PDA that holds lamports
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED],
        bump = pool_config.vault_bump,
    )]
    pub pool_vault: SystemAccount<'info>,

    /// Commitment record for this deposit (keyed by leaf_index)
    #[account(
        init,
        payer = depositor,
        space = 8 + CommitmentRecord::INIT_SPACE,
        seeds = [COMMITMENT_SEED, &leaf_index.to_le_bytes()],
        bump
    )]
    pub commitment_record: Account<'info, CommitmentRecord>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<DepositSol>,
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

    // Verify the caller passed the correct next index
    require!(leaf_index == tree.next_index, ZkPoolError::InvalidAmount);

    // Transfer SOL from depositor to pool vault
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.depositor.to_account_info(),
                to: ctx.accounts.pool_vault.to_account_info(),
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

    // Emit event for relayer indexing
    emit!(CommitmentInserted {
        index: leaf_index,
        commitment,
        encrypted_output,
        amount,
        mint: None,
    });

    msg!("SOL deposit: index={}, amount={}", leaf_index, amount);

    Ok(())
}
