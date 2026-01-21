import { ethers } from "hardhat";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const UNISWAP_V3_ROUTER = "0x5D49f98ea31bfa7B41473Bc034BCA56B659C11A3";
const FEE_WALLET = "0xb11B32f5fBE55E1d0e8c4d28FeEE9D812796D9A9";

async function main() {
  console.log("🚀 Deploying Entrypoint contract with fee wallet...");

  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "ETH");

  // Deploy PoseidonT3 library first
  console.log("\n📚 Deploying PoseidonT3 library...");
  const PoseidonT3 = await ethers.getContractFactory("poseidon-solidity/PoseidonT3.sol:PoseidonT3");
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.waitForDeployment();
  const poseidonAddress = await poseidonT3.getAddress();
  console.log("✅ PoseidonT3 deployed to:", poseidonAddress);

  // Deploy Entrypoint
  console.log("\n📦 Deploying Entrypoint...");
  console.log("  Owner:", ZERO_ADDRESS, "(will be deployer)");
  console.log("  SwapRouter:", UNISWAP_V3_ROUTER);
  console.log("  FeeWallet:", FEE_WALLET);

  const Entrypoint = await ethers.getContractFactory("Entrypoint", {
    libraries: {
      "poseidon-solidity/PoseidonT3.sol:PoseidonT3": poseidonAddress,
    },
  });

  const entrypoint = await Entrypoint.deploy(ZERO_ADDRESS, UNISWAP_V3_ROUTER, FEE_WALLET);
  await entrypoint.waitForDeployment();
  const entrypointAddress = await entrypoint.getAddress();
  console.log("✅ Entrypoint deployed to:", entrypointAddress);

  // Initialize vaults
  console.log("\n🔧 Initializing vaults...");
  const assets = [NATIVE_ASSET, USDC];
  const tx = await entrypoint.initializeVaults(assets);
  await tx.wait();
  console.log("✅ Vaults initialized for:", assets);

  // Get vault addresses
  const nativeVault = await entrypoint.getVault(NATIVE_ASSET);
  const usdcVault = await entrypoint.getVault(USDC);
  console.log("  Native Vault:", nativeVault);
  console.log("  USDC Vault:", usdcVault);

  console.log("\n📝 Deployment Summary:");
  console.log("═══════════════════════════════════════");
  console.log("Entrypoint Address:", entrypointAddress);
  console.log("PoseidonT3 Library:", poseidonAddress);
  console.log("Fee Wallet:", FEE_WALLET);
  console.log("Network:", (await ethers.provider.getNetwork()).name);
  console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
  console.log("═══════════════════════════════════════");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

