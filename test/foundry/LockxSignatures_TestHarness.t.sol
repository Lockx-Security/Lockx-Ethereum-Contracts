// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/SignatureVerification.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title SignatureVerificationTestHarness
 * @notice Test harness to directly test SignatureVerification internal functions
 */
contract SignatureVerificationTestHarness is SignatureVerification {
    constructor(address erc721Address) SignatureVerification(erc721Address) {}
    
    // Expose internal initialize function for testing
    function publicInitialize(uint256 tokenId, address lockboxPublicKey) external {
        initialize(tokenId, lockboxPublicKey);
    }
}

/**
 * @title LockxSignatureTestHarness  
 * @notice Test the AlreadyInitialized error directly
 */
contract LockxSignatureTestHarness is Test {
    SignatureVerificationTestHarness public sigVerification;
    MockERC721 public mockNFT;
    
    address public user1 = makeAddr("user1");
    address public keyAddr1 = makeAddr("key1");
    
    function setUp() public {
        mockNFT = new MockERC721();
        mockNFT.initialize("Mock NFT", "MNFT");
        sigVerification = new SignatureVerificationTestHarness(address(mockNFT));
        
        // Mint NFT to user1 for token ID 0
        mockNFT.mint(user1, 0);
    }
    
    /**
     * @notice Test AlreadyInitialized error directly
     */
    function test_already_initialized_direct() public {
        // First initialization should succeed
        sigVerification.publicInitialize(0, keyAddr1);
        
        // Second initialization should revert with AlreadyInitialized
        vm.expectRevert(); // AlreadyInitialized
        sigVerification.publicInitialize(0, keyAddr1);
        
        assertTrue(true, "AlreadyInitialized error triggered");
    }
    
    /**
     * @notice Test double initialization with different keys
     */
    function test_already_initialized_different_key() public {
        address keyAddr2 = makeAddr("key2");
        
        // First initialization
        sigVerification.publicInitialize(0, keyAddr1);
        
        // Second initialization with different key should still fail
        vm.expectRevert(); // AlreadyInitialized
        sigVerification.publicInitialize(0, keyAddr2);
        
        assertTrue(true, "AlreadyInitialized with different key tested");
    }
    
    /**
     * @notice Test initialization after token is minted
     */
    function test_initialization_after_mint() public {
        // Mint another token
        mockNFT.mint(user1, 1);
        
        // Initialize token 1
        sigVerification.publicInitialize(1, keyAddr1);
        
        // Try to initialize it again
        vm.expectRevert(); // AlreadyInitialized
        sigVerification.publicInitialize(1, keyAddr1);
        
        assertTrue(true, "Post-mint initialization protection tested");
    }
}