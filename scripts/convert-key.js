/**
 * Convert Solana keypair formats
 *
 * Usage:
 *   node scripts/convert-key.js <keypair.json>        - Convert JSON to base58
 *   node scripts/convert-key.js generate              - Generate new keypair
 */

const bs58 = require('bs58');
const fs = require('fs');
const { Keypair } = require('@solana/web3.js');

const arg = process.argv[2];

if (!arg) {
  console.log('Usage:');
  console.log('  node scripts/convert-key.js <keypair.json>  - Convert JSON keypair to base58');
  console.log('  node scripts/convert-key.js generate        - Generate new keypair');
  process.exit(0);
}

if (arg === 'generate') {
  const keypair = Keypair.generate();
  const base58Key = bs58.encode(keypair.secretKey);

  console.log('\n=== New Keypair Generated ===\n');
  console.log('Public Key (fund this with devnet SOL):');
  console.log(keypair.publicKey.toBase58());
  console.log('\nBase58 Private Key (put this in .env):');
  console.log(base58Key);
  console.log('\n⚠️  Keep your private key secret!\n');
  console.log('To fund with devnet SOL:');
  console.log(`solana airdrop 2 ${keypair.publicKey.toBase58()} --url devnet`);
} else {
  // Convert JSON file
  try {
    const data = fs.readFileSync(arg, 'utf8');
    const keypairArray = JSON.parse(data);
    const secretKey = Uint8Array.from(keypairArray);
    const keypair = Keypair.fromSecretKey(secretKey);
    const base58Key = bs58.encode(secretKey);

    console.log('\n=== Keypair Converted ===\n');
    console.log('Public Key:');
    console.log(keypair.publicKey.toBase58());
    console.log('\nBase58 Private Key (put this in .env):');
    console.log(base58Key);
  } catch (e) {
    console.error('Error:', e.message);
  }
}
