About Siphon
Trade in the Shadows, Verify in the Light

Siphon is the first truly private DEX where you can see your balances but others cannot. Built with Multi-Party Computation (MPC) on Solana, we solve the fundamental privacy paradox: traditional DEXs are completely transparent, while privacy mixers are completely opaque.

The Innovation
We created user-decryptable encrypted balances. Your balances are encrypted on-chain using x25519 key exchange between your private key and the MPC's public key. Only you can decrypt your balance, while the MPC can validate operations without revealing data to anyone else.

Example: You deposit 100 SOL. It's encrypted on-chain with RescueCipher. You can instantly decrypt and see "100 SOL" in your UI. Other users? They see encrypted bytes. MPC can verify you have sufficient balance for trades without revealing the amount.

Dark Pool Trading
Execute large orders without moving the market. Our dark pool matches orders privately using MPC, ensuring that order sizes, prices, and counterparties remain confidential until execution. Perfect for institutional traders, whales, and anyone who values privacy.

Key Features
🔒Encrypted Balances
See your balances, nobody else can. Powered by x25519 + RescueCipher encryption.
🤐Private Order Matching
Orders encrypted end-to-end. MPC matches orders without revealing details to anyone.
⚡Solana Speed
5-10 second MPC computations. Instant UI updates after decryption. No compromises.
🛡️Self-Custodial
Your keys, your funds. We never hold custody. MPC only validates operations.
🔍Verifiable Privacy
All operations are cryptographically provable. Privacy without sacrificing verifiability.
How It Works
Initialize: Generate your x25519 keypair, encrypted with wallet signature in localStorage
Deposit: Transfer tokens to vault → MPC encrypts your balance → You decrypt and see it
Trade: Submit encrypted orders → MPC matches privately → Settlement on-chain
Withdraw: MPC verifies encrypted balance → Backend executes transfer → Tokens to wallet