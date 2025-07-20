// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title OverpayingRouter
 * @dev Mock router that intentionally overpays to test security
 */
contract OverpayingRouter {
    function overpayingSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        // Pull tokenIn from caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Send DOUBLE the expected amount (200% instead of 95%)
        uint256 amountOut = amountIn * 2;
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}