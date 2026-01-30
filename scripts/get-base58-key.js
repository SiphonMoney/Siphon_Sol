/**
 * Convert Solana keypair JSON to base58 private key
 *
 * Usage: node get-base58-key.js <path-to-keypair.json>
 *
 * Or if you have a keypair already, you can use your Phantom wallet's exported key
 */

const fs = require('fs');
const bs58 = require('bs58');

// Check if a file path was provided
const keypairPath = process.argv[2];

if (keypairPath) {
  try {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf8'));
    const secretKey = Uint8Array.from(keypairData);
    const base58Key = bs58.encode(secretKey);

    console.log('\n=== Keypair Info ===');
    console.log('Base58 Private Key (use this in .env):');
    console.log(base58Key);
    console.log('\nPublic Key:');

    // Derive public key (first 32 bytes are private, last 32 are public in ed25519)
    const { Keypair } = require('@solana/web3.js');
    const keypair = Keypair.fromSecretKey(secretKey);
    console.log(keypair.publicKey.toBase58());

    console.log('\n⚠️  Keep your private key secret! Never share it.');
  } catch (error) {
    console.error('Error reading keypair:', error.message);
  }
} else {
  // Generate a new keypair
  const { Keypair } = require('@solana/web3.js');
  const keypair = Keypair.generate();
  const base58Key = bs58.encode(keypair.secretKey);

  console.log('\n=== New Keypair Generated ===');
  console.log('Base58 Private Key (use this in .env):');
  console.log(base58Key);
  console.log('\nPublic Key (fund this with devnet SOL):');
  console.log(keypair.publicKey.toBase58());
  console.log('\nTo fund with devnet SOL:');
  console.log(`solana airdrop 2 ${keypair.publicKey.toBase58()} --url devnet`);
  console.log('\n⚠️  Keep your private key secret! Never share it.');
}
