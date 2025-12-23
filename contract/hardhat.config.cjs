require("@nomicfoundation/hardhat-toolbox");
require("dotenv/config");
require("hardhat-contract-sizer");

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 1,
      },
    },
  },
  paths: {
    sources: "./src",
  },
  networks: {
    hardhat: {},
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "",
      accounts: [PRIVATE_KEY],
      allowUnlimitedContractSize: true,
    },
  },
};
