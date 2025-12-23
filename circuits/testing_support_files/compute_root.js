#!/usr/bin/env node
// Ahhhhhhhhhhhh, need to kms
// Debug helper: compute values that the circuit asserts and compare with input.json

const fs = require('fs');
const path = require('path');
const { buildPoseidon } = require('circomlibjs');

async function main() {
  const arg = process.argv[2] || 'input.json';
  const p = path.resolve(process.cwd(), arg);
  if (!fs.existsSync(p)) {
    console.error('Input file not found:', p);
    process.exit(2);
  }

  const raw = fs.readFileSync(p, 'utf8');
  let input;
  try {
    input = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse JSON:', e.message);
    process.exit(2);
  }

  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  const toBig = (x) => (typeof x === 'string' ? BigInt(x) : BigInt(x));
  const treeDepth = 32;

  function poseidonHash(arr) {
    const res = poseidon(arr.map(a => (typeof a === 'bigint' ? a : BigInt(a))));
    return BigInt(F.toObject(res));
  }

  // Parse inputs
  const existingValue = toBig(input.existingValue || 0);
  const existingNullifier = toBig(input.existingNullifier || 0);
  const existingSecret = toBig(input.existingSecret || 0);
  const newNullifier = toBig(input.newNullifier || 0);
  const newSecret = toBig(input.newSecret || 0);
  const withdrawnValue = toBig(input.withdrawnValue || 0);

  const pathElements = (input.pathElements || []).map(x => BigInt(x || 0));
  const pathIndices = (input.pathIndices || []).map(x => Number(x || 0));
  const pathActive = (input.pathActive || []).map(x => Number(x || 0));

  while (pathElements.length < treeDepth) pathElements.push(0n);
  while (pathIndices.length < treeDepth) pathIndices.push(0);
  while (pathActive.length < treeDepth) pathActive.push(1); // default active

  console.log('--- Circuit input quick-check ---');
  console.log('existingValue:', existingValue.toString());
  console.log('existingNullifier:', existingNullifier.toString());
  console.log('existingSecret:', existingSecret.toString());
  console.log('withdrawnValue:', withdrawnValue.toString());

  // Compute nullifierHash
  const nullifierHash = poseidonHash([existingNullifier]);
  console.log('computed nullifierHash:', nullifierHash.toString());
  if (input.nullifierHash) console.log('provided nullifierHash:', input.nullifierHash);

  // Compute existing commitment
  const existingPrecommit = poseidonHash([existingNullifier, existingSecret]);
  const existingCommitment = poseidonHash([existingValue, existingPrecommit]);
  console.log('computed existingCommitment:', existingCommitment.toString());
  if (input.existingCommitment) console.log('provided existingCommitment:', input.existingCommitment);

  // Compute new commitment
  const changeValue = existingValue - withdrawnValue;
  const newPrecommit = poseidonHash([newNullifier, newSecret]);
  const newCommitment = poseidonHash([changeValue, newPrecommit]);
  console.log('computed newCommitment:', newCommitment.toString());
  if (input.newCommitment) console.log('provided newCommitment:', input.newCommitment);

  // Compute Merkle root using pathActive
  let computedRoot = existingCommitment;
  console.log('Starting root computation from existingCommitment:', existingCommitment.toString());
  let nonZeroActive = 0;
  for (let i = 0; i < treeDepth; i++) {
    const el = pathElements[i] || 0n;
    const idx = pathIndices[i] || 0;
    const active = pathActive[i] === 1 ? 1 : 0;
    if (active === 1) {
      nonZeroActive++;
      if (idx === 0) {
        computedRoot = poseidonHash([computedRoot, el]);
      } else {
        computedRoot = poseidonHash([el, computedRoot]);
      }
    } else {
      // pass-through
      computedRoot = computedRoot;
    }
    // Print every 4th level to reduce output
    if ((i + 1) % 4 === 0) {
      console.log(`  Level ${i}: root=${computedRoot.toString()}`);
    }
  }
  console.log('Total active levels (pathActive==1):', nonZeroActive);
  console.log('computed merkle root (sparse-aware):', computedRoot.toString());
  if (input.stateRoot) console.log('provided stateRoot:', input.stateRoot);

  // Check arithmetic constraint existingValue == withdrawnValue + changeValue
  console.log('changeValue (existing - withdrawn):', changeValue.toString());
  console.log('withdrawn + change:', (withdrawnValue + changeValue).toString());
  if (existingValue !== (withdrawnValue + changeValue)) {
    console.warn('Mismatch: existingValue !== withdrawnValue + changeValue');
  }

  // Basic summary of path lengths
  const originalSiblings = (input.pathElements || []).filter(x => x && x !== '0' && x !== 0).length;
  console.log('original siblings provided (non-zero count):', originalSiblings);
  console.log('pathActive summary (first 16):', pathActive.slice(0, 16));
  console.log('pathIndices summary (first 16):', pathIndices.slice(0, 16));
  console.log('pathElements summary (first 8):', pathElements.slice(0, 8).map(x => x.toString()));

  // final verdict
  if (input.nullifierHash && BigInt(input.nullifierHash) !== nullifierHash) {
    console.error('\n>> nullifierHash mismatch - this would trigger an assert in the circuit');
  }
  if (input.newCommitment && BigInt(input.newCommitment) !== newCommitment) {
    console.error('\n>> newCommitment mismatch - this would trigger an assert in the circuit');
  }
  if (input.stateRoot && BigInt(input.stateRoot) !== computedRoot) {
    console.error('\n>> stateRoot (merkle root) mismatch - this would trigger the merkleChecker.root === stateRoot assert');
    process.exitCode = 3;
  } else {
    console.log('\nAll quick checks passed (stateRoot matches computed root, nullifier/newCommitment match).');
  }
}

main().catch((e) => {
  console.error('Error during check:', e);
  process.exit(1);
});
