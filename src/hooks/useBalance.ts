// useBalance.ts - Hook for encrypted balance management
"use client";

import { useState, useCallback } from 'react';
import { Connection } from '@solana/web3.js';
import { L1_RPC_URL } from '@/config/env';
import { MatchingEngineClient } from '@/solana/matchingEngineClient';
import type { WalletAdapter } from '@/lib/solanaWallet';
import { getBrowserWalletAdapter } from '@/lib/solanaWallet';

export interface EncryptedBalanceView {
  base_total: bigint;
  base_available: bigint;
  quote_total: bigint;
  quote_available: bigint;
}

export interface BalanceState {
  balance: EncryptedBalanceView | null;
  loading: boolean;
  error: string | null;
}

export function useBalance(walletAddress: string | null, signMessage: (message: Uint8Array) => Promise<Uint8Array>) {
  const [state, setState] = useState<BalanceState>({
    balance: null,
    loading: false,
    error: null,
  });

  const refreshBalance = useCallback(async () => {
    if (!walletAddress) {
      setState({ balance: null, loading: false, error: 'No wallet connected' });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const connection = new Connection(L1_RPC_URL, 'confirmed');
      const walletAdapter = getBrowserWalletAdapter(signMessage) as WalletAdapter;
      const client = await MatchingEngineClient.create(connection, walletAdapter);
      const balances = await client.fetchBalancesDecrypted();

      setState({
        balance: {
          base_total: balances[0],
          base_available: balances[1],
          quote_total: balances[2],
          quote_available: balances[3],
        },
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Failed to refresh balance:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
    }
  }, [walletAddress, signMessage]);

  return {
    ...state,
    refreshBalance,
  };
}

