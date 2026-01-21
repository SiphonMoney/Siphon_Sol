// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.28;
pragma abicoder v2;

import {Vault} from '../abstracts/Vault.sol';

// Interface for the new SimpleSwapRouter
interface ISimpleSwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingleWithETH(
        address pool,
        address weth,
        ExactInputSingleParams calldata params
    ) external payable returns (uint256 amountOut);
}


contract NativeVault is Vault {

    // Sepolia WETH address
    address public constant WETH = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;

    constructor(address _asset, address _verifier) Vault(_asset, _verifier) {}

    function _receive(address, uint256 _amount) internal override {
        if(msg.value != _amount) revert AmountMismatch();
    }

    function _send(address _to, uint256 _amount) internal override {
        (bool success, ) = _to.call{value: _amount}("");
        if(!success) revert NativeTransferFailed();
    }

    function _swap(address _router, SwapParam memory _param) internal override {
        // Load SimpleSwapRouter
        ISimpleSwapRouter router = ISimpleSwapRouter(_router);

        // Build ExactInputSingleParams struct for the router
        ISimpleSwapRouter.ExactInputSingleParams memory params = ISimpleSwapRouter.ExactInputSingleParams({
            tokenIn: _param.srcToken, // This will be WETH address from Entrypoint
            tokenOut: _param.dstToken,
            fee: _param.fee,
            recipient: _param.recipient,
            deadline: block.timestamp + 60,
            amountIn: _param.amountIn,
            amountOutMinimum: _param.minAmountOut,
            sqrtPriceLimitX96: 0
        });

        // Execute swap call to the custom router, sending ETH to be wrapped.
        router.exactInputSingleWithETH{value: _param.amountIn}(
            _param.pool,
            WETH,
            params
        );
    }
}