const { buildPoseidon } = require("circomlibjs");

async function main() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  // Ranodm inputs
  const existingValue = BigInt("5000000000000000000");
  const existingNullifier = BigInt("12345");
  const existingSecret = BigInt("67890");
  const withdrawnValue = BigInt("1000000000000000000");
  const newNullifier = BigInt("54321");
  const newSecret = BigInt("98765");
  
  // Compute nullifier hash
  const nullifierHash = F.toString(poseidon([existingNullifier]));
  
  // Compute existing commitment
  const existingPrecommitment = F.toString(poseidon([existingNullifier, existingSecret]));
  const existingCommitment = F.toString(poseidon([existingValue, existingPrecommitment]));
  
  // Compute new commitment
  const remainingValue = existingValue - withdrawnValue;
  const newPrecommitment = F.toString(poseidon([newNullifier, newSecret]));
  const newCommitment = F.toString(poseidon([remainingValue, newPrecommitment]));
  
  console.log({
    nullifierHash,
    existingCommitment,
    newCommitment,
    remainingValue: remainingValue.toString()
  });
}

main();