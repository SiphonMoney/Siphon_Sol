// (base) adityamane@Adityas-MacBook-Air-2 sol % node scripts/initialize-zk-pool.js 
// === Siphon ZK Pool Protocol Initialization ===

// Admin Pubkey: DYHMdsrbDMq7kmVpsXAGi8F7wJUopCGTowuqFAuE9wfV
// RPC: Helius Devnet
// Balance: 4.1586814 SOL
// PoolConfig PDA: EjAnP5Z8YvMgFWgS4u9d21jSWFGYLYNAhN6hSpgY6aRA
// MerkleTree PDA: 6M235DMRwB8E3t7stKNCZmed1uC1pAzfSFk7pzFnqmHb
// PoolVault PDA: 4fyk68LGA3nb1hPCmwetWu3kZq5XpdfjxXfPFqMULpmx

// Initializing ZK Pool protocol...
// Transaction sent: TdxwUFGAGGvhhrvoUqU56uAyJpVwwYZmhJvxyxiL3fv5h39w4zWMLD3nmR6LKJwnEZ8sL8dZ6XJrtjiF2ogZaqT

// ✅ ZK Pool Protocol initialized!
// Explorer: https://explorer.solana.com/tx/TdxwUFGAGGvhhrvoUqU56uAyJpVwwYZmhJvxyxiL3fv5h39w4zWMLD3nmR6LKJwnEZ8sL8dZ6XJrtjiF2ogZaqT?cluster=devnet

// Config:
//   Program ID: 3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb
//   PoolConfig PDA: EjAnP5Z8YvMgFWgS4u9d21jSWFGYLYNAhN6hSpgY6aRA
//   MerkleTree PDA: 6M235DMRwB8E3t7stKNCZmed1uC1pAzfSFk7pzFnqmHb
//   PoolVault PDA: 4fyk68LGA3nb1hPCmwetWu3kZq5XpdfjxXfPFqMULpmx
//   Admin: DYHMdsrbDMq7kmVpsXAGi8F7wJUopCGTowuqFAuE9wfV
//   Relayer: DYHMdsrbDMq7kmVpsXAGi8F7wJUopCGTowuqFAuE9wfV
//   Fee Recipient: DYHMdsrbDMq7kmVpsXAGi8F7wJUopCGTowuqFAuE9wfV
//   Fee BPS: 50 (0.5%)

const { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction } = require('@solana/web3.js');
const bs58 = require('bs58');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
const crypto = require('crypto');
const { NEXT_PUBLIC_HELIUS_API_KEY } = require('../src/lib/config');

// Program ID for the siphon-zk-pool program
const ZK_POOL_PROGRAM_ID = new PublicKey('3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb');

// Account Sizes (calculated from IDL and Anchor discriminator)
const POOL_CONFIG_SIZE = 142; // 8 (discriminator) + 134 (fields)
const MERKLE_TREE_SIZE = 1120; // 8 (discriminator) + 1112 (fields)

async function main() {
  console.log('=== Siphon ZK Pool Protocol Initialization ===\n');

  const adminKeyBase58 = process.env.EXECUTOR_PRIVATE_KEY;
  if (!adminKeyBase58) {
    console.error('❌ EXECUTOR_PRIVATE_KEY not set in .env.local');
    process.exit(1);
  }

  let adminKeypair;
  try {
    const decoded = bs58.decode(adminKeyBase58);
    if (decoded.length === 64) {
      adminKeypair = Keypair.fromSecretKey(decoded);
    } else if (decoded.length === 32) {
      const { ed25519 } = require('@noble/curves/ed25519');
      const publicKey = ed25519.getPublicKey(decoded);
      const fullKey = new Uint8Array(64);
      fullKey.set(decoded, 0);
      fullKey.set(publicKey, 32);
      adminKeypair = Keypair.fromSecretKey(fullKey);
    } else {
      throw new Error(`Unexpected key length: ${decoded.length} (expected 32 or 64)`);
    }
  } catch (e) {
    console.error('❌ Invalid EXECUTOR_PRIVATE_KEY:', e.message);
    process.exit(1);
  }

  console.log('Admin Pubkey:', adminKeypair.publicKey.toBase58());

  const heliusKey = NEXT_PUBLIC_HELIUS_API_KEY;
  const rpcUrl = heliusKey
    ? `https://devnet.helius-rpc.com/?api-key=${heliusKey}`
    : 'https://api.devnet.solana.com';
  console.log('RPC:', heliusKey ? 'Helius Devnet' : 'Public Devnet');

  const connection = new Connection(rpcUrl, 'confirmed');

  // Balance check
  const balance = await connection.getBalance(adminKeypair.publicKey);
  console.log('Balance:', balance / 1e9, 'SOL');

  if (balance < 0.05 * 1e9) { // Increased minimum balance for multiple account creations
    console.log('\n⚠️  Low balance. Requesting airdrop...');
    try {
      const sig = await connection.requestAirdrop(adminKeypair.publicKey, 5 * 1e9); // Request more SOL
      console.log('Airdrop requested, waiting for confirmation...');
      await connection.confirmTransaction(sig, 'confirmed');
      console.log('✅ Airdrop successful');
      const newBalance = await connection.getBalance(adminKeypair.publicKey);
      console.log('New balance:', newBalance / 1e9, 'SOL');
    } catch (e) {
      console.log('❌ Airdrop failed:', e.message);
      console.log('Please fund manually:');
      console.log(`   solana airdrop 5 ${adminKeypair.publicKey.toBase58()} --url devnet`);
      process.exit(1);
    }
  }

  // Derive PDAs
  const [poolConfigPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_config')],
    ZK_POOL_PROGRAM_ID
  );
  const [merkleTreePDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('merkle_tree')],
    ZK_POOL_PROGRAM_ID
  );
  const [poolVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool_vault')],
    ZK_POOL_PROGRAM_ID
  );

  console.log('PoolConfig PDA:', poolConfigPDA.toBase58());
  console.log('MerkleTree PDA:', merkleTreePDA.toBase58());
  console.log('PoolVault PDA:', poolVaultPDA.toBase58());

  // Check if PoolConfig account already exists
  const existingPoolConfig = await connection.getAccountInfo(poolConfigPDA);
  if (existingPoolConfig) {
    console.log('\n✅ ZK Pool Protocol already initialized!');
    console.log('PoolConfig account exists at:', poolConfigPDA.toBase58());
    console.log('MerkleTree account exists at:', merkleTreePDA.toBase58());
    console.log('PoolVault account exists at:', poolVaultPDA.toBase58());
    return;
  }

  console.log('\nInitializing ZK Pool protocol...');

  const relayer = adminKeypair.publicKey;
  const feeRecipient = adminKeypair.publicKey;
  const feeBps = 50; // 0.5% fee

  // Instruction discriminator for "initialize"
  const discriminator = Buffer.from(
    crypto.createHash('sha256').update('global:initialize').digest()
  ).slice(0, 8);

  // Build instruction data: discriminator + relayer (32) + feeRecipient (32) + feeBps (2)
  const data = Buffer.alloc(8 + 32 + 32 + 2);
  discriminator.copy(data, 0);
  relayer.toBuffer().copy(data, 8);
  feeRecipient.toBuffer().copy(data, 40);
  data.writeUInt16LE(feeBps, 72);

  // Calculate rent-exempt minimum for accounts
  const lamportsPoolConfig = await connection.getMinimumBalanceForRentExemption(POOL_CONFIG_SIZE);
  const lamportsMerkleTree = await connection.getMinimumBalanceForRentExemption(MERKLE_TREE_SIZE);

  const initializeIx = new TransactionInstruction({
    keys: [
      { pubkey: adminKeypair.publicKey, isSigner: true, isWritable: true }, // Admin
      { pubkey: poolConfigPDA, isSigner: false, isWritable: true },      // PoolConfig PDA
      { pubkey: merkleTreePDA, isSigner: false, isWritable: true },      // MerkleTree PDA
      { pubkey: poolVaultPDA, isSigner: false, isWritable: true },       // PoolVault PDA (created implicitly or as part of PoolConfig/MerkleTree?)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // System Program
      // Note: Rent sysvar is often handled implicitly by Anchor, but if explicit, add here.
    ],
    programId: ZK_POOL_PROGRAM_ID,
    data,
  });

  try {
    const tx = new Transaction();
    // Add the initialize instruction
    tx.add(initializeIx);

    tx.feePayer = adminKeypair.publicKey;

    const { blockhash } = await connection.getLatestBlockhash();
    tx.recentBlockhash = blockhash;

    tx.sign(adminKeypair);

    const sig = await connection.sendRawTransaction(tx.serialize());
    console.log('Transaction sent:', sig);

    await connection.confirmTransaction(sig, 'confirmed');

    console.log('\n✅ ZK Pool Protocol initialized!');
    console.log('Explorer:', `https://explorer.solana.com/tx/${sig}?cluster=devnet`);

    console.log('\nConfig:');
    console.log('  Program ID:', ZK_POOL_PROGRAM_ID.toBase58());
    console.log('  PoolConfig PDA:', poolConfigPDA.toBase58());
    console.log('  MerkleTree PDA:', merkleTreePDA.toBase58());
    console.log('  PoolVault PDA:', poolVaultPDA.toBase58());
    console.log('  Admin:', adminKeypair.publicKey.toBase58());
    console.log('  Relayer:', relayer.toBase58());
    console.log('  Fee Recipient:', feeRecipient.toBase58());
    console.log('  Fee BPS:', feeBps, `(${feeBps / 100}%)`);
  } catch (error) {
    console.error('\n❌ Initialization failed:', error.message);

    if (error.logs) {
      console.log('\nProgram logs:');
      error.logs.forEach((log) => console.log('  ', log));
    }
  }
}

main().catch(console.error);
