import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb');

async function check() {
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const [poolConfig] = PublicKey.findProgramAddressSync([Buffer.from('pool_config')], PROGRAM_ID);
  const [merkleTree] = PublicKey.findProgramAddressSync([Buffer.from('merkle_tree')], PROGRAM_ID);
  const [poolVault] = PublicKey.findProgramAddressSync([Buffer.from('pool_vault')], PROGRAM_ID);

  console.log('Checking ZK Pool initialization...\n');
  console.log('Program ID:', PROGRAM_ID.toBase58());
  console.log();

  const poolConfigInfo = await connection.getAccountInfo(poolConfig);
  console.log('PoolConfig PDA:', poolConfig.toBase58());
  console.log('  Exists:', !!poolConfigInfo);

  const merkleTreeInfo = await connection.getAccountInfo(merkleTree);
  console.log('\nMerkleTree PDA:', merkleTree.toBase58());
  console.log('  Exists:', !!merkleTreeInfo);
  if (merkleTreeInfo) {
    const nextIndex = merkleTreeInfo.data.readBigUInt64LE(40);
    console.log('  Next Index:', nextIndex.toString());
  }

  const poolVaultInfo = await connection.getAccountInfo(poolVault);
  const balance = await connection.getBalance(poolVault);
  console.log('\nPoolVault PDA:', poolVault.toBase58());
  console.log('  Balance:', balance / 1e9, 'SOL');

  if (poolConfigInfo && merkleTreeInfo) {
    console.log('\n✅ ZK Pool is initialized and ready!');
  } else {
    console.log('\n❌ ZK Pool NOT initialized - need to run initialize instruction');
    if (!poolConfigInfo) console.log('  Missing: PoolConfig');
    if (!merkleTreeInfo) console.log('  Missing: MerkleTree');
  }
}

check().catch(console.error);
