// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title RejectETH
 * @dev Helper contract that rejects all ETH transfers to test ETH transfer failure branches
 */
contract RejectETH {
    // This contract will reject any ETH sent to it
    receive() external payable {
        revert("ETH not accepted");
    }
    
    fallback() external payable {
        revert("ETH not accepted");
    }
} 