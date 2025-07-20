// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Lockx} from '../Lockx.sol';

/// @title LockxHarness – exposes internal state to Foundry tests
contract LockxStateHarness is Lockx {
    /* ─────────── Balances ───────── */
    function getEthBal(uint256 tokenId) external view returns (uint256) {
        return _ethBalances[tokenId];
    }

    function getERC20Bal(uint256 tokenId, address token) external view returns (uint256) {
        return _erc20Balances[tokenId][token];
    }

    /* ─────────── ERC-20 bookkeeping arrays ───────── */
    function getErc20ArrayLength(uint256 tokenId) external view returns (uint256) {
        return _erc20TokenAddresses[tokenId].length;
    }

    function getErc20AddressAt(uint256 tokenId, uint256 index) external view returns (address) {
        return _erc20TokenAddresses[tokenId][index];
    }

    function getErc20Index(uint256 tokenId, address token) external view returns (uint256) {
        return _erc20Index[tokenId][token];
    }

    function getErc20Known(uint256 tokenId, address token) external view returns (bool) {
        // Now we check if token has a balance instead of using _erc20Known mapping
        return _erc20Balances[tokenId][token] > 0;
    }

    /* ─────────── Test Helper for Initialize Function ───────── */
    /// @dev Exposes the internal initialize function for testing purposes
    /// This allows us to test the AlreadyInitialized error condition
    function testInitialize(uint256 tokenId, address lockboxPublicKey) external {
        initialize(tokenId, lockboxPublicKey);
    }

    /// @dev Exposes the internal _requireExists function for testing purposes
    function testRequireExists(uint256 tokenId) external view {
        _requireExists(tokenId);
    }
}


