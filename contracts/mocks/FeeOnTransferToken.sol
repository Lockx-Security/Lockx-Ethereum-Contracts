// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

/**
 * @title FeeOnTransferToken
 * @dev Mock ERC20 token that charges a fee on transfers to test edge cases
 */
contract FeeOnTransferToken is ERC20 {
    uint256 public constant FEE_PERCENT = 5; // 5% fee on transfers
    
    constructor() ERC20("FeeToken", "FEE") {
        _mint(msg.sender, 1000000 * 10**18);
    }
    
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        uint256 fee = (amount * FEE_PERCENT) / 100;
        uint256 netAmount = amount - fee;
        
        _transfer(owner, to, netAmount);
        if (fee > 0) {
            _transfer(owner, address(this), fee); // Fee goes to contract
        }
        
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        
        uint256 fee = (amount * FEE_PERCENT) / 100;
        uint256 netAmount = amount - fee;
        
        _transfer(from, to, netAmount);
        if (fee > 0) {
            _transfer(from, address(this), fee); // Fee goes to contract
        }
        
        return true;
    }
}