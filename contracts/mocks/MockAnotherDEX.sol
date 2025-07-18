// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title MockAnotherDEX
 * @dev Another mock DEX with different interface to test router-agnostic design
 */
contract MockAnotherDEX {
    
    function executeSwap(
        address tokenA,
        address tokenB,
        uint256 inputAmount,
        uint256 minimumOutput,
        address receiver,
        bytes calldata additionalData
    ) external returns (uint256) {
        // Pull tokenA from caller
        IERC20(tokenA).transferFrom(msg.sender, address(this), inputAmount);
        
        // Calculate output (90% rate for this DEX)
        uint256 outputAmount = (inputAmount * 90) / 100;
        require(outputAmount >= minimumOutput, "Insufficient output");
        
        // Send tokenB to receiver
        IERC20(tokenB).transfer(receiver, outputAmount);
        
        return outputAmount;
    }
}