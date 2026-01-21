const { buildPoseidon } = require("circomlibjs");

async function computeMerkleRoot() {
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  
  // Your existing commitment (the leaf)
  const leaf = BigInt("10215288599848691608340142510761314289775839328150572655975698398313397616468");
  
  let current = leaf;
  // Hash up the tree with zeros (32 levels, index 0 => leaf is on left)
  for (let i = 0; i < 32; i++) {
    // pathIndices[i] = 0 means current leaf is on the left
    // So hash: poseidon([current, 0])
    current = F.toString(poseidon([current, BigInt(0)]));
    console.log(`Level ${i}: ${current}`);
  }
  
  console.log("\nFinal Merkle Root:", current);
}

computeMerkleRoot();
