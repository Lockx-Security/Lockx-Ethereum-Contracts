// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title NoSlippageCheckRouter
 * @dev Mock router that doesn't do internal slippage checks to test Lockx slippage logic
 */
contract NoSlippageCheckRouter {
    
    // Allow contract to receive ETH
    receive() external payable {}
    
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 /* minAmountOut */,
        address recipient
    ) external payable {
        // Don't check minAmountOut here - let Lockx handle slippage protection
        
        if (tokenIn == address(0)) {
            // ETH to token swap
            require(msg.value == amountIn, "ETH amount mismatch");
            // Calculate output (950 tokens per ETH for testing)
            uint256 amountOut = amountIn * 950;
            IERC20(tokenOut).transfer(recipient, amountOut);
        } else if (tokenOut == address(0)) {
            // Token to ETH swap
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            // Calculate output (0.0009 ETH per token for testing)
            uint256 amountOut = (amountIn * 9) / 10000;
            require(address(this).balance >= amountOut, "Insufficient ETH");
            (bool success,) = payable(recipient).call{value: amountOut}("");
            require(success, "ETH transfer failed");
        } else {
            // Token to token swap
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            // Calculate output (95% rate for testing)
            uint256 amountOut = (amountIn * 95) / 100;
            IERC20(tokenOut).transfer(recipient, amountOut);
        }
    }
}