# Range Protocol Integration

> Compliance screening for deposits and withdrawals

## What We Use Range For

Siphon screens addresses on both deposits and withdrawals to block sanctioned addresses from using the privacy pool:

- **Deposits**: Screen the sender's wallet address
- **Withdrawals**: Screen the recipient address

## Configuration

### Environment Variables

```env
NEXT_PUBLIC_RANGE_API_KEY=your_range_api_key
NEXT_PUBLIC_RANGE_API_URL=https://api.range.org/v1
```

### Code Reference

Configuration in [src/lib/config.ts](../src/lib/config.ts):

```typescript
export const NEXT_PUBLIC_RANGE_API_KEY = 'your_api_key';
export const NEXT_PUBLIC_RANGE_API_URL = 'https://api.range.org/v1';
```

## Integration Points

### 1. RangeClient Class

[src/lib/range/client.ts](../src/lib/range/client.ts) implements the screening logic:

```typescript
export class RangeClient {
  async screenAddress(address: string, chain: 'solana' | 'ethereum' = 'solana'): Promise<ScreeningResult> {
    const [riskResponse, sanctionsResponse] = await Promise.all([
      this.callAddressRiskAPI({ address, chain }),
      this.callSanctionsAPI({ address, chain })
    ]);

    const allowed = riskResponse.riskScore <= this.riskThreshold &&
                    !sanctionsResponse.is_ofac_sanctioned;

    return { allowed, address, riskScore: riskResponse.riskScore };
  }
}
```

### 2. Deposit Screening

Before a deposit is processed:

```typescript
async screenDeposit(senderAddress: string): Promise<ScreeningResult> {
  console.log(`[Range] Screening deposit from: ${senderAddress}`);
  return this.screenAddress(senderAddress, 'solana');
}
```

### 3. Withdrawal Screening

Before a withdrawal is processed:

```typescript
async screenWithdrawal(recipientAddress: string): Promise<ScreeningResult> {
  console.log(`[Range] Screening withdrawal to: ${recipientAddress}`);
  return this.screenAddress(recipientAddress, 'solana');
}
```

### 4. Graceful Failure

If Range API is unavailable, we allow the transaction with a warning (fail-open):

```typescript
try {
  const result = await this.callAPI(address);
  return result;
} catch (error) {
  console.error('Range screening failed:', error);
  return {
    allowed: true,
    address,
    reason: 'Compliance check unavailable - proceeding with caution',
  };
}
```

## API Calls

We call two Range endpoints:

1. **Risk Score**: `GET /risk/address?address={addr}&network=solana`
2. **Sanctions Check**: `GET /risk/sanctions/{addr}?network=solana`

Blocking criteria:
- Risk score > 70
- OFAC sanctioned = true

## Setup

1. Get API key from Range Protocol
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_RANGE_API_KEY=your_key
   ```
3. The client auto-initializes when first used

## Files

- [src/lib/range/client.ts](../src/lib/range/client.ts) - RangeClient class
- [src/lib/range/types.ts](../src/lib/range/types.ts) - TypeScript types