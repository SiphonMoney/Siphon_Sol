const { ethers } = require("ethers");
const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;

  const value = ethers.parseEther("0.5"); // 0.5 ETH
  const nullifier = ethers.toBigInt(ethers.randomBytes(31));
  const secret = ethers.toBigInt(ethers.randomBytes(31));

  const precommitment = poseidon([nullifier, secret]);
  const commitment = poseidon([value, precommitment]);

  console.log("Test Data:");
  console.log("Value:", value.toString());
  console.log("Nullifier:", nullifier.toString());
  console.log("Secret:", secret.toString());
  console.log("Precommitment:", F.toString(precommitment));
  console.log("Commitment:", F.toString(commitment));
}

main();
