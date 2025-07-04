// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockFeeOnTransferToken is ERC20 {
    string private _name;
    string private _symbol;
    uint256 public feePercentage; // 10000 = 100%, 100 = 1%

    constructor() ERC20("", "") {}

    function initialize(string memory name_, string memory symbol_) external {
        require(bytes(name()).length == 0, "Already initialized");
        _name = name_;
        _symbol = symbol_;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function setFeePercentage(uint256 _feePercentage) external {
        require(_feePercentage <= 10000, "Fee cannot exceed 100%");
        feePercentage = _feePercentage;
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        uint256 fee = (amount * feePercentage) / 10000;
        uint256 afterFee = amount - fee;
        super._transfer(from, to, afterFee);
        if (fee > 0) {
            _burn(from, fee);
        }
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }
} 