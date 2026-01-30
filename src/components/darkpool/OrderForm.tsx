// OrderForm.tsx - Form for placing orders
"use client";

import { useState } from 'react';
import { AnchorProvider } from '@coral-xyz/anchor';
import { Connection, Transaction } from '@solana/web3.js';
import { L1_RPC_URL, MARKET_PUBKEY, PER_BASE_URL, PER_MATCHING_PROGRAM_ID, PER_RELAYER_PUBKEY } from '@/config/env';
import { MatchingEngineClient } from '@/solana/matchingEngineClient';
import { addUserOrderPrivate, initUserOrderPlaceholder, waitForPermissionActive } from '@/per/perMatchingClient';
import { getAuthToken, makePerProvider } from '@/per/perClient';
import { perUserOrderPda } from '@/solana/pdas';
import { getBrowserWalletAdapter, toU64Amount } from '@/lib/solanaWallet';
import './darkpool.css';

interface OrderFormProps {
  walletAddress: string;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  onSuccess?: (orderId: string) => void;
}

type OrderType = 'buy' | 'sell';

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(normalized.substr(i * 2, 2), 16);
  }
  return bytes;
}

export default function OrderForm({ 
  walletAddress, 
  signMessage,
  onSuccess 
}: OrderFormProps) {
  const [orderType, setOrderType] = useState<OrderType>('buy');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitOrder = async () => {
    if (!price || !amount) {
      setError('Please enter both price and amount');
      return;
    }

    if (parseFloat(price) <= 0 || parseFloat(amount) <= 0) {
      setError('Price and amount must be positive');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (!MARKET_PUBKEY || !PER_RELAYER_PUBKEY || !PER_BASE_URL) {
        throw new Error('Missing PER configuration (market, relayer, or PER_BASE_URL)');
      }

      const walletAdapter = getBrowserWalletAdapter(signMessage);
      if (!walletAdapter.signTransaction || !walletAdapter.signMessage) {
        throw new Error('Wallet must support signTransaction and signMessage');
      }
      if (walletAdapter.publicKey.toBase58() !== walletAddress) {
        console.warn('Wallet address mismatch between UI and adapter');
      }

      const l1Connection = new Connection(L1_RPC_URL, 'confirmed');
      const l1Provider = new AnchorProvider(l1Connection, walletAdapter as AnchorProvider['wallet'], {
        commitment: 'confirmed',
      });

      const matchingClient = await MatchingEngineClient.create(l1Connection, walletAdapter);
      const amountU64 = toU64Amount(amount, 9);
      const priceU64 = toU64Amount(price, 6);

      const ticket = await matchingClient.submitOrderTicket({
        side: orderType,
        amountU64,
        priceU64,
      });

      const initTx = await initUserOrderPlaceholder({
        provider: l1Provider,
        market: MARKET_PUBKEY,
        ticketIdU64: ticket.orderIdU64,
        relayer: PER_RELAYER_PUBKEY,
        autoPermission: true,
      });

      initTx.feePayer = walletAdapter.publicKey;
      const { blockhash } = await l1Connection.getLatestBlockhash('confirmed');
      initTx.recentBlockhash = blockhash;
      const signedInit = await walletAdapter.signTransaction(initTx);
      const initSig = await l1Connection.sendRawTransaction(signedInit.serialize(), {
        skipPreflight: true,
      });
      await l1Connection.confirmTransaction(initSig, 'confirmed');

      const userOrderPda = perUserOrderPda(
        PER_MATCHING_PROGRAM_ID,
        MARKET_PUBKEY,
        walletAdapter.publicKey,
        ticket.orderIdU64
      );
      await waitForPermissionActive(userOrderPda);

      const token = await getAuthToken(PER_BASE_URL, walletAdapter.publicKey, walletAdapter.signMessage);
      const perProvider = makePerProvider(token, walletAdapter as AnchorProvider['wallet']);

      await addUserOrderPrivate({
        provider: perProvider,
        market: MARKET_PUBKEY,
        ticketIdU64: ticket.orderIdU64,
        side: orderType,
        amountU64,
        priceU64,
        salt32: hexToBytes(ticket.salt32Hex),
      });

      // Clear form
      setPrice('');
      setAmount('');
      
      onSuccess?.(ticket.orderIdU64.toString());
    } catch (err) {
      console.error('Order submission failed:', err);
      setError(err instanceof Error ? err.message : 'Order submission failed');
    } finally {
      setLoading(false);
    }
  };

  const totalValue = price && amount 
    ? (parseFloat(price) * parseFloat(amount)).toFixed(2)
    : '0.00';

  return (
    <div className="order-form">
      <h3>Place Order</h3>

      <div className="order-type-selector">
        <button
          className={`order-type-btn ${orderType === 'buy' ? 'active buy' : ''}`}
          onClick={() => setOrderType('buy')}
          disabled={loading}
        >
          Buy
        </button>
        <button
          className={`order-type-btn ${orderType === 'sell' ? 'active sell' : ''}`}
          onClick={() => setOrderType('sell')}
          disabled={loading}
        >
          Sell
        </button>
      </div>

      <div className="form-group">
        <label>Price (USDC per SOL)</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="105.00"
          disabled={loading}
          min="0"
          step="0.01"
        />
      </div>

      <div className="form-group">
        <label>Amount (SOL)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="10.0"
          disabled={loading}
          min="0"
          step="0.0001"
        />
      </div>

      <div className="form-group">
        <label>Total (USDC)</label>
        <input
          type="text"
          value={totalValue}
          readOnly
          disabled
          className="readonly-input"
        />
      </div>

      <div className="info-box">
        <span>Your order details are encrypted end-to-end. Only MPC can see them for matching.</span>
      </div>

      {error && (
        <div className="error-box">
          <span>{error}</span>
        </div>
      )}

      <button 
        onClick={submitOrder}
        disabled={loading || !price || !amount}
        className={`submit-order-btn ${orderType}`}
      >
        {loading ? (
          <span className="loading-content">
            <span className="spinner-small"></span>
            Submitting...
          </span>
        ) : (
          `Place ${orderType.toUpperCase()} Order`
        )}
      </button>
    </div>
  );
}

