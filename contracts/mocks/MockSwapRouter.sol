// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title MockSwapRouter
 * @dev Mock DEX router for testing swap functionality
 */
contract MockSwapRouter {
    
    bool public shouldRevert = false;
    
    // Allow contract to receive ETH
    receive() external payable {}
    
    function setShouldRevert(bool _shouldRevert) external {
        shouldRevert = _shouldRevert;
    }
    
    function getAmountOut(
        address tokenIn,
        address tokenOut, 
        uint256 amountIn
    ) external view returns (uint256) {
        if (tokenIn == address(0)) {
            // ETH to token: 950 tokens per ETH
            return amountIn * 950;
        } else if (tokenOut == address(0)) {
            // Token to ETH: 0.01 ETH per token  
            return amountIn / 100;
        } else {
            // Token to token: 95% rate
            return (amountIn * 95) / 100;
        }
    }
    
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable {
        if (shouldRevert) {
            revert("Router: Forced revert for testing");
        }
        
        // If recipient is zero address, use msg.sender
        address actualRecipient = recipient == address(0) ? msg.sender : recipient;
        
        if (tokenIn == address(0)) {
            // ETH to token swap
            require(msg.value == amountIn, "ETH amount mismatch");
            // Calculate output (950 tokens per ETH for testing)
            uint256 amountOut = amountIn * 950;
            require(amountOut >= minAmountOut, "Slippage");
            IERC20(tokenOut).transfer(actualRecipient, amountOut);
        } else if (tokenOut == address(0)) {
            // Token to ETH swap
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            // Calculate output (0.01 ETH per token for testing - increased rate)
            uint256 amountOut = amountIn / 100;
            require(amountOut >= minAmountOut, "Slippage");
            require(address(this).balance >= amountOut, "Insufficient ETH");
            (bool success,) = payable(actualRecipient).call{value: amountOut}("");
            require(success, "ETH transfer failed");
        } else {
            // Token to token swap
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            // Calculate output (95% rate for testing)
            uint256 amountOut = (amountIn * 95) / 100;
            require(amountOut >= minAmountOut, "Slippage");
            IERC20(tokenOut).transfer(actualRecipient, amountOut);
        }
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
        // Calculate output (0.01 ETH per token for testing - increased rate)
        uint256 amountOut = amountIn / 100;
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