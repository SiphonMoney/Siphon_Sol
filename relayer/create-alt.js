/**
 * Create Address Lookup Table (ALT) on devnet for Siphon ZK
 *
 * Run: node create-alt.js
 *
 * This creates an ALT with all the protocol addresses needed for
 * deposit/withdraw versioned transactions.
 */
import {
  Connection, Keypair, PublicKey, SystemProgram,
  AddressLookupTableProgram, Transaction,
  sendAndConfirmTransaction, ComputeBudgetProgram
} from '@solana/web3.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config({ path: '../.env.local' });

const PROGRAM_ID = new PublicKey('3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb');
const FEE_RECIPIENT = new PublicKey('DTqtRSGtGf414yvMPypCv2o1P8trwb9SJXibxLgAWYhw');
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=d2622292-55af-47d3-96e7-6af057eafa3d';

// Load the executor keypair
const execKey = process.env.EXECUTOR_PRIVATE_KEY;
if (!execKey) {
  console.error('No executor key found in .env.local');
  process.exit(1);
}

const payer = Keypair.fromSecretKey(bs58.decode(execKey));
const connection = new Connection(RPC_URL, 'confirmed');

async function main() {
  console.log('Creating ALT for Siphon ZK on devnet...');
  console.log(`Payer: ${payer.publicKey.toBase58()}`);

  const balance = await connection.getBalance(payer.publicKey);
  console.log(`Balance: ${balance / 1e9} SOL`);

  if (balance < 0.01 * 1e9) {
    console.error('Need at least 0.01 SOL. Airdrop some devnet SOL first.');
    process.exit(1);
  }

  // Derive PDAs (matching siphon-zk-pool constants.rs seeds)
  const [merkleTreePDA] = PublicKey.findProgramAddressSync([Buffer.from('merkle_tree')], PROGRAM_ID);
  const [poolConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from('pool_config')], PROGRAM_ID);
  const [poolVaultPDA] = PublicKey.findProgramAddressSync([Buffer.from('pool_vault')], PROGRAM_ID);

  // Addresses to include in ALT
  const addresses = [
    PROGRAM_ID,
    merkleTreePDA,
    poolConfigPDA,
    poolVaultPDA,
    FEE_RECIPIENT,
    payer.publicKey, // executor/relayer
    SystemProgram.programId,
    ComputeBudgetProgram.programId,
  ];

  console.log(`\nAddresses to include (${addresses.length}):`);
  addresses.forEach((addr, i) => console.log(`  ${i}: ${addr.toBase58()}`));

  // Step 1: Create ALT
  console.log('\nStep 1: Creating ALT...');
  const recentSlot = await connection.getSlot('confirmed');

  let [createIx, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: payer.publicKey,
    payer: payer.publicKey,
    recentSlot,
  });

  const createTx = new Transaction().add(createIx);
  const createSig = await sendAndConfirmTransaction(connection, createTx, [payer]);
  console.log(`ALT created: ${lookupTableAddress.toBase58()}`);
  console.log(`Create tx: ${createSig}`);

  // Wait for the ALT to be available
  console.log('Waiting for ALT to be available...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Step 2: Extend ALT with addresses
  console.log('\nStep 2: Adding addresses to ALT...');
  const extendIx = AddressLookupTableProgram.extendLookupTable({
    lookupTable: lookupTableAddress,
    authority: payer.publicKey,
    payer: payer.publicKey,
    addresses,
  });

  const extendTx = new Transaction().add(extendIx);
  const extendSig = await sendAndConfirmTransaction(connection, extendTx, [payer]);
  console.log(`Addresses added: ${extendSig}`);

  console.log('\n============================================');
  console.log(`ALT Address: ${lookupTableAddress.toBase58()}`);
  console.log('============================================');
  console.log('\nAdd this to your .env.local:');
  console.log(`NEXT_PUBLIC_ALT_ADDRESS=${lookupTableAddress.toBase58()}`);
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
