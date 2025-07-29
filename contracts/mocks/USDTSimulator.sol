// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

/**
 * @title USDTSimulator  
 * @dev Mock contract to simulate USDT's approval behavior for line 465 testing
 */
contract USDTSimulator {
    mapping(address => mapping(address => uint256)) private _allowances;
    mapping(address => uint256) private _balances;
    
    string public name = "USDT Simulator";
    string public symbol = "USDT";
    uint8 public decimals = 18;
    
    // Set initial allowance to test line 465
    function setAllowance(address owner, address spender, uint256 amount) external {
        _allowances[owner][spender] = amount;
    }
    
    function allowance(address owner, address spender) external view returns (uint256) {
        return _allowances[owner][spender];
    }
    
    function balanceOf(address account) external view returns (uint256) {
        return _balances[account];
    }
    
    function mint(address to, uint256 amount) external {
        _balances[to] += amount;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        require(_balances[msg.sender] >= amount, "Insufficient balance");
        _balances[msg.sender] -= amount;
        _balances[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(_balances[from] >= amount, "Insufficient balance");
        require(_allowances[from][msg.sender] >= amount, "Insufficient allowance");
        
        _balances[from] -= amount;
        _balances[to] += amount;
        _allowances[from][msg.sender] -= amount;
        
        return true;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }
    
    // Simulate USDT's force approve behavior
    function forceApprove(address spender, uint256 amount) external returns (bool) {
        _allowances[msg.sender][spender] = amount;
        return true;
    }
}

/**
 * @title AllowanceRouter
 * @dev Router that specifically creates conditions for line 465 testing
 */
contract AllowanceRouter {
    mapping(address => uint256) public outputAmounts;
    bool public leaveAllowance = true;
    
    receive() external payable {}
    
    function setOutputAmount(address token, uint256 amount) external {
        outputAmounts[token] = amount;
    }
    
    function setLeaveAllowance(bool _leave) external {
        leaveAllowance = _leave;
    }
    
    function swap(address tokenIn, address tokenOut, uint256 amountIn) external payable {
        if (tokenIn != address(0)) {
            // Only take partial allowance to leave some remaining
            uint256 partialAmount = leaveAllowance ? amountIn / 2 : amountIn;
            IERC20(tokenIn).transferFrom(msg.sender, address(this), partialAmount);
        }
        
        // Send output
        uint256 output = outputAmounts[tokenOut];
        if (output > 0 && tokenOut == address(0)) {
            payable(msg.sender).transfer(output);
        }
    }
}