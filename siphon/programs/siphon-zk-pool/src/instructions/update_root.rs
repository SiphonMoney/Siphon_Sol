use anchor_lang::prelude::*;
use crate::state::{MerkleTree, PoolConfig};
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::RootUpdated;

#[derive(Accounts)]
pub struct UpdateRoot<'info> {
    pub relayer: Signer<'info>,

    #[account(
        seeds = [POOL_CONFIG_SEED],
        bump = pool_config.bump,
        constraint = pool_config.relayer == relayer.key() @ ZkPoolError::UnauthorizedRelayer,
    )]
    pub pool_config: Account<'info, PoolConfig>,

    #[account(
        mut,
        seeds = [MERKLE_TREE_SEED],
        bump = pool_config.tree_bump,
    )]
    pub merkle_tree: AccountLoader<'info, MerkleTree>,
}

pub fn handler(ctx: Context<UpdateRoot>, new_root: [u8; 32]) -> Result<()> {
    require!(!ctx.accounts.pool_config.paused, ZkPoolError::ProtocolPaused);

    let mut tree = ctx.accounts.merkle_tree.load_mut()?;

    // Push old root into history ring buffer
    let idx = (tree.root_history_index as usize) % ROOT_HISTORY_SIZE;
    let old_root = tree.current_root;
    tree.set_root_history(idx, &old_root);
    tree.root_history_index = tree.root_history_index.wrapping_add(1);

    // Set new root
    tree.current_root = new_root;

    emit!(RootUpdated {
        new_root,
        root_index: tree.root_history_index,
    });

    msg!("Root updated");

    Ok(())
}
