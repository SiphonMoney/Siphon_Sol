use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};
use crate::state::{MerkleTree, PoolConfig, NullifierAccount};
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::{WithdrawalProcessed, CommitmentInserted};
use crate::instructions::withdraw_sol::WithdrawInputs;

#[derive(Accounts)]
#[instruction(inputs: WithdrawInputs, recipient: Pubkey, amount: u64, fee: u64)]
pub struct WithdrawSpl<'info> {
    #[account(mut)]
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

    /// Pool vault (authority for token accounts)
    /// CHECK: PDA used as token authority
    #[account(
        seeds = [POOL_VAULT_SEED],
        bump = pool_config.vault_bump,
    )]
    pub pool_vault: SystemAccount<'info>,

    pub token_mint: Account<'info, Mint>,

    /// Pool's token account for this mint
    #[account(
        mut,
        constraint = pool_token_account.mint == token_mint.key(),
        constraint = pool_token_account.owner == pool_vault.key(),
    )]
    pub pool_token_account: Account<'info, TokenAccount>,

    /// Recipient's token account
    #[account(
        mut,
        constraint = recipient_token_account.mint == token_mint.key(),
    )]
    pub recipient_token_account: Account<'info, TokenAccount>,

    /// Fee recipient's token account
    #[account(
        mut,
        constraint = fee_recipient_token_account.mint == token_mint.key(),
    )]
    pub fee_recipient_token_account: Account<'info, TokenAccount>,

    /// Nullifier PDA — double-spend prevention
    #[account(
        init,
        payer = relayer,
        space = 8 + NullifierAccount::INIT_SPACE,
        seeds = [NULLIFIER_SEED, inputs.nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier_account: Account<'info, NullifierAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<WithdrawSpl>,
    inputs: WithdrawInputs,
    _recipient: Pubkey,
    amount: u64,
    fee: u64,
) -> Result<()> {
    require!(!ctx.accounts.pool_config.paused, ZkPoolError::ProtocolPaused);
    require!(amount > 0, ZkPoolError::InvalidAmount);

    // Verify the state root is known
    {
        let tree = ctx.accounts.merkle_tree.load()?;
        require!(
            tree.is_known_root(&inputs.state_root),
            ZkPoolError::InvalidStateRoot
        );
    }

    // Mark nullifier as spent
    let nullifier = &mut ctx.accounts.nullifier_account;
    nullifier.nullifier_hash = inputs.nullifier_hash;
    nullifier.bump = ctx.bumps.nullifier_account;

    // Transfer SPL tokens from pool to recipient
    let vault_bump = ctx.accounts.pool_config.vault_bump;
    let vault_seeds: &[&[&[u8]]] = &[&[POOL_VAULT_SEED, &[vault_bump]]];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.pool_token_account.to_account_info(),
                to: ctx.accounts.recipient_token_account.to_account_info(),
                authority: ctx.accounts.pool_vault.to_account_info(),
            },
            vault_seeds,
        ),
        amount,
    )?;

    // Transfer fee
    if fee > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.pool_token_account.to_account_info(),
                    to: ctx.accounts.fee_recipient_token_account.to_account_info(),
                    authority: ctx.accounts.pool_vault.to_account_info(),
                },
                vault_seeds,
            ),
            fee,
        )?;
    }

    // Handle change commitment
    let mut new_index: Option<u64> = None;
    let zero_commitment = [0u8; 32];
    if inputs.new_commitment != zero_commitment {
        let mut tree = ctx.accounts.merkle_tree.load_mut()?;
        require!(!tree.is_full(), ZkPoolError::TreeFull);
        let idx = tree.next_index;
        tree.next_index = idx.checked_add(1).ok_or(ZkPoolError::Overflow)?;
        new_index = Some(idx);

        emit!(CommitmentInserted {
            index: idx,
            commitment: inputs.new_commitment,
            encrypted_output: vec![],
            amount: 0,
            mint: Some(ctx.accounts.token_mint.key()),
        });
    }

    let mint_key = ctx.accounts.token_mint.key();

    emit!(WithdrawalProcessed {
        nullifier_hash: inputs.nullifier_hash,
        recipient: ctx.accounts.recipient_token_account.owner,
        amount,
        fee,
        mint: Some(mint_key),
        new_commitment: if inputs.new_commitment != zero_commitment {
            Some(inputs.new_commitment)
        } else {
            None
        },
        new_index,
    });

    msg!("SPL withdrawal: amount={}, fee={}, mint={}", amount, fee, mint_key);

    Ok(())
}
