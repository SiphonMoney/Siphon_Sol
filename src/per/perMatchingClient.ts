import { AnchorProvider, BN, Program } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram, Transaction, TransactionInstruction } from '@solana/web3.js';
import erSdk from '@magicblock-labs/ephemeral-rollups-sdk';
import { PER_MATCHING_PROGRAM_ID, ER_VALIDATOR, PER_MATCHING_IDL_PATH, PER_BASE_URL } from '@/config/env';
import { perUserOrderPda } from '@/solana/pdas';
import { loadIdl } from '@/solana/idl';

type Side = 'buy' | 'sell' | number;
type AccountsMap = Record<string, PublicKey>;
type RpcOptions = { commitment?: string };
type Member = { flags: number; pubkey: PublicKey };

type MagicblockSdk = {
  AUTHORITY_FLAG: number;
  createDelegatePermissionInstruction: (args: {
    payer: PublicKey;
    validator: PublicKey;
    permissionedAccount: [PublicKey, boolean];
    authority: [PublicKey, boolean];
  }) => TransactionInstruction;
  permissionPdaFromAccount: (account: PublicKey) => PublicKey;
  waitUntilPermissionActive: (teeUrl: string, account: PublicKey) => Promise<boolean>;
};

type InitUserOrderBuilder = {
  accountsPartial: (accounts: AccountsMap) => {
    instruction: () => Promise<TransactionInstruction>;
  };
};

type AddUserOrderBuilder = {
  accountsPartial: (accounts: AccountsMap) => {
    rpc: (options?: RpcOptions) => Promise<string>;
  };
};

type PerProgramMethods = {
  initUserOrder: (...args: unknown[]) => InitUserOrderBuilder;
  addUserOrder: (...args: unknown[]) => AddUserOrderBuilder;
  createPermission: (...args: unknown[]) => {
    accountsPartial: (accounts: AccountsMap) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
  delegatePda: (...args: unknown[]) => {
    accounts: (accounts: AccountsMap) => {
      instruction: () => Promise<TransactionInstruction>;
    };
  };
};

async function getPerProgram(provider: AnchorProvider, programId = PER_MATCHING_PROGRAM_ID): Promise<Program> {
  const idl = await loadIdl(provider, programId, PER_MATCHING_IDL_PATH || undefined);
  return new Program(idl, provider);
}

function normalizeSide(side: Side): number {
  if (typeof side === 'number') return side;
  return side === 'buy' ? 0 : 1;
}

interface InitUserOrderParams {
  provider: AnchorProvider;
  market: PublicKey;
  ticketIdU64: bigint;
  relayer: PublicKey;
  permissionIxs?: TransactionInstruction[];
  erValidator?: PublicKey;
  autoPermission?: boolean;
  programId?: PublicKey;
  accounts?: Record<string, PublicKey>;
}

export async function initUserOrderPlaceholder(params: InitUserOrderParams): Promise<Transaction> {
  const {
    provider,
    market,
    ticketIdU64,
    relayer,
    permissionIxs = [],
    erValidator = ER_VALIDATOR,
    autoPermission = true,
    programId = PER_MATCHING_PROGRAM_ID,
    accounts = {},
  } = params;

  const program = await getPerProgram(provider, programId);
  const user = provider.wallet.publicKey;
  if (!user) {
    throw new Error('Wallet public key not available');
  }

  const userOrder = perUserOrderPda(programId, market, user, ticketIdU64);
  const ticketId = new BN(ticketIdU64.toString());

  const methods = program.methods as unknown as PerProgramMethods;
  const initIx = await methods
    .initUserOrder(market, ticketId)
    .accountsPartial({
      user,
      userOrder,
      systemProgram: SystemProgram.programId,
      ...accounts,
    })
    .instruction();

  let permissionInstructions = permissionIxs;
  if (permissionInstructions.length === 0 && autoPermission) {
    const sdk = erSdk as unknown as MagicblockSdk;
    if (!sdk.createDelegatePermissionInstruction || !sdk.permissionPdaFromAccount || !sdk.AUTHORITY_FLAG) {
      throw new Error('MagicBlock SDK permission helpers unavailable');
    }

    const members: Member[] = [
      { flags: sdk.AUTHORITY_FLAG, pubkey: user },
      { flags: sdk.AUTHORITY_FLAG, pubkey: relayer },
    ];

    const permissionPda = sdk.permissionPdaFromAccount(userOrder);

    const createPermissionIx = await methods
      .createPermission({ userOrder: { market, user, ticketId } }, members)
      .accountsPartial({
        payer: user,
        permissionedAccount: userOrder,
        permission: permissionPda,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const delegatePermissionIx = sdk.createDelegatePermissionInstruction({
      payer: user,
      validator: erValidator,
      permissionedAccount: [userOrder, false],
      authority: [user, true],
    });

    const delegatePdaIx = await methods
      .delegatePda({ userOrder: { market, user, ticketId } })
      .accounts({
        payer: user,
        validator: erValidator,
        pda: userOrder,
      })
      .instruction();

    permissionInstructions = [createPermissionIx, delegatePermissionIx, delegatePdaIx];
  }

  const tx = new Transaction().add(initIx);
  if (permissionInstructions.length > 0) {
    tx.add(...permissionInstructions);
  }

  // ER validator delegation is implemented via permissionIxs (caller-provided).
  const permissionContext = { user, relayer, erValidator };
  void permissionContext;

  return tx;
}

interface AddUserOrderParams {
  provider: AnchorProvider;
  market: PublicKey;
  ticketIdU64: bigint;
  side: Side;
  amountU64: bigint;
  priceU64: bigint;
  salt32: Uint8Array;
  programId?: PublicKey;
  accounts?: Record<string, PublicKey>;
}

export async function addUserOrderPrivate(params: AddUserOrderParams): Promise<string> {
  const {
    provider,
    market,
    ticketIdU64,
    side,
    amountU64,
    priceU64,
    salt32,
    programId = PER_MATCHING_PROGRAM_ID,
    accounts = {},
  } = params;

  const program = await getPerProgram(provider, programId);
  const user = provider.wallet.publicKey;
  if (!user) {
    throw new Error('Wallet public key not available');
  }

  const userOrder = perUserOrderPda(programId, market, user, ticketIdU64);

  const methods = program.methods as unknown as PerProgramMethods;
  const tx = await methods
    .addUserOrder(
      market,
      new BN(ticketIdU64.toString()),
      normalizeSide(side),
      new BN(amountU64.toString()),
      new BN(priceU64.toString()),
      Array.from(salt32)
    )
    .accountsPartial({
      user,
      userOrder,
      ...accounts,
    })
    .rpc({ commitment: 'confirmed' });

  return tx;
}

export async function waitForPermissionActive(
  account: PublicKey,
  teeUrl: string = PER_BASE_URL
): Promise<boolean> {
  const sdk = erSdk as unknown as MagicblockSdk;
  if (!sdk.waitUntilPermissionActive) {
    throw new Error('MagicBlock SDK waitUntilPermissionActive is unavailable');
  }
  if (!teeUrl) {
    throw new Error('PER_BASE_URL is not configured');
  }
  return sdk.waitUntilPermissionActive(teeUrl.replace(/\/$/, ''), account);
}
