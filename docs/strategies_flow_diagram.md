# Siphon Strategies Protocol

## Actors in the strategies flow

- **User** — Interacts with the system; deposits/withdraws; builds or selects strategies via front-end.
- **Agent** — Automated or programmatic entity; can submit strategies and interact with the protocol.
- **ON/OFF RAMP** — Gateway for multi-chain assets (SOLANA primary, ZCASH, XMR, LTC, EVM, BTC).
- **Pre-screening / Compliance** — User verification, qualification, and regulatory checks before access.
- **Solana program** — L1: DEPOSIT, Run, WITHDRAW; ZK Receive (private receipt), Nullifier (private withdraw); privacy via AZTEC / NOIR.
- **Node Builder** — Front-end: modular strategy composition from building blocks; feeds Strategy Library.
- **Strategy Library** — Holds defined strategies; user/agent selects or combines strategies.
- **Payment Wall** — Gateway: strategy access and fee settlement before execution.
- **Decentralized Computation** — Off-chain environment for private strategy execution.
- **FHE Engine** — Fully homomorphic encryption; compute on encrypted data without decryption.
- **MagicBlock PER (TEE)** — Trusted execution; private strategy instances, instance management, trade engine; linked to FHE.
- **Liquidity Layer** — Source of liquidity for trades executed by the Trade Engine.

---

## Strategies architecture

**User & agent**

- ON/OFF RAMP: intake and off-ramp for SOLANA (primary), ZCASH, XMR, LTC, EVM, BTC.
- User pre-screening: verification and qualification before using strategies.
- Compliance layer: regulatory and rule-based checks (e.g. Range).

**Solana blockchain integration**

- Core: DEPOSIT, Run, WITHDRAW. SPL/accounts per vault or flow.
- Privacy: ZK Receive (from DEPOSIT), Nullifier (from WITHDRAW). Privacy protocol: AZTEC / NOIR.

**Front-end and strategy definition**

- Node Builder: receives DEPOSIT/Run from Solana; composes strategies from Building Block modules.
- Strategy Library: receives from Node Builder; holds multiple STRATEGY definitions for selection or combination.

**Payment wall**

- Inputs from Node Builder and Strategy Library pass through Payment Wall (fees / access validation).
- Output flows to the execution layer.

**Execution and computation**

- Decentralized Computation: runs strategy logic in a decentralized, private environment.
- Running Private Strategy Instances: isolated, private execution per strategy.
- FHE Engine: compute on encrypted data; bidirectional link with MagicBlock PER (TEE).

**MagicBlock (TEE) and liquidity**

- MAGICBLOCK PER (TEE): confidential execution; instance management and Trade Engine inside TEE.
- Trade Engine: executes trades from strategy parameters; interacts with Liquidity Layer.
- Liquidity Layer: provides liquidity for Trade Engine executions.

---

## Flow

1. User/agent passes pre-screening and compliance; deposits/withdraws via ON/OFF RAMP and Solana (DEPOSIT / WITHDRAW with ZK Receive / Nullifier).

2. User/agent builds or selects strategies in Node Builder and Strategy Library; definitions pass through Payment Wall.

3. Approved strategies enter Decentralized Computation; private instances run with FHE Engine and MagicBlock PER (TEE).

4. Instance management and Trade Engine inside TEE execute trades; Trade Engine uses Liquidity Layer.

5. Settlement and state updates flow back to Solana (Run, ZK/Nullifier) as needed.

---

## Partner roles

- **AZTEC / NOIR:** Privacy on Solana (ZK Receive, Nullifier) for private deposits and withdrawals.

- **MagicBlock PER (TEE):** Private strategy instances, instance management, and Trade Engine; combined with FHE for confidential execution.

- **FHE Engine:** Homomorphic computation on encrypted strategy data; works with TEE for end-to-end privacy.
