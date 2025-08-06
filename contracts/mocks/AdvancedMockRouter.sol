// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title AdvancedMockRouter
 * @dev Advanced mock router for testing complex swap behaviors like excess/under spending
 */
contract AdvancedMockRouter {
    
    // State variables to control behavior
    uint256 public actualAmountIn;
    uint256 public actualAmountOut;
    bool public shouldOverspend;
    bool public shouldUnderspend;
    bool public shouldFail;
    
    // Track balance changes for testing
    mapping(address => uint256) public ethBalanceBefore;
    mapping(address => mapping(address => uint256)) public tokenBalanceBefore;
    
    // Allow contract to receive ETH
    receive() external payable {}
    
    /**
     * @dev Set the actual amounts the router will claim to use
     */
    function setActualAmounts(uint256 _actualAmountIn, uint256 _actualAmountOut) external {
        actualAmountIn = _actualAmountIn;
        actualAmountOut = _actualAmountOut;
    }
    
    /**
     * @dev Configure router to simulate overspending
     */
    function setOverspendBehavior(bool _shouldOverspend) external {
        shouldOverspend = _shouldOverspend;
    }
    
    /**
     * @dev Configure router to simulate underspending
     */
    function setUnderspendBehavior(bool _shouldUnderspend) external {
        shouldUnderspend = _shouldUnderspend;
    }
    
    /**
     * @dev Configure router to fail
     */
    function setFailureBehavior(bool _shouldFail) external {
        shouldFail = _shouldFail;
    }
    
    // Storage for expected tokens to send back
    address public outputToken;
    
    /**
     * @dev Set which token to send as output
     */
    function setOutputToken(address _outputToken) external {
        outputToken = _outputToken;
    }
    
    /**
     * @dev Standard swap function for compatibility
     */
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external payable {
        // Simple swap implementation
        address actualRecipient = recipient == address(0) ? msg.sender : recipient;
        
        if (tokenIn == address(0)) {
            // ETH to token
            require(msg.value == amountIn, "ETH amount mismatch");
            uint256 amountOut = amountIn * 950; // 950 tokens per ETH
            require(amountOut >= minAmountOut, "Slippage");
            IERC20(tokenOut).transfer(actualRecipient, amountOut);
        } else if (tokenOut == address(0)) {
            // Token to ETH
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            uint256 amountOut = amountIn / 100; // 0.01 ETH per token
            require(amountOut >= minAmountOut, "Slippage");
            require(address(this).balance >= amountOut, "Insufficient ETH");
            (bool success,) = payable(actualRecipient).call{value: amountOut}("");
            require(success, "ETH transfer failed");
        } else {
            // Token to token
            IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
            uint256 amountOut = (amountIn * 95) / 100; // 95% rate
            require(amountOut >= minAmountOut, "Slippage");
            IERC20(tokenOut).transfer(actualRecipient, amountOut);
        }
    }

    /**
     * @dev Generic swap function that the Lockx contract calls (legacy)
     * This function should transfer output tokens to the caller (Lockx contract)
     */
    function swapAdvanced(bytes calldata /* data */) external payable {
        if (shouldFail) {
            revert("Router: Simulated failure");
        }
        
        // The Lockx contract will measure balance changes to determine actual amounts
        // We need to ensure we actually transfer tokens back to create the expected balance changes
        
        // For ETH input, provide token output based on configured amounts
        if (msg.value > 0) {
            // ETH to token swap - send tokens back to caller (Lockx contract)
            // Use actualAmountOut if set, otherwise calculate based on msg.value
            uint256 tokenOutput = actualAmountOut > 0 ? actualAmountOut : (msg.value * 95) / 100; // Default rate
            
            // Transfer tokens to caller if we have them and output token is set
            if (outputToken != address(0) && IERC20(outputToken).balanceOf(address(this)) >= tokenOutput) {
                IERC20(outputToken).transfer(msg.sender, tokenOutput);
            }
        } else {
            // For token input, send ETH back if we have it
            uint256 ethOutput = actualAmountOut > 0 ? actualAmountOut : 1 ether;
            if (address(this).balance >= ethOutput) {
                (bool success,) = payable(msg.sender).call{value: ethOutput}("");
                require(success, "ETH transfer failed");
            }
        }
    }
    
    /**
     * @dev Specific ETH to token swap with configurable behavior
     */
    function swapETHForTokens(
        address tokenOut,
        uint256 minAmountOut,
        address recipient
    ) external payable {
        if (shouldFail) {
            revert("Router: Swap failed");
        }
        
        uint256 amountOut;
        
        if (shouldOverspend) {
            // Simulate claiming to use more ETH than we actually received
            // We'll report this via actualAmountIn
            amountOut = (msg.value * 95) / 100; // Normal conversion rate
        } else if (shouldUnderspend) {
            // Use less ETH, refund the difference
            uint256 actualUsed = (msg.value * 70) / 100; // Use only 70%
            uint256 refund = msg.value - actualUsed;
            amountOut = (actualUsed * 95) / 100;
            
            // Send refund
            if (refund > 0) {
                (bool success,) = payable(msg.sender).call{value: refund}("");
                require(success, "Refund failed");
            }
        } else {
            // Normal behavior
            amountOut = (msg.value * 95) / 100;
        }
        
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokens if we have them
        if (IERC20(tokenOut).balanceOf(address(this)) >= amountOut) {
            IERC20(tokenOut).transfer(recipient, amountOut);
        }
    }
    
    /**
     * @dev Token to ETH swap with configurable behavior  
     */
    function swapTokensForETH(
        address tokenIn,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        if (shouldFail) {
            revert("Router: Swap failed");
        }
        
        uint256 actualTokensUsed;
        uint256 ethOut;
        
        if (shouldOverspend) {
            // Take more tokens than specified
            actualTokensUsed = (amountIn * 120) / 100; // Take 20% more
            ethOut = (actualTokensUsed * 9) / 10000; // Conversion rate
        } else if (shouldUnderspend) {
            // Take fewer tokens  
            actualTokensUsed = (amountIn * 80) / 100; // Take 20% less
            ethOut = (actualTokensUsed * 9) / 10000;
        } else {
            // Normal behavior
            actualTokensUsed = amountIn;
            ethOut = (amountIn * 9) / 10000;
        }
        
        require(ethOut >= minAmountOut, "Slippage");
        require(address(this).balance >= ethOut, "Insufficient ETH");
        
        // Pull tokens (actual amount may differ from amountIn)
        IERC20(tokenIn).transferFrom(msg.sender, address(this), actualTokensUsed);
        
        // Send ETH
        (bool success,) = payable(recipient).call{value: ethOut}("");
        require(success, "ETH transfer failed");
    }
    
    /**
     * @dev Fund the router with ETH for testing
     */
    function fundETH() external payable {}
    
    /**
     * @dev Fund the router with tokens for testing
     */
    function fundTokens(address token, uint256 amount) external {
        IERC20(token).transferFrom(msg.sender, address(this), amount);
    }
}