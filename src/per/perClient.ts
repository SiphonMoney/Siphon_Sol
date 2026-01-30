import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import erSdk from '@magicblock-labs/ephemeral-rollups-sdk';
import { PER_BASE_URL, PER_WS_URL } from '@/config/env';

type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

type MagicblockAuth = {
  token: string;
};

type MagicblockSdk = {
  getAuthToken: (
    baseUrl: string,
    pubkey: PublicKey,
    signFn: (message: Uint8Array) => Promise<Uint8Array>
  ) => Promise<MagicblockAuth>;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, '');
}

export async function getAuthToken(
  baseUrl: string,
  userPubkey: PublicKey,
  signFn: SignMessageFn
): Promise<string> {
  const sdk = erSdk as unknown as MagicblockSdk;
  if (!sdk.getAuthToken) {
    throw new Error('MagicBlock SDK getAuthToken is unavailable');
  }

  const auth = await sdk.getAuthToken(normalizeBaseUrl(baseUrl), userPubkey, signFn);
  if (!auth?.token) {
    throw new Error('Invalid auth token response');
  }

  return auth.token;
}

export function makePerProvider(token: string, userWallet: AnchorProvider['wallet']): AnchorProvider {
  if (!PER_BASE_URL) {
    throw new Error('PER_BASE_URL is not configured');
  }

  const baseUrl = normalizeBaseUrl(PER_BASE_URL);
  const rpc = `${baseUrl}?token=${token}`;
  const ws = PER_WS_URL ? `${normalizeBaseUrl(PER_WS_URL)}?token=${token}` : undefined;
  const connection = new Connection(rpc, {
    commitment: 'confirmed',
    wsEndpoint: ws,
  });

  return new AnchorProvider(connection, userWallet, { commitment: 'confirmed' });
}
