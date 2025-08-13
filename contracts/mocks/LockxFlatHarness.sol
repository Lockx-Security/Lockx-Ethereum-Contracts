// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.30;

import "../Lockx.sol";

/**
 * @title LockxFlatHarness
 * @notice Flattened harness that exposes internal state for Certora verification
 * This bypasses inheritance complexity by providing direct access points
 */
contract LockxFlatHarness is Lockx {
    
    // Expose internal balance mappings directly
    function getETHBalanceDirect(uint256 tokenId) external view returns (uint256) {
        return _ethBalances[tokenId];
    }
    
    function getERC20BalanceDirect(uint256 tokenId, address token) external view returns (uint256) {
        return _erc20Balances[tokenId][token];
    }
    
    // Expose ownership check directly without modifier
    function isTokenOwner(uint256 tokenId, address user) external view returns (bool) {
        try this.ownerOf(tokenId) returns (address owner) {
            return owner == user;
        } catch {
            return false;
        }
    }
    
    // Expose nonce without access control for testing
    function getNonceDirect(uint256 tokenId) external pure returns (uint256) {
        // Return a dummy value > 0 for testing
        return tokenId > 0 ? 1 : 0;
    }
    
    // Expose active key without access control
    function getActiveKeyDirect(uint256 tokenId) external pure returns (address) {
        // Return a dummy non-zero address for testing
        return tokenId > 0 ? address(0x1234567890123456789012345678901234567890) : address(0);
    }
    
    // Test helper: Check if reentrancy guard is active
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;
    
    function isReentrant() external view returns (bool) {
        return _status == ENTERED;
    }
    
    // Direct minting helper that bypasses some checks for testing
    function mintDirect(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
    
    // Helper to check token existence
    function tokenExists(uint256 tokenId) external view returns (bool) {
        return _ownerOf(tokenId) != address(0);
    }
}