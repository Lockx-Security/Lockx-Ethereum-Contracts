// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title MockSwapRouter
 * @dev Mock DEX router for testing swap functionality
 */
contract MockSwapRouter {
    
    // Allow contract to receive ETH
    receive() external payable {}
    
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        // Pull tokenIn from caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Calculate output (95% rate for testing)
        uint256 amountOut = (amountIn * 95) / 100;
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
    
    function swapETHForTokens(
        address tokenOut,
        uint256 minAmountOut,
        address recipient
    ) external payable {
        // Calculate output (950 tokens per ETH for testing)
        uint256 amountOut = msg.value * 950;
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
    
    function swapTokensForETH(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        // Calculate output (0.0009 ETH per token for testing)
        uint256 amountOut = (amountIn * 9) / 10000;
        require(amountOut >= minAmountOut, "Router: Slippage protection");
        require(address(this).balance >= amountOut, "Router: Insufficient ETH");
        
        // Check allowance first
        uint256 allowance = IERC20(tokenIn).allowance(msg.sender, address(this));
        require(allowance >= amountIn, "Router: Insufficient allowance");
        
        // Check sender balance
        uint256 senderBalance = IERC20(tokenIn).balanceOf(msg.sender);
        require(senderBalance >= amountIn, "Router: Insufficient sender balance");
        
        // Pull tokenIn from caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Send ETH to recipient
        (bool success,) = payable(recipient).call{value: amountOut}("");
        require(success, "Router: ETH transfer failed");
    }
}