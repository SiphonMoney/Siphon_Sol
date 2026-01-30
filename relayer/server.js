import express from 'express';
import cors from 'cors';
import {Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, TransactionInstruction, SystemProgram, ComputeBudgetProgram} from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';
import dotenv from 'dotenv';
import {WasmFactory} from '@lightprotocol/hasher.rs';

dotenv.config({path:'../.env.local'});

// Initialize Poseidon hasher (WASM)
let lightWasm = null;
async function ensurePoseidon() {
  if (!lightWasm) {
    lightWasm = await WasmFactory.getInstance();
    console.log('[Relayer] Poseidon hasher initialized');
  }
  return lightWasm;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// --- Configuration ---
const PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || 'ATZj4jZ4FFzkvAcvk27DW9GRkgSbFnHo49fKKPQXU7VS');
const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://devnet.helius-rpc.com/?api-key=d2622292-55af-47d3-96e7-6af057eafa3d';
const FEE_RECIPIENT = new PublicKey(process.env.FEE_RECIPIENT || 'DTqtRSGtGf414yvMPypCv2o1P8trwb9SJXibxLgAWYhw');
const MERKLE_TREE_HEIGHT = 26;
const PORT = process.env.RELAYER_PORT || 4000;

// Poseidon zero values for each level (precomputed from light-poseidon)
// Level 0 is all zeros (32 bytes), each subsequent level is hash(prev, prev)
// These are the standard zero values used by the Siphon ZK Merkle tree
const ZERO_VALUES = [
  '0000000000000000000000000000000000000000000000000000000000000000', // level 0
];
// We'll populate higher levels from on-chain data or use placeholders
// For now, the proof generation uses subtrees from on-chain state

// Load executor keypair for signing withdraw transactions
let executorKeypair = null;
const execKey = process.env.EXECUTOR_PRIVATE_KEY || process.env.EXECUTOR_PRIVATE_KEY;
if (execKey) {
  try {
    executorKeypair = Keypair.fromSecretKey(bs58.decode(execKey));
    console.log(`[Relayer] Executor wallet: ${executorKeypair.publicKey.toBase58()}`);
  } catch (e) {
    console.error('[Relayer] Failed to load executor keypair:', e.message);
  }
}

const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
  fetch: async (url, options) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
      } catch (e) {
        if (attempt === 2) throw e;
        console.log(`[Relayer] RPC fetch retry ${attempt + 1}/3...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
      }
    }
  }
});

// Cache tree state to avoid repeated RPC calls
let cachedTreeState = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000; // 30 second cache (public devnet RPC is slow)

async function getTreeStateCached() {
  const now = Date.now();
  if (cachedTreeState && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedTreeState;
  }
  cachedTreeState = await getTreeState();
  cacheTimestamp = now;
  return cachedTreeState;
}

// --- In-memory UTXO index ---
// Maps encrypted_output_hex -> { index, commitment, encrypted_output }
const utxoIndex = new Map();
// Ordered list of encrypted outputs (by Merkle tree index)
const encryptedOutputsByIndex = [];
// Maps commitment_hex -> { index, encrypted_output }
const commitmentIndex = new Map();
// Ordered list of commitment decimal strings (by Merkle tree index)
// Used to rebuild the full Merkle tree
const commitmentsByIndex = [];
let isIndexing = false;

// --- Local Merkle tree (rebuilt from all commitments using Poseidon) ---
let localMerkleTree = null; // { _layers, _zeros, levels }

async function rebuildMerkleTree() {
  const wasm = await ensurePoseidon();
  const levels = MERKLE_TREE_HEIGHT;

  // Compute zero values
  const zeros = [];
  zeros[0] = '0';
  for (let i = 1; i <= levels; i++) {
    zeros[i] = wasm.poseidonHashString([zeros[i - 1], zeros[i - 1]]);
  }

  // Collect all leaf commitments as decimal strings
  const leaves = [];
  for (let i = 0; i < commitmentsByIndex.length; i++) {
    if (commitmentsByIndex[i]) {
      leaves.push(commitmentsByIndex[i]);
    } else {
      leaves.push('0'); // empty slot
    }
  }

  if (leaves.length === 0) {
    localMerkleTree = { _layers: [[]], _zeros: zeros, levels };
    console.log('[Relayer] Merkle tree rebuilt with 0 leaves');
    return;
  }

  // Build layers bottom-up
  const layers = [];
  layers[0] = leaves;

  for (let level = 1; level <= levels; level++) {
    layers[level] = [];
    for (let i = 0; i < Math.ceil(layers[level - 1].length / 2); i++) {
      const left = layers[level - 1][i * 2];
      const right = (i * 2 + 1) < layers[level - 1].length
        ? layers[level - 1][i * 2 + 1]
        : zeros[level - 1];
      layers[level][i] = wasm.poseidonHashString([left, right]);
    }
  }

  localMerkleTree = { _layers: layers, _zeros: zeros, levels };

  const computedRoot = layers[levels].length > 0 ? layers[levels][0] : zeros[levels];
  console.log(`[Relayer] Merkle tree rebuilt with ${leaves.length} leaves, root: ${computedRoot.slice(0, 20)}...`);
}

// --- PDA derivation ---
const [treeAccountPDA] = PublicKey.findProgramAddressSync([Buffer.from('merkle_tree')], PROGRAM_ID);
const [treeTokenPDA] = PublicKey.findProgramAddressSync([Buffer.from('tree_token')], PROGRAM_ID);
const [globalConfigPDA] = PublicKey.findProgramAddressSync([Buffer.from('global_config')], PROGRAM_ID);

console.log(`[Relayer] Program ID: ${PROGRAM_ID.toBase58()}`);
console.log(`[Relayer] Tree Account PDA: ${treeAccountPDA.toBase58()}`);
console.log(`[Relayer] Tree Token PDA: ${treeTokenPDA.toBase58()}`);
console.log(`[Relayer] Global Config PDA: ${globalConfigPDA.toBase58()}`);
console.log(`[Relayer] RPC: ${RPC_URL}`);

// --- Read on-chain Merkle tree state ---
async function getTreeState() {
  const accountInfo = await connection.getAccountInfo(treeAccountPDA);
  if (!accountInfo) {
    throw new Error('Tree account not found. Program may not be initialized.');
  }

  const data = accountInfo.data;
  // MerkleTreeAccount layout (zero_copy):
  // 8 bytes: anchor discriminator
  // 32 bytes: authority (Pubkey)
  // 8 bytes: next_index (u64 LE)
  // 26 * 32 = 832 bytes: subtrees
  // 32 bytes: root
  // 100 * 32 = 3200 bytes: root_history
  // 8 bytes: root_index (u64 LE)
  // 8 bytes: max_deposit_amount (u64 LE)
  // 1 byte: height
  // 1 byte: root_history_size
  // 1 byte: bump
  // 5 bytes: padding

  const authority = new PublicKey(data.slice(8, 40));
  const nextIndex = new BN(data.slice(40, 48), 'le').toNumber();

  const subtreesOffset = 48;
  const subtrees = [];
  for (let i = 0; i < MERKLE_TREE_HEIGHT; i++) {
    subtrees.push(Buffer.from(data.slice(subtreesOffset + i * 32, subtreesOffset + (i + 1) * 32)));
  }

  const rootOffset = subtreesOffset + MERKLE_TREE_HEIGHT * 32;
  const root = Buffer.from(data.slice(rootOffset, rootOffset + 32));

  const rootHistoryOffset = rootOffset + 32;
  const rootHistory = [];
  for (let i = 0; i < 100; i++) {
    rootHistory.push(Buffer.from(data.slice(rootHistoryOffset + i * 32, rootHistoryOffset + (i + 1) * 32)));
  }

  const rootIndex = new BN(data.slice(4112, 4120), 'le').toNumber();
  const maxDepositAmount = new BN(data.slice(4120, 4128), 'le').toNumber();

  return { authority, nextIndex, subtrees, root, rootHistory, rootIndex, maxDepositAmount };
}

// --- Index commitment events from on-chain transactions ---
let indexingPromise = null;

async function indexCommitments() {
  // If already indexing, wait for the current run to finish then run again
  if (isIndexing) {
    if (indexingPromise) await indexingPromise;
    // After waiting, check if we still need to re-index
    if (isIndexing) return;
  }
  isIndexing = true;
  indexingPromise = _doIndexCommitments();
  await indexingPromise;
  indexingPromise = null;
}

async function _doIndexCommitments() {

  try {
    console.log('[Relayer] Indexing commitment events from on-chain transactions...');

    const signatures = await connection.getSignaturesForAddress(
      treeAccountPDA,
      { limit: 1000 },
      'confirmed'
    );

    if (signatures.length === 0) {
      console.log('[Relayer] No transactions found for tree account');
      isIndexing = false;
      return;
    }

    console.log(`[Relayer] Found ${signatures.length} transaction signatures`);

    // Process oldest first
    const sigsToProcess = signatures.reverse();

    let newCommitmentsFound = 0;
    for (const sigInfo of sigsToProcess) {
      if (sigInfo.err) continue;

      try {
        const tx = await connection.getTransaction(sigInfo.signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });

        if (!tx || !tx.meta || !tx.meta.logMessages) continue;

        for (const log of tx.meta.logMessages) {
          if (log.startsWith('Program data: ')) {
            try {
              const eventData = Buffer.from(log.slice('Program data: '.length), 'base64');

              // Parse CommitmentData event:
              // 8 bytes: discriminator
              // 8 bytes: index (u64 LE)
              // 32 bytes: commitment
              // 4 bytes: encrypted_output length (u32 LE)
              // N bytes: encrypted_output data
              if (eventData.length > 52) {
                const index = new BN(eventData.slice(8, 16), 'le').toNumber();
                const commitment = eventData.slice(16, 48);
                const encLen = eventData.readUInt32LE(48);

                if (encLen > 0 && encLen < 10000 && 52 + encLen <= eventData.length) {
                  const encryptedOutput = eventData.slice(52, 52 + encLen).toString('hex');
                  const commitmentHex = commitment.toString('hex');

                  if (!utxoIndex.has(encryptedOutput)) {
                    // Convert commitment bytes to BE decimal string (matches SDK format)
                    const commitmentDecimal = new BN(commitment).toString();
                    const entry = {
                      index,
                      commitment: commitmentHex,
                      commitmentDecimal,
                      encrypted_output: encryptedOutput,
                    };
                    utxoIndex.set(encryptedOutput, entry);
                    commitmentIndex.set(commitmentHex, entry);
                    encryptedOutputsByIndex[index] = encryptedOutput;
                    commitmentsByIndex[index] = commitmentDecimal;
                    newCommitmentsFound++;
                  }
                }
              }
            } catch (e) {
              // Not a valid event, skip
            }
          }
        }
      } catch (e) {
        // Skip individual transaction errors
      }
    }

    console.log(`[Relayer] Indexed ${newCommitmentsFound} new commitments. Total: ${utxoIndex.size}`);

    // Rebuild the full Merkle tree if we have new commitments
    if (newCommitmentsFound > 0 || !localMerkleTree) {
      await rebuildMerkleTree();
    }
  } catch (e) {
    console.error('[Relayer] Error indexing commitments:', e.message);
  }

  isIndexing = false;
}

// --- Merkle proof generation using full local Poseidon tree ---

function findCommitmentEntry(commitmentParam) {
  // Try direct lookup (if already hex)
  let entry = commitmentIndex.get(commitmentParam);
  if (entry) return entry;

  // Convert decimal string -> hex for lookup
  try {
    const commitmentBN = new BN(commitmentParam, 10);
    const commitmentHex = commitmentBN.toBuffer('be', 32).toString('hex');
    console.log(`[merkle/proof] Converting decimal to hex: ${commitmentParam.slice(0, 20)}... -> ${commitmentHex.slice(0, 20)}...`);
    entry = commitmentIndex.get(commitmentHex);
  } catch (e) {
    console.log(`[merkle/proof] Could not convert commitment: ${e.message}`);
  }
  return entry;
}

async function generateMerkleProof(commitmentParam) {
  let entry = findCommitmentEntry(commitmentParam);

  if (!entry) {
    // Re-index and try again
    console.log('[merkle/proof] Commitment not found, re-indexing...');
    await indexCommitments();
    entry = findCommitmentEntry(commitmentParam);
  }
  if (!entry) {
    throw new Error(`Commitment not found in index: ${commitmentParam}`);
  }

  // Ensure the local tree is built
  if (!localMerkleTree) {
    await rebuildMerkleTree();
  }
  if (!localMerkleTree || !localMerkleTree._layers[0].length) {
    throw new Error('Local Merkle tree is empty');
  }

  const targetIndex = entry.index;
  const tree = localMerkleTree;

  // Use the same path() logic as the SDK's MerkleTree class
  const pathElements = [];
  const pathIndices = [];
  let idx = targetIndex;

  for (let level = 0; level < tree.levels; level++) {
    pathIndices.push(idx % 2);
    const siblingIdx = idx ^ 1;
    const sibling = siblingIdx < (tree._layers[level]?.length || 0)
      ? tree._layers[level][siblingIdx]
      : tree._zeros[level];
    pathElements.push(sibling);
    idx >>= 1;
  }

  // Compute root from local tree
  const root = tree._layers[tree.levels]?.length > 0
    ? tree._layers[tree.levels][0]
    : tree._zeros[tree.levels];

  console.log(`[merkle/proof] Generated proof for index ${targetIndex}, root: ${root.slice(0, 20)}...`);

  return {
    pathElements,
    pathIndices,
    root,
  };
}

// --- API Routes ---

// GET /config
app.get('/config', async (req, res) => {
  try {
    const treeState = await getTreeStateCached();
    res.json({
      withdraw_fee_rate: 0.0025,
      withdraw_rent_fee: 0.00203928,
      deposit_fee_rate: 0,
      max_deposit_amount: treeState.maxDepositAmount,
    });
  } catch (e) {
    console.error('[/config] Error:', e.message);
    res.json({
      withdraw_fee_rate: 0.0025,
      withdraw_rent_fee: 0.00203928,
      deposit_fee_rate: 0,
      max_deposit_amount: 1000000000000,
    });
  }
});

// POST /deposit — Receive signed transaction, submit to Solana
app.post('/deposit', async (req, res) => {
  try {
    const { signedTransaction, senderAddress } = req.body;

    if (!signedTransaction) {
      return res.status(400).json({ error: 'Missing signedTransaction' });
    }

    console.log(`[/deposit] Receiving deposit from ${senderAddress}`);

    const txBytes = Buffer.from(signedTransaction, 'base64');
    const tx = VersionedTransaction.deserialize(txBytes);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 5,
    });

    console.log(`[/deposit] Transaction submitted: ${signature}`);

    // Poll for confirmation instead of using confirmTransaction
    // (avoids blockhash mismatch since we didn't create the tx)
    let confirmed = false;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const status = await connection.getSignatureStatus(signature);
        if (status?.value?.confirmationStatus === 'confirmed' || status?.value?.confirmationStatus === 'finalized') {
          if (status.value.err) {
            console.error(`[/deposit] Transaction failed:`, status.value.err);
            return res.status(500).json({ error: 'Transaction failed on-chain', details: status.value.err });
          }
          confirmed = true;
          break;
        }
      } catch (e) {
        // RPC error, keep polling
      }
    }

    if (!confirmed) {
      console.error(`[/deposit] Transaction not confirmed after 60s: ${signature}`);
      return res.status(500).json({ error: `Transaction not confirmed. Check signature: ${signature}` });
    }

    console.log(`[/deposit] Transaction confirmed: ${signature}`);

    // Wait briefly for the tx to be visible via getSignaturesForAddress,
    // then index so /utxos/check finds the new outputs right away
    await new Promise(r => setTimeout(r, 2000));
    await indexCommitments();

    res.json({ success: true, signature });
  } catch (e) {
    console.error('[/deposit] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /withdraw — Build and submit withdraw transaction
app.post('/withdraw', async (req, res) => {
  try {
    const {
      serializedProof,
      treeAccount,
      nullifier0PDA,
      nullifier1PDA,
      nullifier2PDA,
      nullifier3PDA,
      treeTokenAccount,
      globalConfigAccount,
      recipient,
      feeRecipientAccount,
      lookupTableAddress,
      senderAddress,
    } = req.body;

    if (!executorKeypair) {
      return res.status(500).json({ error: 'Executor keypair not configured' });
    }

    console.log(`[/withdraw] Processing withdrawal to ${recipient}`);

    const instructionData = Buffer.from(serializedProof, 'base64');

    const withdrawIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: new PublicKey(treeAccount), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(nullifier0PDA), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(nullifier1PDA), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(nullifier2PDA), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(nullifier3PDA), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(treeTokenAccount), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(globalConfigAccount), isSigner: false, isWritable: false },
        { pubkey: new PublicKey(recipient), isSigner: false, isWritable: true },
        { pubkey: new PublicKey(feeRecipientAccount), isSigner: false, isWritable: true },
        { pubkey: executorKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data: instructionData,
    });

    const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
      units: 1_000_000,
    });

    const recentBlockhash = await connection.getLatestBlockhash('confirmed');

    let lookupTableAccount = null;
    if (lookupTableAddress) {
      try {
        const altResult = await connection.getAddressLookupTable(new PublicKey(lookupTableAddress));
        lookupTableAccount = altResult.value;
      } catch (e) {
        console.log('[/withdraw] Could not load ALT, proceeding without it');
      }
    }

    const messageV0 = new TransactionMessage({
      payerKey: executorKeypair.publicKey,
      recentBlockhash: recentBlockhash.blockhash,
      instructions: [modifyComputeUnits, withdrawIx],
    }).compileToV0Message(lookupTableAccount ? [lookupTableAccount] : []);

    const tx = new VersionedTransaction(messageV0);
    tx.sign([executorKeypair]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 5,
    });

    console.log(`[/withdraw] Transaction submitted: ${signature}`);

    const confirmation = await connection.confirmTransaction({
      signature,
      blockhash: recentBlockhash.blockhash,
      lastValidBlockHeight: recentBlockhash.lastValidBlockHeight,
    }, 'confirmed');

    if (confirmation.value.err) {
      console.error(`[/withdraw] Transaction failed:`, confirmation.value.err);
      return res.status(500).json({ error: 'Withdraw transaction failed', details: confirmation.value.err });
    }

    console.log(`[/withdraw] Withdrawal confirmed: ${signature}`);

    // Wait briefly for the tx to be visible via getSignaturesForAddress,
    // then index so /utxos/check finds the new outputs right away
    await new Promise(r => setTimeout(r, 2000));
    await indexCommitments();

    res.json({ success: true, signature });
  } catch (e) {
    console.error('[/withdraw] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /utxos/range — Return encrypted outputs in range
app.get('/utxos/range', async (req, res) => {
  try {
    const start = parseInt(req.query.start) || 0;
    const end = parseInt(req.query.end) || start + 20000;

    let total;
    try {
      const treeState = await getTreeStateCached();
      total = treeState.nextIndex;
    } catch {
      total = encryptedOutputsByIndex.length;
    }

    const outputs = [];
    for (let i = start; i < Math.min(end, encryptedOutputsByIndex.length); i++) {
      if (encryptedOutputsByIndex[i]) {
        outputs.push(encryptedOutputsByIndex[i]);
      }
    }

    const hasMore = end < total;

    res.json({
      encrypted_outputs: outputs,
      hasMore,
      total,
    });
  } catch (e) {
    console.error('[/utxos/range] Error:', e.message);
    res.json({ encrypted_outputs: [], hasMore: false, total: 0 });
  }
});

// POST /utxos/indices — Map encrypted outputs to Merkle tree indices
app.post('/utxos/indices', async (req, res) => {
  try {
    const { encrypted_outputs } = req.body;

    if (!encrypted_outputs || !Array.isArray(encrypted_outputs)) {
      return res.status(400).json({ error: 'Missing encrypted_outputs array' });
    }

    const indices = encrypted_outputs.map(enc => {
      const entry = utxoIndex.get(enc);
      return entry ? entry.index : null;
    });

    res.json({ indices });
  } catch (e) {
    console.error('[/utxos/indices] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /utxos/check/:encryptedOutput — Check if a UTXO exists
app.get('/utxos/check/:encryptedOutput', async (req, res) => {
  try {
    const { encryptedOutput } = req.params;

    if (utxoIndex.has(encryptedOutput)) {
      return res.json({ exists: true });
    }

    // Re-index with retries — new txs may not be visible immediately
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      await indexCommitments();
      if (utxoIndex.has(encryptedOutput)) {
        return res.json({ exists: true });
      }
    }

    res.json({ exists: false });
  } catch (e) {
    console.error('[/utxos/check] Error:', e.message);
    res.json({ exists: false });
  }
});

// GET /merkle/root — Current tree root and nextIndex
app.get('/merkle/root', async (req, res) => {
  try {
    const treeState = await getTreeStateCached();

    // If we have a local Merkle tree, use its root for consistency with proofs.
    // The on-chain root and local root should match, but using local ensures
    // the proof pathElements and root are always derived from the same tree.
    let root;
    if (localMerkleTree && localMerkleTree._layers[localMerkleTree.levels]?.length > 0) {
      root = localMerkleTree._layers[localMerkleTree.levels][0];
      console.log(`[/merkle/root] Using local tree root: ${root.slice(0, 20)}...`);
    } else {
      // Fallback to on-chain root (BE decimal)
      root = new BN(treeState.root).toString();
      console.log(`[/merkle/root] Using on-chain root: ${root.slice(0, 20)}...`);
    }

    res.json({
      root,
      nextIndex: treeState.nextIndex,
    });
  } catch (e) {
    console.error('[/merkle/root] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /merkle/proof/:commitment — Merkle proof for a commitment
app.get('/merkle/proof/:commitment', async (req, res) => {
  try {
    const { commitment } = req.params;
    const proof = await generateMerkleProof(commitment);
    res.json(proof);
  } catch (e) {
    console.error('[/merkle/proof] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// --- Start server ---
async function start() {
  // Check if tree account exists
  try {
    const treeState = await getTreeState();
    console.log(`[Relayer] Tree state: nextIndex=${treeState.nextIndex}, maxDeposit=${treeState.maxDepositAmount}`);
  } catch (e) {
    console.error(`[Relayer] WARNING: Could not read tree state: ${e.message}`);
    console.error('[Relayer] The Siphon ZK program may not be initialized on this network.');
  }

  // Initial indexing
  console.log('[Relayer] Starting initial commitment indexing...');
  await indexCommitments();

  // Periodically re-index (every 30 seconds)
  // Re-index every 60s to avoid 429 rate limits on public devnet RPC
  // On-demand re-indexing happens via /deposit, /withdraw, and /utxos/check endpoints
  setInterval(() => indexCommitments(), 60000);

  app.listen(PORT, () => {
    console.log(`\n[Relayer] Siphon ZK local relayer running on http://localhost:${PORT}`);
    console.log(`[Relayer] Set NEXT_PUBLIC_RELAYER_API_URL=http://localhost:${PORT} in .env.local`);
  });
}

start().catch(e => {
  console.error('[Relayer] Fatal error:', e);
  process.exit(1);
});
