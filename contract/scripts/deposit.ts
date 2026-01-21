import { ethers } from "hardhat";
import { poseidon } from "circomlibjs";
import { Entrypoint } from "../typechain-types";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Using account:", deployer.address);

  // The address of the deployed Entrypoint contract
  const entrypointAddress = "0xc7cAB7e8901A5404A43f1612542a19Ae7EcDE7A0";

  // The test data we generated
  const value = "500000000000000000"; // 0.5 ETH
  const nullifier = "84765330030487388552534634531269574338230783213079865824779535905352387858";
  const secret = "19717335689852396773432621742354118384238032646462344980708500281740536659";
  const precommitment = "10975102618704486107333648863247671857670139676768996830002174550997243275777";
  const commitment = "12693218180676345223470041086073226039239428251277529617812764834299543956678";

  const entrypoint = await ethers.getContractAt("Entrypoint", entrypointAddress) as Entrypoint;

  console.log("Depositing to the Entrypoint contract...");

  const tx = await entrypoint.deposit(
    "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Native asset
    value,
    precommitment,
    { value: value }
  );

  console.log("Transaction sent:", tx.hash);

  await tx.wait();

  console.log("Deposit successful!");
  console.log("Commitment:", commitment);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
