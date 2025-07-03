// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferToken is ERC20 {
    uint256 public feePercentage = 0; // 0 = 0%, 100 = 100%
    
    constructor() ERC20("MockFeeOnTransferToken", "MFOT") {}
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function setFeePercentage(uint256 _feePercentage) external {
        require(_feePercentage <= 100, "Fee cannot exceed 100%");
        feePercentage = _feePercentage;
    }
    
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        uint256 fee = (amount * feePercentage) / 100;
        uint256 actualAmount = amount - fee;
        
        // Burn the fee
        if (fee > 0) {
            _burn(msg.sender, fee);
        }
        
        // Transfer the actual amount
        return super.transfer(to, actualAmount);
    }
    
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        uint256 fee = (amount * feePercentage) / 100;
        uint256 actualAmount = amount - fee;
        
        // Burn the fee
        if (fee > 0) {
            _burn(from, fee);
        }
        
        // Transfer the actual amount
        return super.transferFrom(from, to, actualAmount);
    }
} 