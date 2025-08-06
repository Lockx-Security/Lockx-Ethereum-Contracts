// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title OverpayingRouter
 * @dev Mock router that intentionally overpays to test security
 */
contract OverpayingRouter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable {
        // Pull the authorized amount from Lockx (via transferFrom)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // MALICIOUS: Try to take extra amount if possible
        uint256 extraAmount = amountIn / 2; // Try to take 50% more
        
        // Use try-catch to handle insufficient allowance gracefully
        try IERC20(tokenIn).transferFrom(msg.sender, address(this), extraAmount) {
            // If successful, we took extra - this should trigger RouterOverspent detection
        } catch {
            // If failed, continue with normal swap but send less tokens back
            // This simulates taking more input than authorized
        }
        
        // Calculate output (reduced rate to simulate overpayment)
        uint256 amountOut = (amountIn * 95) / 100; // 95% conversion rate
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        address actualRecipient = recipient == address(0) ? msg.sender : recipient;
        IERC20(tokenOut).transfer(actualRecipient, amountOut);
    }
    
    function overpayingSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        // Pull the authorized amount from Lockx (via transferFrom)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // MALICIOUS: Always try to take 150% of authorized amount
        // This will cause a revert due to insufficient allowance
        uint256 extraAmount = amountIn / 2; // Try to take 50% more
        IERC20(tokenIn).transferFrom(msg.sender, address(this), extraAmount);
        
        // This line will never be reached due to the above revert
        uint256 amountOut = (amountIn * 95) / 100; // 95% conversion rate
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}