// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferToken is ERC20 {
    uint256 public feePercentage = 0; // 0 = 0%, 100 = 100%
    bool private initialized;
    string private _name;
    string private _symbol;
    
    constructor() ERC20("", "") {}
    
    function initialize(string memory name_, string memory symbol_) external {
        require(!initialized, "Already initialized");
        initialized = true;
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
    
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
    
    function setFeePercentage(uint256 _feePercentage) external {
        require(_feePercentage <= 10000, "Fee cannot exceed 100%");
        feePercentage = _feePercentage;
    }
    
    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        uint256 fee = (amount * feePercentage) / 10000;
        uint256 actualAmount = amount - fee;
        
        // Burn the fee
        if (fee > 0) {
            _burn(msg.sender, fee);
        }
        
        // Transfer the actual amount
        return super.transfer(to, actualAmount);
    }
    
    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        uint256 fee = (amount * feePercentage) / 10000;
        uint256 actualAmount = amount - fee;
        
        // Burn the fee
        if (fee > 0) {
            _burn(from, fee);
        }
        
        // Transfer the actual amount
        return super.transferFrom(from, to, actualAmount);
    }
} 