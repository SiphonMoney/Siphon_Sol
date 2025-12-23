import { ethers, run } from "hardhat";

async function main() {
  console.log("🚀 Deploying WithdrawalVerifier contract...");

  // Get the deployer account
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // Deploy the verifier
  const PlonkVerifier = await ethers.getContractFactory("PlonkVerifier");
  console.log("Deploying WithdrawalVerifier...");
  
  const verifier = await PlonkVerifier.deploy();
  await verifier.waitForDeployment();

  const verifierAddress = await verifier.getAddress();
  console.log("✅ WithdrawalVerifier deployed to:", verifierAddress);

  // Wait for a few block confirmations
  console.log("Waiting for block confirmations...");
  await verifier.deploymentTransaction()?.wait(5);
  
  console.log("\n📝 Deployment Summary:");
  console.log("═══════════════════════════════════════");
  console.log("Verifier Address:", verifierAddress);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("═══════════════════════════════════════");
  
  console.log("\n⚠️  NEXT STEPS:");
  console.log("1. Update your Entrypoint/Vault contract to use this verifier");
  console.log("2. If already deployed, call setVerifier() or redeploy with new verifier address");
  console.log("3. Update your frontend ENTRYPOINT_ADDRESS if needed");

  // Try to verify on Etherscan (if on a public network)
  if (process.env.ETHERSCAN_API_KEY) {
    console.log("\n🔍 Verifying contract on Etherscan...");
    try {
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30s for Etherscan to index
      
      await run("verify:verify", {
        address: verifierAddress,
        constructorArguments: [],
      });
      console.log("✅ Contract verified on Etherscan");
    } catch (error) {
      console.log("⚠️  Verification failed:", error);
      console.log("You can manually verify later with:");
      console.log(`npx hardhat verify --network sepolia ${verifierAddress}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });