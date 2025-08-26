// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract MockERC20 is ERC20 {
    bool private initialized;
    string private _name;
    string private _symbol;
    
    constructor() ERC20("", "") {}
    
    function initialize(string memory name_, string memory symbol_) external {
        require(!initialized, "Already initialized");
        initialized = true;
        _name = name_;
        _symbol = symbol_;
        _mint(msg.sender, 1_000_000 ether);
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    // test helper to mint tokens to any address (capped for realistic testing)
    function mint(address to, uint256 amount) external {
        require(amount <= 10_000_000 ether, "MockERC20: amount too large for testing");
        require(totalSupply() + amount <= 1_000_000_000 ether, "MockERC20: total supply too large");
        _mint(to, amount);
    }
}
