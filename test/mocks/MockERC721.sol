// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

contract MockERC721 is ERC721 {
    string private _name;
    string private _symbol;

    constructor() ERC721("", "") {}

    function initialize(string memory name_, string memory symbol_) external {
        require(bytes(name()).length == 0, "Already initialized");
        _name = name_;
        _symbol = symbol_;
    }

    function mint(address to, uint256 tokenId) external {
        _safeMint(to, tokenId);
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
} 