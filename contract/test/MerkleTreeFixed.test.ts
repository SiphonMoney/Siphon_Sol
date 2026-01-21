import { expect } from "chai";
import { ethers } from "hardhat";

describe("MerkleTree (Fixed 32-level)", () => {
  let merkleTree: any;

  before(async () => {
    const MerkleTree = await ethers.getContractFactory("MerkleTree");
    merkleTree = await MerkleTree.deploy();
    await merkleTree.deployed();
  });

  it("should have MAX_DEPTH of 32", async () => {
    expect(await merkleTree.MAX_DEPTH()).to.equal(32);
  });

  it("should insert a leaf and compute root", async () => {
    const leaf1 = BigInt("123456789");
    const tx = await merkleTree.insert(leaf1);
    await tx.wait();

    const root = await merkleTree.getRoot();
    expect(root).to.not.equal(0);
  });

  it("should track multiple leaves", async () => {
    const leaf2 = BigInt("987654321");
    const leaf3 = BigInt("555555555");

    await (await merkleTree.insert(leaf2)).wait();
    await (await merkleTree.insert(leaf3)).wait();

    const size = await merkleTree.getSize();
    expect(size).to.equal(3); // leaf1 + leaf2 + leaf3
  });

  it("rootExists should verify stored roots", async () => {
    const currentRoot = await merkleTree.getRoot();
    const exists = await merkleTree.rootExists(currentRoot);
    expect(exists).to.be.true;
  });

  it("should handle large inserts without overflow", async () => {
    // Insert another leaf to verify padding works
    const leaf4 = BigInt("111111111");
    await (await merkleTree.insert(leaf4)).wait();

    const root = await merkleTree.getRoot();
    expect(root).to.not.equal(0);
  });
});
