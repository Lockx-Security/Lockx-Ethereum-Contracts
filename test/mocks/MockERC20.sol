// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    string private _name;
    string private _symbol;

    constructor() ERC20("", "") {}

    function initialize(string memory name_, string memory symbol_) external {
        require(bytes(name()).length == 0, "Already initialized");
        _name = name_;
        _symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
} 