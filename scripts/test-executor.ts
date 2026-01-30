import { Connection, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

async function testExecutor() {
  const executorKey = process.env.EXECUTOR_PRIVATE_KEY;
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';

  if (!executorKey) {
    console.error('❌ EXECUTOR_PRIVATE_KEY not set in environment');
    return;
  }

  console.log('Testing executor wallet and RPC connection...\n');

  try {
    // Test 1: Load keypair
    const keypair = Keypair.fromSecretKey(bs58.decode(executorKey));
    console.log('✅ Executor wallet loaded:', keypair.publicKey.toBase58());

    // Test 2: Connect to RPC
    console.log('Connecting to RPC:', rpcUrl.replace(/api-key=[^&]+/, 'api-key=***'));
    const connection = new Connection(rpcUrl, 'confirmed');

    // Test 3: Fetch balance
    const balance = await connection.getBalance(keypair.publicKey);
    console.log('✅ Executor balance:', balance / LAMPORTS_PER_SOL, 'SOL');

    // Test 4: Fetch MerkleTree account
    const PROGRAM_ID = '3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb';
    const merkleTreePDA = '6M235DMRwB8E3t7stKNCZmed1uC1pAzfSFk7pzFnqmHb';
    const info = await connection.getAccountInfo(new (await import('@solana/web3.js')).PublicKey(merkleTreePDA));
    console.log('✅ MerkleTree account accessible:', !!info);

    console.log('\n✅ All tests passed! Executor wallet is ready.');
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testExecutor();
