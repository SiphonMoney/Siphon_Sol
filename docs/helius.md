# Helius Integration

> RPC provider for Siphon Protocol

## What We Use Helius For

Siphon uses Helius as the RPC endpoint for all Solana interactions:

1. **Commitment Indexing** - Fetching transaction history to index deposit commitments
2. **Transaction Submission** - Sending deposit/withdrawal transactions
3. **Account Queries** - Reading Merkle tree and pool vault state

## Configuration

### Environment Variable

```env
NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY
```

### Code Reference

The RPC URL is set in [src/lib/config.ts](../src/lib/config.ts):

```typescript
export const NEXT_PUBLIC_SOLANA_RPC_URL =
  'https://devnet.helius-rpc.com/?api-key=d2622292-55af-47d3-96e7-6af057eafa3d';
```

## Integration Points

### 1. Relayer Core Connection

[src/lib/noir-zk/relayer-core.ts](../src/lib/noir-zk/relayer-core.ts) creates the connection:

```typescript
this.connection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  fetch: fetchWithRetry, // Custom retry logic
});
```

### 2. Commitment Indexing

We fetch transaction signatures for the Merkle tree PDA to index all deposits:

```typescript
const signatures = await connection.getSignaturesForAddress(
  merkleTreePDA,
  { limit: 1000 },
  'confirmed'
);

for (const sigInfo of signatures) {
  const tx = await connection.getTransaction(sigInfo.signature, {
    maxSupportedTransactionVersion: 0,
  });
  // Parse CommitmentInserted events from logs
}
```

### 3. Transaction Submission

Deposits and withdrawals are sent via the connection:

```typescript
const signature = await connection.sendRawTransaction(tx.serialize(), {
  skipPreflight: false,
  preflightCommitment: 'confirmed',
  maxRetries: 5,
});

await connection.confirmTransaction({
  signature,
  blockhash,
  lastValidBlockHeight,
}, 'confirmed');
```

## Setup

1. Get an API key from [helius.dev](https://helius.dev/)
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY
   ```
3. Restart the dev server