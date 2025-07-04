// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

contract MockERC721 is ERC721 {
    uint256 public tokenId;
    bool private initialized;
    string private _name;
    string private _symbol;

    constructor() ERC721("", "") {}

    function initialize(string memory name_, string memory symbol_) external {
        require(!initialized, "Already initialized");
        initialized = true;
        tokenId = 1;
        _name = name_;
        _symbol = symbol_;
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    function mint(address to, uint256 id) external {
        _mint(to, id);
    }
}
