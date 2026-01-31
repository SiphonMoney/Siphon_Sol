<div align="left">

# Siphon Protocol - Solana

> **Privacy-Preserving DeFi Execution Layer for Solana**
>
> Execute DeFi strategies privately using Zero-Knowledge proofs. Deposit, withdraw, and trade without revealing your intent.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Solana](https://img.shields.io/badge/Solana-Devnet-purple?style=for-the-badge&logo=solana)](https://solana.com/)
[![Anchor](https://img.shields.io/badge/Anchor-0.32-orange?style=for-the-badge)](https://www.anchor-lang.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

[Live Demo](https://siphon.money) | [Documentation](/docs) | [Twitter](https://x.com/SiphonMoney)

</div>

---

## Overview

Siphon Protocol is a **privacy-preserving DeFi vault** built for the [Solana Privacy Hack Competition](https://solana.com/privacyhack). It enables users to:

- **Private Deposits/Withdrawals** - ZK-based privacy pool using Poseidon Merkle trees
- **Anonymous Transfers** - Break the on-chain link between sender and recipient
- **Compliant Privacy** - Range Protocol screening on deposits AND withdrawals
- **MEV Protection** - Hidden trading intent prevents front-running

### Partner Integrations

| Partner | Integration | Description |
|---------|-------------|-------------|
| **Aztec/Noir** | ZK Circuits | Noir-based withdrawal proofs with Poseidon hashing |
| **Helius** | RPC Infrastructure | Enhanced RPC with indexing and DAS API |
| **Range Protocol** | Compliance | Address screening for deposits and withdrawals |

See detailed integration docs in the [docs/](docs/) folder.

---

## Architecture

```
User Wallet
     |
     v
+-----------------------------------------------------+
|                   Frontend (Next.js)                 |
|  - Wallet Adapter (Phantom, Solflare, etc.)         |
|  - ZK Pool Interface                                 |
|  - Strategy Builder                                  |
+-----------------------------------------------------+
     |
     v
+-----------------------------------------------------+
|              Siphon ZK Pool Program                  |
|  Program ID: 3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb |
|                                                      |
|  +-------------+  +-------------+  +-------------+   |
|  | PoolConfig  |  | MerkleTree  |  |  PoolVault  |   |
|  |   (PDA)     |  |    (PDA)    |  |    (PDA)    |   |
|  +-------------+  +-------------+  +-------------+   |
+-----------------------------------------------------+
     |
     v
+-----------------------------------------------------+
|              Embedded Relayer (API Routes)           |
|  - Poseidon Merkle tree (off-chain)                 |
|  - Commitment indexing                               |
|  - Proof generation                                  |
|  - Transaction submission                            |
+-----------------------------------------------------+
```

### How Privacy Works

1. **Deposit**: User deposits SOL/USDC with a cryptographic commitment
   - `commitment = Poseidon(value, Poseidon(nullifier, secret))`
   - Commitment is added to on-chain Merkle tree
   - User stores nullifier + secret locally (UTXO)

2. **Withdraw**: User proves ownership without revealing which deposit
   - Generate Merkle proof for the commitment
   - Submit nullifier hash to prevent double-spend
   - Relayer verifies proof and executes withdrawal

3. **Privacy**: No on-chain link between deposit and withdrawal addresses

---

## Project Structure

```
Siphon_Sol/
├── siphon/                      # Anchor program (Rust)
│   └── programs/siphon-zk-pool/ # ZK Pool smart contract
├── circuits-noir/               # Noir ZK circuits
│   └── src/                     # Withdrawal proof circuit
├── src/
│   ├── app/                     # Next.js app router
│   │   └── api/noir-zk/         # API routes for ZK operations
│   ├── components/              # React components
│   │   └── navs/UserDash/       # Main user interface
│   └── lib/
│       ├── noir-zk/             # ZK pool client library
│       │   ├── client.ts        # NoirZkClient class
│       │   ├── relayer-core.ts  # Embedded Poseidon relayer
│       │   └── zk-pool-client.ts# On-chain interaction
│       ├── range/               # Range compliance
│       └── config.ts            # Environment config
├── docs/                        # Partner integration docs
└── vercel.json                  # Deployment config
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Solana CLI (optional, for local development)
- A Solana wallet (Phantom, Solflare, etc.)

### Installation

```bash
# Clone the repository
git clone https://github.com/SiphonMoney/Siphon_Sol.git
cd Siphon_Sol

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Visit `http://localhost:3000` to see the application.

### Environment Variables

Create a `.env.local` file:

```env
# Solana RPC (Helius recommended for production)
NEXT_PUBLIC_SOLANA_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY

# Program ID (deployed to devnet)
NEXT_PUBLIC_ZK_POOL_PROGRAM_ID=3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb

# Executor private key (for API routes - base58 encoded)
EXECUTOR_PRIVATE_KEY=your_executor_private_key_base58

# Range Protocol (compliance)
NEXT_PUBLIC_RANGE_API_KEY=your_range_api_key
```

---

## Devnet Deployment

The ZK Pool program is deployed to Solana devnet:

| Component | Address |
|-----------|---------|
| **Program ID** | `3CVsp1zayXhNsT8Ktrh85rTewvBJxWy8VcUtQAKdnQMb` |
| **Pool Config** | PDA: `["pool_config"]` |
| **Merkle Tree** | PDA: `["merkle_tree"]` |
| **Pool Vault** | PDA: `["pool_vault"]` |

### Supported Tokens

| Token | Mint Address | Notes |
|-------|--------------|-------|
| **SOL** | Native | Full support |
| **USDC** | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Devnet USDC |

---

## Mock Swap Implementation

> **Note**: Jupiter and other DEX aggregators are not available on Solana devnet. We implement a mock swap system for demonstration purposes.

### How Mock Swaps Work

Since real swaps aren't available on devnet, we use a **USDC-based mock system**:

1. **Strategy Execution**: When a strategy triggers a "swap", it simulates the trade
2. **Price Oracle**: Uses Pyth/mock prices to calculate expected output
3. **Token Transfer**: Transfers USDC from the vault to simulate swap proceeds
4. **No Actual DEX**: No real DEX interaction occurs on devnet

### Getting Devnet Tokens

```bash
# Get devnet SOL
solana airdrop 2

# For devnet USDC, use the app interface or contact the team
# The USDC mint on devnet is a test token: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
```

### Mainnet Considerations

For mainnet deployment:
- Replace mock swap with Jupiter integration
- Use real token mints
- Enable proper price feeds from Pyth

---

## Usage Guide

### Depositing to ZK Pool

1. Connect your Solana wallet
2. Navigate to the ZK Pool interface
3. Enter deposit amount (SOL or USDC)
4. Approve the transaction
5. **Important**: Your UTXO data is stored in browser localStorage

### Withdrawing from ZK Pool

1. Ensure you have UTXOs (from previous deposits)
2. Enter withdrawal amount and recipient address
3. The system generates a ZK proof
4. Relayer submits the withdrawal transaction
5. Funds arrive at recipient address (no link to your deposit)

### Private Transfers

To transfer privately:
1. Deposit from Wallet A
2. Withdraw to Wallet B
3. No on-chain connection between A and B

---

## Development

### Building the Anchor Program

See [siphon/README.md](siphon/README.md) for detailed instructions.

```bash
cd siphon

# Build (requires Anchor CLI)
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Noir Circuit Compilation

See [circuits-noir/README.md](circuits-noir/README.md) for detailed instructions.

```bash
cd circuits-noir

# Compile the circuit
nargo compile

# Run tests
nargo test
```

---

## API Routes

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/noir-zk/deposit` | POST | Deposit SOL/USDC to ZK pool |
| `/api/noir-zk/withdraw` | POST | Withdraw from ZK pool |
| `/api/noir-zk/balance` | GET | Get ZK pool balances |

### Example: Deposit

```typescript
const response = await fetch('/api/noir-zk/deposit', {
  method: 'POST',
  body: JSON.stringify({
    tokenType: 'SOL',
    amount: 100000000, // 0.1 SOL in lamports
  }),
});
```

### Example: Withdraw

```typescript
const response = await fetch('/api/noir-zk/withdraw', {
  method: 'POST',
  body: JSON.stringify({
    tokenType: 'SOL',
    amount: 50000000, // 0.05 SOL in lamports
    recipientAddress: 'RecipientPublicKey...',
    utxos: [...], // From localStorage
  }),
});
```

---

## Security Considerations

### What's Private

- Link between deposit and withdrawal addresses
- Withdrawal amounts (within pool)
- Strategy execution logic

### What's Public

- Total pool balance
- Deposit/withdrawal transactions (but not linked)
- Merkle root updates

### Limitations

- **Timing analysis**: Rapid deposit-withdraw may leak information
- **Amount correlation**: Unique amounts may be linkable
- **UTXO storage**: Browser localStorage - backup your data!

---

## Partner Documentation

Detailed integration guides for each partner:

- [Aztec/Noir Integration](docs/aztec.md) - ZK circuit implementation
- [Helius Integration](docs/helius.md) - RPC and indexing setup
- [Range Protocol Integration](docs/range.md) - Compliance configuration

---

## Troubleshooting

### Vercel Deployment Timeouts

If withdrawals timeout on Vercel (504 error):
- Ensure `vercel.json` has `maxDuration: 60`
- Vercel Pro plan required for >10s functions
- Check function logs for specific errors

### Missing UTXOs

If "No UTXOs available" error:
- Check browser localStorage for `siphon_utxos`
- Ensure deposits were confirmed on-chain
- Try refreshing the page to re-sync

### Transaction Failures

Common issues:
- Insufficient SOL for transaction fees
- Pool not initialized (contact admin)
- Nullifier already used (double-spend attempt)

---

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

---

## Disclaimer

This is **experimental software** built for a hackathon.

- **NOT audited** for production use
- **NOT financial advice**
- **USE AT YOUR OWN RISK**

Always test on devnet first. Never deposit more than you can afford to lose.

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <b>Siphon Protocol</b> - Privacy-Preserving DeFi for Solana
</p>

<p align="center">
  Built for the <a href="https://solana.com/privacyhack">Solana Privacy Hack</a>
</p>
