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
        return _erc20Known[tokenId][token];
    }
}
