import { ethers } from "hardhat";
import { Contract } from "ethers";
import { buildPoseidon } from "circomlibjs";
import { IncrementalMerkleTree } from "incremental-merkle-tree";

// Import the generateProof function (adjust paths for script environment)
// We need to temporarily override WASM_PATH and ZKEY_PATH for this script
// In a real scenario, generateProof.js might be refactored to accept these paths as arguments

// --- Temporary path adjustments for generateProof.js ---
// This is a workaround for the script environment.
// In a more robust setup, generateProof.js would accept paths as parameters.
const originalGenerateProofModule = require("../../proof_generator/generateProof");

// Manually set the paths for the script environment
const WASM_PATH_SCRIPT = "../../circuits/build/main_js/main.wasm";
const ZKEY_PATH_SCRIPT = "../../circuits/build/circuit.zkey";

// Override the constants in the imported module (this is hacky but works for a script)
Object.defineProperty(originalGenerateProofModule, 'WASM_PATH', { value: WASM_PATH_SCRIPT });
Object.defineProperty(originalGenerateProofModule, 'ZKEY_PATH', { value: ZKEY_PATH_SCRIPT });

const { generateWithdrawalProof, proofToCalldata } = originalGenerateProofModule;
// --- End temporary path adjustments ---

// --- Merkle Tree Utils (copied/adapted from frontend for script environment) ---
// In a monorepo, these could be in a shared package.
const MERKLE_TREE_DEPTH = 32;
let poseidon: any;

async function getPoseidon() {
  if (!poseidon) {
    poseidon = await buildPoseidon();
  }
  return poseidon;
}

async function buildLocalMerkleTree(events: any[]) {
  const p = await getPoseidon();
  const F = p.F;
  const tree = new IncrementalMerkleTree(F, MERKLE_TREE_DEPTH, BigInt(0), p.poseidon);
  for (const event of events) {
    const leaf = BigInt(event.args._leaf);
    tree.insert(leaf);
  }
  return tree;
}

async function getMerkleProof(tree: IncrementalMerkleTree, existingCommitment: bigint) {
  const p = await getPoseidon();
  const F = p.F;
  const leafIndex = tree.leaves.findIndex(leaf => F.eq(leaf, existingCommitment));
  if (leafIndex === -1) {
    throw new Error(`Commitment ${existingCommitment} not found in the local Merkle tree.`);
  }
  const proof = tree.createProof(leafIndex);
  const pathElements = proof.siblings.map(s => s[0].toString());
  const pathIndices = proof.pathIndices.map(i => Number(i));
  return { pathElements, pathIndices };
}
// --- End Merkle Tree Utils ---

// --- Contract ABIs (imported from artifacts) ---
import EntrypointABI from "../artifacts/src/Entrypoint.sol/Entrypoint.json";
import VaultABI from "../artifacts/src/abstracts/Vault.sol/Vault.json";
import MerkleTreeABI from "../artifacts/src/states/MerkleTree.sol/MerkleTree.json";
// --- End Contract ABIs ---

async function main() {
  console.log("Starting ZK Withdrawal Workflow Test...");

  const [deployer] = await ethers.getSigners();
  const provider = ethers.provider;

  // --- 1. Load Deployed Contract Addresses (User needs to update these) ---
  // These addresses should come from your Hardhat Ignition deployment report
  const ENTRYPOINT_ADDRESS = "0x..."; // REPLACE WITH YOUR DEPLOYED ENTRYPOINT ADDRESS
  const ASSET_ADDRESS = "0x...";      // REPLACE WITH YOUR ASSET ADDRESS (e.g., WETH, or 0xEeeeeE... for native ETH)

  if (ENTRYPOINT_ADDRESS === "0x..." || ASSET_ADDRESS === "0x...") {
    console.error("ERROR: Please update ENTRYPOINT_ADDRESS and ASSET_ADDRESS in the script.");
    process.exit(1);
  }

  const entrypoint = new Contract(ENTRYPOINT_ADDRESS, EntrypointABI.abi, deployer);

  // --- 2. Deposit to create a commitment ---
  console.log("\n--- Performing Deposit ---");
  const depositValue = ethers.parseEther("0.01"); // 0.01 ETH
  const depositNullifier = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const depositSecret = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const precommitment = BigInt((await (await getPoseidon()).poseidon([depositNullifier, depositSecret])).toString());

  console.log(`Depositing ${ethers.formatEther(depositValue)} ETH...`);
  console.log(`Deposit Nullifier: ${depositNullifier.toString()}`);
  console.log(`Deposit Secret: ${depositSecret.toString()}`);
  console.log(`Precommitment: ${precommitment.toString()}`);

  const depositTx = await entrypoint.deposit(ASSET_ADDRESS, depositValue, precommitment, { value: depositValue });
  await depositTx.wait();
  console.log("Deposit transaction successful!");

  // Get the commitment from the event (assuming it's returned or emitted)
  // For simplicity, we'll assume the commitment is precommitment for now, 
  // but in a real scenario, you'd parse the event for the actual commitment.
  // The Entrypoint.deposit returns the commitment, so we can get it from there.
  const depositCommitment = await entrypoint.deposit.staticCall(ASSET_ADDRESS, depositValue, precommitment, { value: depositValue });
  console.log(`Deposited Commitment: ${depositCommitment.toString()}`);

  const existingCommitment = depositCommitment;
  const existingValue = depositValue;
  const existingNullifier = depositNullifier;
  const existingSecret = depositSecret;

  // --- 3. Fetch Merkle Proof Data ---
  console.log("\n--- Fetching Merkle Proof Data ---");
  const vaultAddress = await entrypoint.getVault(ASSET_ADDRESS);
  const vault = new Contract(vaultAddress, VaultABI.abi, deployer);
  const merkleTreeAddress = await vault.merkleTree();
  const merkleTreeContract = new Contract(merkleTreeAddress, MerkleTreeABI.abi, provider);

  const filter = merkleTreeContract.filters.LeafInserted();
  const events = await merkleTreeContract.queryFilter(filter, 0, "latest");
  console.log(`Found ${events.length} LeafInserted events.`);

  const localTree = await buildLocalMerkleTree(events);
  const { pathElements, pathIndices } = await getMerkleProof(localTree, existingCommitment);
  console.log("Merkle Proof generated.");

  // --- 4. Generate ZK Proof for Withdrawal ---
  console.log("\n--- Generating ZK Proof (this may take a while) ---");
  const withdrawnAmount = ethers.parseEther("0.005"); // Withdraw half
  const newNullifier = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const newSecret = BigInt(ethers.hexlify(ethers.randomBytes(32)));
  const recipient = deployer.address; // Withdraw to deployer

  const { proof, publicSignals, nullifierHash, newCommitment } = await generateWithdrawalProof({
    existingValue: existingValue.toString(),
    existingNullifier: existingNullifier.toString(),
    existingSecret: existingSecret.toString(),
    withdrawnValue: withdrawnAmount.toString(),
    newNullifier: newNullifier.toString(),
    newSecret: newSecret.toString(),
    pathElements: pathElements,
    pathIndices: pathIndices,
    recipient: recipient, // Recipient is not used in generateWithdrawalProof, but kept for consistency
  });
  console.log("ZK Proof generated successfully!");

  // --- 5. Execute Withdrawal ---
  console.log("\n--- Executing Withdrawal ---");
  const initialRecipientBalance = await provider.getBalance(recipient);
  console.log(`Recipient initial balance: ${ethers.formatEther(initialRecipientBalance)} ETH`);

  const withdrawTx = await entrypoint.withdraw(
    ASSET_ADDRESS,
    recipient,
    withdrawnAmount,
    nullifierHash,
    newCommitment,
    proof
  );
  await withdrawTx.wait();
  console.log("Withdrawal transaction successful!");

  const finalRecipientBalance = await provider.getBalance(recipient);
  console.log(`Recipient final balance: ${ethers.formatEther(finalRecipientBalance)} ETH`);
  console.log(`Balance change: ${ethers.formatEther(finalRecipientBalance - initialRecipientBalance)} ETH`);

  // --- 6. Verification (Optional) ---
  // You can add more assertions here, e.g., check nullifier status on-chain
  const isNullifierSpent = await vault.nullifiers(nullifierHash);
  console.log(`Nullifier ${nullifierHash.toString()} spent status: ${isNullifierSpent}`);
  if (!isNullifierSpent) {
    throw new Error("Nullifier was not marked as spent!");
  }

  console.log("ZK Withdrawal Workflow Test Completed Successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
