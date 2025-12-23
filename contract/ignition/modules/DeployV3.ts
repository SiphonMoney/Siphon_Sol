import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-ignition-ethers";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const NATIVE_ASSET = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";

const TOKEN_ADDRESSES = [NATIVE_ASSET, USDC];

// Sepolia Uniswap V3 SwapRouter
const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

const DeploymentModuleFreshV3 = buildModule("DeploymentModuleFreshV3", (m) => {
  const poseidonT3 = m.library("poseidon-solidity/PoseidonT3.sol:PoseidonT3");

  // Entrypoint(owner, swapRouter)
  const entrypoint = m.contract(
    "Entrypoint",
    [ZERO_ADDRESS, UNISWAP_V3_ROUTER],
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

  return { entrypoint, poseidonT3 };
});

export default DeploymentModuleFreshV3;
