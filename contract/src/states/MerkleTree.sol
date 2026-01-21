// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {IMerkleTree} from "../interfaces/IMerkleTree.sol";
import {PoseidonT3} from "poseidon-solidity/PoseidonT3.sol";

contract MerkleTree is IMerkleTree {

    uint32 public constant MAX_DEPTH = 32;
    uint32 public constant ROOT_HISTORY_SIZE = 100;

    mapping(uint256 => uint256) public leaves;
    uint256 public size;

    mapping(uint32 => uint256) public roots;
    uint32 public currentRootIndex;

    /* -------------------------------------------------------------------------- */
    /*                                   Views                                    */
    /* -------------------------------------------------------------------------- */

    function getRoot() external view returns (uint256) {
        return _computeRootFor(size);
    }

    function getDepth() external pure returns (uint256) {
        return MAX_DEPTH;
    }

    function getSize() external view returns (uint256) {
        return size;
    }

    /* -------------------------------------------------------------------------- */
    /*                                  Mutations                                 */
    /* -------------------------------------------------------------------------- */

    function insert(uint256 _leaf) external returns (uint256 _newRoot) {
        if (size >= (1 << MAX_DEPTH)) revert MaxDepthReached();

        leaves[size] = _leaf;
        size++;

        _newRoot = _computeRootFor(size);

        currentRootIndex++;
        roots[currentRootIndex % ROOT_HISTORY_SIZE] = _newRoot;

        emit LeafInserted(size - 1, _leaf, _newRoot);
        return _newRoot;
    }

    function has(uint256 _leaf) external view returns (bool) {
        for (uint256 i = 0; i < size; i++) {
            if (leaves[i] == _leaf) return true;
        }
        return false;
    }

    function rootExists(uint256 _root) external view returns (bool) {
        if (_root == 0) return false;

        uint32 idx = currentRootIndex;
        for (uint32 i = 0; i < ROOT_HISTORY_SIZE; i++) {
            if (roots[idx] == _root) return true;
            unchecked {
                idx = (idx - 1 + ROOT_HISTORY_SIZE) % ROOT_HISTORY_SIZE;
            }
        }
        return false;
    }

    /* -------------------------------------------------------------------------- */
    /*                             Internal: Root Calc                             */
    /* -------------------------------------------------------------------------- */

    /**
     * @dev Computes a FULL 32-level Merkle tree root.
     * Missing leaves are treated as ZERO.
     * Always performs exactly 32 Poseidon hashes regardless of number of leaves.
     */
    function _computeRootFor(uint256 leafCount) internal view returns (uint256) {
        if (leafCount == 0) return 0;

        // Initially the node index refers to a leaf index.
        uint256 nodeIndex = leafCount - 1;

        // “currentHash” starts as the leaf value.
        uint256 currentHash = leaves[nodeIndex];

        // Walk up the fixed 32 levels.
        for (uint32 level = 0; level < MAX_DEPTH; level++) {
            uint256 siblingIndex;

            // Sibling index is XOR 1.
            if (nodeIndex % 2 == 0) {
                siblingIndex = nodeIndex + 1;
            } else {
                siblingIndex = nodeIndex - 1;
            }

            // Fetch sibling or zero if out of range.
            uint256 sibling = (siblingIndex < leafCount)
                ? leaves[siblingIndex]
                : 0;

            // Standard Merkle: if current node is right child,
            // sibling is left; otherwise current is left.
            uint256 left;
            uint256 right;

            if (nodeIndex % 2 == 0) {
                // current is left
                left = currentHash;
                right = sibling;
            } else {
                // current is right
                left = sibling;
                right = currentHash;
            }

            currentHash = PoseidonT3.hash([left, right]);

            // Move up one level
            nodeIndex /= 2;

            // At higher levels, we reference virtual nodes.
            if (leafCount > 1) leafCount = (leafCount + 1) / 2;
        }

        return currentHash;
    }
}
