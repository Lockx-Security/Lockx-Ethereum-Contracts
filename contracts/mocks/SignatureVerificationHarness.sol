// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '../SignatureVerification.sol';
import '@openzeppelin/contracts/token/ERC721/ERC721.sol';

/**
 * @title SignatureVerificationHarness
 * @dev Test harness to expose internal functions for testing
 */
contract SignatureVerificationHarness is SignatureVerification, ERC721 {
    constructor() SignatureVerification(address(this)) ERC721('Test', 'TEST') {}
    
    // Expose the internal initialize function for testing
    function testInitialize(uint256 tokenId, address lockboxPublicKey) external {
        initialize(tokenId, lockboxPublicKey);
    }
    
    // Mint a test token
    function mint(address to, uint256 tokenId) external {
        _mint(to, tokenId);
    }
}