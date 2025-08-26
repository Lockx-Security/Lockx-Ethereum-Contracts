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

    /* ─────────── ERC-721 bookkeeping arrays ───────── */
    function getNftKeysLength(uint256 tokenId) external view returns (uint256) {
        return _nftKeys[tokenId].length;
    }

    function getNftKeyAt(uint256 tokenId, uint256 index) external view returns (bytes32) {
        return _nftKeys[tokenId][index];
    }

    function getNftIndex(uint256 tokenId, bytes32 key) external view returns (uint256) {
        return _nftIndex[tokenId][key];
    }

    function getNftRecord(uint256 tokenId, bytes32 key) external view returns (address, uint256) {
        nftBalances memory r = _lockboxNftData[tokenId][key];
        return (r.nftContract, r.nftTokenId);
    }

    /* ─────────── Test Helper for Initialize Function ───────── */
    /// @dev Exposes the internal initialize function for harnesses
    function harnessInitialize(uint256 tokenId, address lockboxPublicKey) external {
        initialize(tokenId, lockboxPublicKey);
    }

    /// @dev Test function to check token existence (via ownerOf)
    function harnessRequireExists(uint256 tokenId) external view {
        // Just call ownerOf - it will revert if token doesn't exist
        _erc721.ownerOf(tokenId);
    }
}


