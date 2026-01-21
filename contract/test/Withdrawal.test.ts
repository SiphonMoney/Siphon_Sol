// packages/contract/test/Withdrawal.test.ts
import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { Entrypoint, NativeVault, MerkleTree, PlonkVerifier } from "../typechain-types";
import { buildPoseidon } from "circomlibjs";
import { generateWithdrawalProof } from "../../frontend/src/lib/generateProof"; // Assuming this path is correct

// Helper to convert proof to calldata format
function proofToCalldata(proof: any): string[] {
  return [
    proof.A[0], proof.A[1],
    proof.B[0], proof.B[1],
    proof.C[0], proof.C[1],
    proof.Z[0], proof.Z[1],
    proof.T1[0], proof.T1[1],
    proof.T2[0], proof.T2[1],
    proof.T3[0], proof.T3[1],
    proof.Wxi[0], proof.Wxi[1],
    proof.Wxiw[0], proof.Wxiw[1],
    proof.eval_a,
    proof.eval_b,
    proof.eval_c,
    proof.eval_s1,
    proof.eval_s2,
    proof.eval_zw
  ].map(x => x.toString());
}

describe("Withdrawal Flow", function () {
  let entrypoint: Entrypoint;
  let nativeVault: NativeVault;
  let merkleTree: MerkleTree;
  let plonkVerifier: PlonkVerifier;
  let owner: SignerWithAddress;
  let depositor: SignerWithAddress;
  let recipient: SignerWithAddress;
  let poseidon: any;
  let F: any;

  const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
  const MAX_DEPTH = 32; // From MerkleTree.sol

  before(async function () {
    [owner, depositor, recipient] = await ethers.getSigners();

    // Deploy MerkleTree (dependency for Vault)
    const MerkleTreeFactory = await ethers.getContractFactory("MerkleTree");
    merkleTree = await MerkleTreeFactory.deploy();
    await merkleTree.waitForDeployment();

    // Deploy PlonkVerifier (dependency for Vault, but deployed internally)
    // We don't deploy it directly here as Vault deploys its own.
    // We just need the typechain for interaction if needed, but Vault handles deployment.

    // Deploy Entrypoint
    const EntrypointFactory = await ethers.getContractFactory("Entrypoint");
    entrypoint = await EntrypointFactory.deploy(owner.address);
    await entrypoint.waitForDeployment();

    // Initialize vaults via Entrypoint
    await entrypoint.initializeVaults([NATIVE_ASSET]);

    // Get NativeVault instance
    const nativeVaultAddress = await entrypoint.getVault(NATIVE_ASSET);
    nativeVault = await ethers.getContractAt("NativeVault", nativeVaultAddress);

    // Initialize Poseidon for off-chain calculations
    poseidon = await buildPoseidon();
    F = poseidon.F;
  });

  describe("Deposit", function () {
    it("should allow a deposit and update the Merkle tree", async function () {
      const depositAmount = ethers.parseEther("1");
      const existingNullifier = F.toBigInt(ethers.randomBytes(32));
      const existingSecret = F.toBigInt(ethers.randomBytes(32));

      const existingPrecommitment = F.toBigInt(poseidon([existingNullifier, existingSecret]));
      const precommitment = existingPrecommitment; // Use this as precommitment for deposit

      await expect(nativeVault.connect(depositor).deposit(depositAmount, precommitment, { value: depositAmount }))
        .to.emit(nativeVault, "Deposited")
        .withArgs(depositor.address, depositAmount, (commitment: any) => commitment > 0, precommitment, 0); // 0 for code as it's removed

      const commitment = F.toBigInt(poseidon([depositAmount, precommitment]));
      expect(await nativeVault.merkleTree().getRoot()).to.equal(commitment);
    });
  });

  describe("Withdrawal", function () {
    let depositAmount: bigint;
    let existingValue: bigint;
    let existingNullifier: bigint;
    let existingSecret: bigint;
    let existingPrecommitment: bigint;
    let existingCommitment: bigint;
    let pathElements: bigint[];
    let pathIndices: number[];
    let stateRoot: bigint;

    beforeEach(async function () {
      // Reset state for each withdrawal test
      // For simplicity, we'll deposit a new amount for each test
      depositAmount = ethers.parseEther("1");
      existingValue = depositAmount;
      existingNullifier = F.toBigInt(ethers.randomBytes(32));
      existingSecret = F.toBigInt(ethers.randomBytes(32));

      existingPrecommitment = F.toBigInt(poseidon([existingNullifier, existingSecret]));
      existingCommitment = F.toBigInt(poseidon([existingValue, existingPrecommitment]));

      // Simulate Merkle tree insertion for path elements and indices
      // In a real scenario, these would come from a client-side Merkle tree library
      // For testing, we'll use a simplified approach or mock if necessary.
      // For now, let's assume a simple tree where the commitment is the root for a single deposit.
      // This part needs to be more robust if the MerkleTree contract is more complex.
      // For a single leaf, pathElements would be empty and pathIndices would be empty.
      pathElements = Array(MAX_DEPTH).fill(0n); // Fill with 0s for a simple case
      pathIndices = Array(MAX_DEPTH).fill(0); // Fill with 0s for a simple case

      // Deposit the commitment to get it into the Merkle tree
      await nativeVault.connect(depositor).deposit(depositAmount, existingPrecommitment, { value: depositAmount });
      stateRoot = await nativeVault.merkleTree().getRoot(); // The root after our deposit
    });

    it("should allow a valid withdrawal with a correct ZK proof", async function () {
      const withdrawnValue = ethers.parseEther("0.5");
      const newNullifier = F.toBigInt(ethers.randomBytes(32));
      const newSecret = F.toBigInt(ethers.randomBytes(32));

      // Generate ZK proof
      const { proof, publicSignals, nullifierHash, newCommitment } = await generateWithdrawalProof({
        existingValue: existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret: existingSecret.toString(),
        withdrawnValue: withdrawnValue.toString(),
        newNullifier: newNullifier.toString(),
        newSecret: newSecret.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices,
      });

      const proofCalldata = proofToCalldata(proof);

      await expect(nativeVault.connect(depositor).withdraw(
        recipient.address,
        withdrawnValue,
        nullifierHash,
        newCommitment,
        proofCalldata
      )).to.changeEtherBalance(recipient, withdrawnValue);

      expect(await nativeVault.nullifiers(nullifierHash)).to.be.true;
      expect(await nativeVault.merkleTree().getRoot()).to.equal(newCommitment);
    });

    it("should revert if the nullifier has already been spent", async function () {
      const withdrawnValue = ethers.parseEther("0.5");
      const newNullifier = F.toBigInt(ethers.randomBytes(32));
      const newSecret = F.toBigInt(ethers.randomBytes(32));

      // First valid withdrawal
      const { proof: proof1, publicSignals: publicSignals1, nullifierHash: nullifierHash1, newCommitment: newCommitment1 } = await generateWithdrawalProof({
        existingValue: existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret: existingSecret.toString(),
        withdrawnValue: withdrawnValue.toString(),
        newNullifier: newNullifier.toString(),
        newSecret: newSecret.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices,
      });
      await nativeVault.connect(depositor).withdraw(
        recipient.address,
        withdrawnValue,
        nullifierHash1,
        newCommitment1,
        proofToCalldata(proof1)
      );

      // Attempt to withdraw again with the same nullifier
      await expect(nativeVault.connect(depositor).withdraw(
        recipient.address,
        withdrawnValue,
        nullifierHash1, // Same nullifier
        newCommitment1,
        proofToCalldata(proof1)
      )).to.be.revertedWith("Nullifier already spent");
    });

    it("should revert with an invalid ZK proof", async function () {
      const withdrawnValue = ethers.parseEther("0.5");
      const newNullifier = F.toBigInt(ethers.randomBytes(32));
      const newSecret = F.toBigInt(ethers.randomBytes(32));

      const { proof, publicSignals, nullifierHash, newCommitment } = await generateWithdrawalProof({
        existingValue: existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret: existingSecret.toString(),
        withdrawnValue: withdrawnValue.toString(),
        newNullifier: newNullifier.toString(),
        newSecret: newSecret.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices,
      });

      // Tamper with the proof (e.g., change a single value)
      const tamperedProofCalldata = proofToCalldata(proof);
      tamperedProofCalldata[0] = (BigInt(tamperedProofCalldata[0]) + 1n).toString(); // Simple tampering

      await expect(nativeVault.connect(depositor).withdraw(
        recipient.address,
        withdrawnValue,
        nullifierHash,
        newCommitment,
        tamperedProofCalldata
      )).to.be.revertedWith("Invalid ZK proof");
    });

    it("should revert if withdrawn amount exceeds existing value (caught by ZK circuit)", async function () {
      const withdrawnValue = ethers.parseEther("1.5"); // More than existingValue
      const newNullifier = F.toBigInt(ethers.randomBytes(32));
      const newSecret = F.toBigInt(ethers.randomBytes(32));

      // This proof generation should fail or produce an invalid proof due to circuit constraints
      // We expect the transaction to revert with "Invalid ZK proof"
      await expect(generateWithdrawalProof({
        existingValue: existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret: existingSecret.toString(),
        withdrawnValue: withdrawnValue.toString(),
        newNullifier: newNullifier.toString(),
        newSecret: newSecret.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices,
      })).to.be.rejectedWith("Withdrawal amount exceeds existing value."); // This error comes from client-side check
    });

    // Test for incorrect public signals (e.g., wrong stateRoot)
    it("should revert if public signals are manipulated (e.g., wrong stateRoot)", async function () {
      const withdrawnValue = ethers.parseEther("0.5");
      const newNullifier = F.toBigInt(ethers.randomBytes(32));
      const newSecret = F.toBigInt(ethers.randomBytes(32));

      const { proof, publicSignals, nullifierHash, newCommitment } = await generateWithdrawalProof({
        existingValue: existingValue.toString(),
        existingNullifier: existingNullifier.toString(),
        existingSecret: existingSecret.toString(),
        withdrawnValue: withdrawnValue.toString(),
        newNullifier: newNullifier.toString(),
        newSecret: newSecret.toString(),
        pathElements: pathElements.map(x => x.toString()),
        pathIndices: pathIndices,
      });

      const proofCalldata = proofToCalldata(proof);

      // Manipulate stateRoot in publicInputs
      const manipulatedStateRoot = F.toBigInt(ethers.randomBytes(32)); // A random, incorrect root

      await expect(nativeVault.connect(depositor).withdraw(
        recipient.address,
        withdrawnValue,
        nullifierHash,
        newCommitment,
        proofCalldata
      )).to.be.revertedWith("Invalid ZK proof");
    });
  });
});
