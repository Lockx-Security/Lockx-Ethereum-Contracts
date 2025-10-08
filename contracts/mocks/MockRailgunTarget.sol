// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Minimal mock for Railgun transact. Lives at an allowlisted address via setCode.
contract MockRailgunTarget {
    uint256 public pullAmount; // amount to pull via transferFrom per call
    address public pullToken;  // token to pull; address(0) means use msg.value only

    function setPull(address token, uint256 amount) external {
        pullToken = token;
        pullAmount = amount;
    }

    // Minimal dispatcher-less handler to accept any calldata (used for tests)
    fallback() external payable {
        if (pullToken != address(0) && pullAmount > 0) {
            IERC20(pullToken).transferFrom(msg.sender, address(this), pullAmount);
        }
    }

    receive() external payable {}
}
