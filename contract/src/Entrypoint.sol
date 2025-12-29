// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;

import {IVault} from "./interfaces/IVault.sol";
import {IEntrypoint} from "./interfaces/IEntrypoint.sol";
import {NativeVault} from "./states/NativeVault.sol";
import {AlternativeVault} from "./states/AlternativeVault.sol";
import {PlonkVerifier} from './verifiers/WithdrawalVerifier.sol';
import {IERC20} from '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';

contract Entrypoint is IEntrypoint {
    /// @notice The address of the native asset (e.g., ETH)
    address public constant NATIVE_ASSET = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    address public constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    /// @notice The mapping of asset to its corresponding vault
    mapping(address asset => IVault vault) private vaults;

    /// @notice The contract owner
    address public owner;

    /// @notice The ZK verifier
    PlonkVerifier internal immutable verifier;

    /// @notice The SwapRouter address
    address public immutable swapRouter;

    /// @notice The fee wallet address (receives accumulated execution fees)
    address public feeWallet;

    /// @notice Total accumulated execution fees per asset
    mapping(address asset => uint256 totalFees) public totalFeesCollected;

    /// @notice Track fee payments per nullifier (to verify specific operations)
    /// @dev nullifier => executionPrice paid
    mapping(uint256 nullifier => uint256 executionPrice) public feePayments;

    modifier vaultExists(address asset) {
        IVault vault = vaults[asset];
        if(address(vault) == address(0)) revert VaultNotFound();
        _;
    }

    constructor(address _owner, address _swapRouterAddress, address _feeWallet) {
        // Store owner address
        owner = (_owner == address(0)) ? msg.sender : _owner;

        // Initialize ZK verifier
        verifier = new PlonkVerifier();

        // Store the Uniswap V3 SwapRouter address
        swapRouter = _swapRouterAddress;

        // Set fee wallet (default to owner if not provided)
        feeWallet = (_feeWallet == address(0)) ? owner : _feeWallet;
    }

    /// @inheritdoc IEntrypoint
    function initializeVaults(address[] memory assets) external {
        // Deploy vault for each asset then store to mapping
        for (uint256 i = 0; i < assets.length; i++) {
            address asset = address(assets[i]);

            // Deploy vault and store to mapping
            vaults[asset] = (asset == NATIVE_ASSET)
                ? IVault(new NativeVault(asset, address(verifier)))
                : IVault(new AlternativeVault(asset, address(verifier)));
        }
    }

    /// @inheritdoc IEntrypoint
    function deposit(
        address _asset,
        uint256 _amount,
        uint256 _precommitment
    ) external payable vaultExists(_asset) returns (uint256 _commitment) {
        // Fetch the vault for the requested asset
        IVault vault = vaults[address(_asset)];

        // Validate token amount and process deposit
        if (address(_asset) == NATIVE_ASSET) {
            if(msg.value <= 0) revert InvalidDepositAmount();
            _commitment = vault.deposit{value: msg.value}(msg.value, _precommitment);
        } else {
            if(_amount <= 0 || msg.value > 0) revert InvalidDepositAmount();
            IERC20(_asset).transferFrom(msg.sender, address(this),_amount);       // First move the fund from Depositor to Entrypoint
            IERC20(_asset).approve(address(vault), _amount);                      // Then approve the vault to pull the fund
            _commitment = vault.deposit(_amount, _precommitment);
        }
    }

    /// @inheritdoc IEntrypoint
function withdraw(
        address _asset,
        address _recipient,
        uint256 _amount,
        uint256 _stateRoot,
        uint256 _nullifier,
        uint256 _newCommitment,
        uint256[24] calldata _proof
    ) external {
        // Fetch the vault for the requested asset
        IVault vault = vaults[address(_asset)];

        // Validate withdrawal amount
        if(_amount <= 0) revert InvalidWithdrawalAmount();

        // Validate recipient address
        if(_recipient == address(0)) revert ZeroAddress();

        // Transfer funds from the vault to the recipient
        vault.withdraw(_recipient, _amount, _stateRoot, _nullifier, _newCommitment, _proof);
    }

    /// @inheritdoc IEntrypoint
    function swap(
        address _srcToken,
        address _dstToken,
        address payable _recipient,
        uint256 _amountIn,
        uint256 _minAmountOut,
        uint24 _fee,
        uint256 _stateRoot,
        uint256 _nullifier,
        uint256 _newCommitment,
        uint256[24] calldata _proof
    ) external vaultExists(_srcToken) {
        IVault srcVault = vaults[_srcToken];

        // Validate swap amount
        if(_amountIn <= 0) revert InvalidSwapAmount();

        // Validate the fee amount
        if(_fee <= 0) revert InvalidFeeAmount();

        // Validate recipient address
        if(_recipient == address(0)) revert ZeroAddress();

        // Convert ETH to WETH for swap
        if (_srcToken == NATIVE_ASSET) {
            _srcToken = WETH;
        }
        if (_dstToken == NATIVE_ASSET) {
            _dstToken = WETH;
        }

        // Generate swap parameter struct
        IVault.SwapParam memory param = IVault.SwapParam({
            srcToken: _srcToken,
            dstToken: _dstToken,
            recipient: _recipient,
            amountIn: _amountIn,
            minAmountOut: _minAmountOut,
            fee: _fee
        });

        // Execute swap via source vault
        srcVault.swap(param, swapRouter, _stateRoot, _nullifier, _newCommitment, _proof);
    }

    /// @inheritdoc IEntrypoint
    function verify(
        address _asset,
        uint256 _amount,
        uint256 _stateRoot,
        uint256 _nullifier,
        uint256 _newCommitment,
        uint256[24] calldata _proof
    ) external view vaultExists(_asset) returns (bool) {
        IVault vault = vaults[_asset];
        return vault.verify(_amount, _stateRoot, _nullifier, _newCommitment, _proof);
    }

    /// @inheritdoc IEntrypoint
    function getVault(address asset) external view returns (address) {
        return address(vaults[asset]);
    }

    /**
     * @notice Pay execution fee and update commitment (for strategy execution)
     * @param _asset The asset type (native or ERC20)
     * @param _executionPrice The execution price to deduct as fee
     * @param _amount The amount being processed (for proof verification)
     * @param _stateRoot The merkle tree root the proof was generated with
     * @param _nullifier The nullifier hash
     * @param _newCommitment The new commitment hash (with fee deducted)
     * @param _proof The Zero-Knowledge Proof of ownership
     */
    function payExecutionFee(
        address _asset,
        uint256 _executionPrice,
        uint256 _amount,
        uint256 _stateRoot,
        uint256 _nullifier,
        uint256 _newCommitment,
        uint256[24] calldata _proof
    ) external vaultExists(_asset) {
        // Validate execution price
        if(_executionPrice <= 0) revert InvalidSwapAmount();

        IVault vault = vaults[_asset];

        // Check if this nullifier already paid (prevent double payment)
        if(feePayments[_nullifier] != 0) {
            revert FeeAlreadyPaid(_nullifier, feePayments[_nullifier]);
        }

        // Verify the ZK proof (which proves fee was deducted in newCommitment)
        if(!vault.verify(_amount, _stateRoot, _nullifier, _newCommitment, _proof)) {
            revert IVault.InvalidZKProof();
        }

        // Record fee payment for this specific operation
        feePayments[_nullifier] = _executionPrice;

        // Accumulate execution fee
        totalFeesCollected[_asset] += _executionPrice;

        // Update commitment (with fee deducted)
        vault.updateCommitment(_amount, _stateRoot, _nullifier, _newCommitment, _proof);

        emit ExecutionFeePaid(_asset, _executionPrice, _nullifier, _newCommitment);
    }

    /**
     * @notice Withdraw accumulated execution fees
     * @param _asset The asset type to withdraw fees for
     */
    function withdrawFees(address _asset) external {
        if(msg.sender != feeWallet) revert UnauthorizedFeeWithdrawal();
        
        uint256 fees = totalFeesCollected[_asset];
        if(fees == 0) revert NoFeesToWithdraw();
        
        totalFeesCollected[_asset] = 0;
        
        if(_asset == NATIVE_ASSET) {
            payable(feeWallet).transfer(fees);
        } else {
            IERC20(_asset).transfer(feeWallet, fees);
        }

        emit FeesWithdrawn(_asset, fees, feeWallet);
    }

    /**
     * @notice Set fee wallet address (only owner)
     */
    function setFeeWallet(address _feeWallet) external {
        require(msg.sender == owner, "Only owner");
        require(_feeWallet != address(0), "Invalid fee wallet");
        feeWallet = _feeWallet;
    }

    error FeeAlreadyPaid(uint256 nullifier, uint256 paidAmount);
    error UnauthorizedFeeWithdrawal();
    error NoFeesToWithdraw();

    event ExecutionFeePaid(
        address indexed asset,
        uint256 executionPrice,
        uint256 nullifier,
        uint256 newCommitment
    );

    event FeesWithdrawn(
        address indexed asset,
        uint256 amount,
        address indexed recipient
    );
}