use anchor_lang::prelude::*;
use anchor_lang::system_program;
use crate::state::{MerkleTree, PoolConfig, NullifierAccount};
use crate::constants::*;
use crate::errors::ZkPoolError;
use crate::events::{WithdrawalProcessed, CommitmentInserted};

/// Public inputs from the Noir ZK proof (verified off-chain by relayer)
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawInputs {
    pub nullifier_hash: [u8; 32],
    pub state_root: [u8; 32],
    pub new_commitment: [u8; 32],
}

#[derive(Accounts)]
#[instruction(inputs: WithdrawInputs, recipient: Pubkey, amount: u64, fee: u64)]
pub struct WithdrawSol<'info> {
    /// Relayer authority — only the relayer can submit withdrawals
    /// (relayer has verified the Noir/Groth16 proof off-chain)
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

    /// Pool vault holding SOL
    /// CHECK: PDA that holds lamports
    #[account(
        mut,
        seeds = [POOL_VAULT_SEED],
        bump = pool_config.vault_bump,
    )]
    pub pool_vault: SystemAccount<'info>,

    /// Nullifier PDA — created here to mark this nullifier as spent.
    /// If it already exists, the transaction fails (double-spend prevention).
    #[account(
        init,
        payer = relayer,
        space = 8 + NullifierAccount::INIT_SPACE,
        seeds = [NULLIFIER_SEED, inputs.nullifier_hash.as_ref()],
        bump
    )]
    pub nullifier_account: Account<'info, NullifierAccount>,

    /// Recipient of the withdrawal
    /// CHECK: Any valid account can receive SOL
    #[account(mut)]
    pub recipient: SystemAccount<'info>,

    /// Fee recipient
    /// CHECK: Account specified in pool config
    #[account(
        mut,
        constraint = fee_recipient.key() == pool_config.fee_recipient @ ZkPoolError::InvalidFeeConfig,
    )]
    pub fee_recipient: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<WithdrawSol>,
    inputs: WithdrawInputs,
    _recipient: Pubkey,
    amount: u64,
    fee: u64,
) -> Result<()> {
    require!(!ctx.accounts.pool_config.paused, ZkPoolError::ProtocolPaused);
    require!(amount > 0, ZkPoolError::InvalidAmount);

    // Verify the state root is known (exists in root history)
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

    // Transfer SOL from pool vault to recipient
    let total_out = amount.checked_add(fee).ok_or(ZkPoolError::Overflow)?;
    let vault_lamports = ctx.accounts.pool_vault.lamports();
    require!(vault_lamports >= total_out, ZkPoolError::InsufficientBalance);

    // PDA signer seeds for pool_vault
    let vault_seeds = &[
        POOL_VAULT_SEED,
        &[ctx.accounts.pool_config.vault_bump],
    ];
    let signer_seeds = &[&vault_seeds[..]];

    // Transfer amount to recipient using CPI with PDA signer
    system_program::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.pool_vault.to_account_info(),
                to: ctx.accounts.recipient.to_account_info(),
            },
            signer_seeds,
        ),
        amount,
    )?;

    // Transfer fee to fee_recipient using CPI with PDA signer
    if fee > 0 {
        system_program::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.pool_vault.to_account_info(),
                    to: ctx.accounts.fee_recipient.to_account_info(),
                },
                signer_seeds,
            ),
            fee,
        )?;
    }

    // If there's a change commitment (partial withdrawal), store it as a new leaf
    let mut new_index: Option<u64> = None;
    let zero_commitment = [0u8; 32];
    if inputs.new_commitment != zero_commitment {
        let mut tree = ctx.accounts.merkle_tree.load_mut()?;
        require!(!tree.is_full(), ZkPoolError::TreeFull);
        let idx = tree.next_index;
        tree.next_index = idx.checked_add(1).ok_or(ZkPoolError::Overflow)?;
        new_index = Some(idx);

        // Note: CommitmentRecord for change output is NOT created here
        // because we can't init another PDA in the same instruction easily.
        // The relayer indexes the change commitment from the event.
        emit!(CommitmentInserted {
            index: idx,
            commitment: inputs.new_commitment,
            encrypted_output: vec![],
            amount: 0, // Change amount is hidden
            mint: None,
        });
    }

    emit!(WithdrawalProcessed {
        nullifier_hash: inputs.nullifier_hash,
        recipient: ctx.accounts.recipient.key(),
        amount,
        fee,
        mint: None,
        new_commitment: if inputs.new_commitment != zero_commitment {
            Some(inputs.new_commitment)
        } else {
            None
        },
        new_index,
    });

    msg!("SOL withdrawal: amount={}, fee={}", amount, fee);

    Ok(())
}
