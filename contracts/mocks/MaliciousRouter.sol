// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title MaliciousRouter
 * @dev A test router designed to trigger edge cases in the Lockx contract for coverage testing
 */
contract MaliciousRouter {
    mapping(address => uint256) private outputAmounts;
    mapping(address => bool) private shouldLeaveAllowance;
    
    function setSwapOutput(address token, uint256 amount) external {
        outputAmounts[token] = amount;
    }
    
    function setShouldLeaveAllowance(address token, bool leave) external {
        shouldLeaveAllowance[token] = leave;
    }
    
    function swap(address tokenIn, address tokenOut, uint256 amountIn) external payable {
        if (tokenIn != address(0)) {
            // For ERC20 input
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            
            // Intentionally leave some allowance if configured to do so
            // This tests the currentAllowance != 0 branch
            if (shouldLeaveAllowance[tokenIn]) {
                // Only consume partial allowance, leaving the rest
                // This should trigger the allowance cleanup branch
            }
        }
        
        // Output the configured amount
        uint256 outputAmount = outputAmounts[tokenOut];
        if (outputAmount > 0) {
            if (tokenOut == address(0)) {
                // Send ETH
                payable(msg.sender).transfer(outputAmount);
            } else {
                // Send ERC20 (we need to mint/have these tokens)
                // For testing, we'll assume this router has the tokens
                IERC20(tokenOut).transfer(msg.sender, outputAmount);
            }
        }
    }
    
    // Special function to consume only partial allowance
    function partialAllowanceSwap(address token, uint256 approvedAmount) external {
        // Only consume 50% of the approved amount
        uint256 halfAmount = approvedAmount / 2;
        IERC20(token).transferFrom(msg.sender, address(this), halfAmount);
        
        // Leave the rest of the allowance untouched
        // This should trigger the currentAllowance != 0 cleanup branch
    }
    
    // Function to receive ETH
    receive() external payable {}
    
    // Function to fund the router with tokens for testing
    function fundWithTokens(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}