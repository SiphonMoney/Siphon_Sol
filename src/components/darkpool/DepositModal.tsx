// DepositModal.tsx - Modal for depositing tokens to dark pool
"use client";

import { useState } from 'react';
import { Connection } from '@solana/web3.js';
import { L1_RPC_URL } from '@/config/env';
import { MatchingEngineClient } from '@/solana/matchingEngineClient';
import { getBrowserWalletAdapter, toU64Amount } from '@/lib/solanaWallet';
import './darkpool.css';

interface DepositModalProps {
  walletAddress: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onClose: () => void;
  onSuccess: () => void;
}

type TokenType = 'base' | 'quote';

export default function DepositModal({ 
  walletAddress,
  signMessage,
  onClose,
  onSuccess
}: DepositModalProps) {
  const [amount, setAmount] = useState('');
  const [tokenType, setTokenType] = useState<TokenType>('base');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');

  const tokenName = tokenType === 'base' ? 'SOL' : 'USDC';

  const handleDeposit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress('Preparing deposit...');

    try {
      const walletAdapter = getBrowserWalletAdapter(signMessage);
      if (walletAdapter.publicKey.toBase58() !== walletAddress) {
        throw new Error('Wallet address mismatch. Please reconnect your wallet.');
      }
      if (!walletAdapter.signTransaction) {
        throw new Error('Wallet must support signTransaction');
      }

      setProgress('Preparing transaction...');
      const connection = new Connection(L1_RPC_URL, 'confirmed');
      const client = await MatchingEngineClient.create(connection, walletAdapter);
      const amountU64 = toU64Amount(amount, tokenType === 'base' ? 9 : 6);

      setProgress('Submitting to pool...');
      await client.deposit({ token: tokenType, amountU64 });

      setProgress('Finalizing MPC computation...');
      await new Promise(resolve => setTimeout(resolve, 1200));

      console.log('Deposit completed:', { amount, tokenType, walletAddress });
      
      setProgress('Complete!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 500);
    } catch (err) {
      console.error('Deposit failed:', err);
      setError(err instanceof Error ? err.message : 'Deposit failed');
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container darkpool-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h2>Deposit Tokens</h2>
            <button onClick={onClose} className="close-btn">×</button>
          </div>

          <div className="form-section">
            <div className="form-group">
              <label>Token Type</label>
              <div className="token-selector">
                <button
                  className={`token-option ${tokenType === 'base' ? 'active' : ''}`}
                  onClick={() => setTokenType('base')}
                  disabled={loading}
                >
                  SOL (Base Token)
                </button>
                <button
                  className={`token-option ${tokenType === 'quote' ? 'active' : ''}`}
                  onClick={() => setTokenType('quote')}
                  disabled={loading}
                >
                  USDC (Quote Token)
                </button>
              </div>
            </div>

            <div className="form-group">
              <label>Amount</label>
              <div className="input-with-token">
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={loading}
                  min="0"
                  step="any"
                />
                <span className="token-badge">{tokenName}</span>
              </div>
            </div>

            <div className="info-box">
              <span>
                This will transfer tokens from your wallet to the pool vault
                and update your encrypted balance via MPC computation.
              </span>
            </div>

            {error && (
              <div className="error-box">
                <span>{error}</span>
              </div>
            )}

            {progress && (
              <div className="progress-box">
                <div className="spinner-small"></div>
                <span>{progress}</span>
              </div>
            )}
          </div>

          <div className="button-group">
            <button 
              onClick={onClose}
              disabled={loading}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button 
              onClick={handleDeposit}
              disabled={loading || !amount || parseFloat(amount) <= 0}
              className="btn-primary"
            >
              {loading ? 'Processing...' : 'Deposit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

