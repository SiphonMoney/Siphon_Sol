import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const TOKEN_ADDRESSES = [NATIVE_ASSET, USDC];

// Fee wallet address for withdrawing accumulated fees
const FEE_WALLET = "0xb11B32f5fBE55E1d0e8c4d28FeEE9D812796D9A9";

const DeploymentModuleFreshV3 = buildModule("DeploymentModuleFreshV3", (m) => {
  const poseidonT3 = m.library("poseidon-solidity/PoseidonT3.sol:PoseidonT3");

  // 1. Deploy the new custom router
  const simpleSwapRouter = m.contract("SimpleSwapRouter", [], {
    id: "SimpleSwapRouter",
  });

  // 2. Deploy Entrypoint and pass the custom router's address and fee wallet
  const entrypoint = m.contract(
    "Entrypoint",
    [ZERO_ADDRESS, simpleSwapRouter, FEE_WALLET],
    {
      libraries: {
        PoseidonT3: poseidonT3,
      },
    }
  );

  const assets = m.getParameter<string[]>("assets", TOKEN_ADDRESSES);
  m.call(entrypoint, "initializeVaults", [assets], {
    id: "InitializeVaults",
  });

  return { entrypoint, poseidonT3, simpleSwapRouter };
});

export default DeploymentModuleFreshV3;
