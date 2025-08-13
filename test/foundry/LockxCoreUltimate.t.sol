// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxCoreUltimate
 * @notice Target the remaining 57 lines in Lockx.sol to get from 49.11% to 100%
 * Focus on: Constructor, ERC721/ERC5192 functions, metadata, key rotation, burn operations
 */
contract LockxCoreUltimate is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public user3 = makeAddr("user3");
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    address public keyAddr1;
    address public keyAddr2;
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('3'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    function setUp() public {
        lockx = new Lockx(); // Test constructor
        token = new MockERC20();
        nft = new MockERC721();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);
        
        token.mint(user1, 10000e18);
        token.mint(user2, 5000e18);
        
        for (uint256 i = 1; i <= 20; i++) {
            nft.mint(user1, i);
        }
    }
    
    /**
     * @notice Test constructor and basic contract setup
     */
    function test_constructor_and_setup() public {
        // Constructor should set initial state
        assertEq(lockx.name(), "Lockx.io", "Name should be Lockx.io");
        assertEq(lockx.symbol(), "Lockbox", "Symbol should be Lockbox");
        
        // Test nextTokenId starts at 0
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("first"));
        assertEq(lockx.ownerOf(0), user1, "First token should be ID 0");
        
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 1 ether}(user2, keyAddr2, bytes32("second"));
        assertEq(lockx.ownerOf(1), user2, "Second token should be ID 1");
        
        assertTrue(true, "Constructor and setup test passed");
    }
    
    /**
     * @notice Test all ERC721 standard functions
     */
    function test_erc721_functions() public {
        // Create lockboxes first
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("test"));
        
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 1 ether}(user2, keyAddr2, bytes32("test2"));
        
        uint256 tokenId1 = 0;
        uint256 tokenId2 = 1;
        
        // Test balanceOf
        assertEq(lockx.balanceOf(user1), 1, "User1 should own 1 token");
        assertEq(lockx.balanceOf(user2), 1, "User2 should own 1 token");
        assertEq(lockx.balanceOf(user3), 0, "User3 should own 0 tokens");
        
        // Test ownerOf
        assertEq(lockx.ownerOf(tokenId1), user1, "Token 0 should belong to user1");
        assertEq(lockx.ownerOf(tokenId2), user2, "Token 1 should belong to user2");
        
        // Test tokenURI - should revert with NoURI if no URI is set
        vm.expectRevert(); // NoURI
        lockx.tokenURI(tokenId1);
        
        // Test nonexistent token
        vm.expectRevert();
        lockx.ownerOf(999);
        
        vm.expectRevert();
        lockx.tokenURI(999);
        
        assertTrue(true, "ERC721 functions test passed");
    }
    
    /**
     * @notice Test ERC5192 soulbound functionality
     */
    function test_erc5192_soulbound() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("soulbound"));
        uint256 tokenId = 0;
        
        // Test locked function - should always return true (soulbound)
        assertTrue(lockx.locked(tokenId), "Token should be locked (soulbound)");
        
        // Test transfer functions should revert
        vm.prank(user1);
        vm.expectRevert(); // SoulboundToken
        lockx.transferFrom(user1, user2, tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // SoulboundToken
        lockx.safeTransferFrom(user1, user2, tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // SoulboundToken
        lockx.safeTransferFrom(user1, user2, tokenId, "");
        
        // Test approve works (but transfers still disabled)
        vm.prank(user1);
        lockx.approve(user2, tokenId);
        assertEq(lockx.getApproved(tokenId), user2, "Approval should be set");
        
        // Test setApprovalForAll works
        vm.prank(user1);
        lockx.setApprovalForAll(user2, true);
        assertTrue(lockx.isApprovedForAll(user1, user2), "ApprovalForAll should be set");
        
        assertTrue(true, "ERC5192 soulbound test passed");
    }
    
    /**
     * @notice Test interface support
     */
    function test_supportsInterface() public {
        // Test ERC165 interface
        assertTrue(lockx.supportsInterface(0x01ffc9a7), "Should support ERC165");
        
        // Test ERC721 interface
        assertTrue(lockx.supportsInterface(0x80ac58cd), "Should support ERC721");
        
        // Test ERC721Metadata interface
        assertTrue(lockx.supportsInterface(0x5b5e139f), "Should support ERC721Metadata");
        
        // Test ERC5192 interface  
        assertTrue(lockx.supportsInterface(type(IERC5192).interfaceId), "Should support ERC5192");
        
        // Test unsupported interface
        assertFalse(lockx.supportsInterface(0x12345678), "Should not support random interface");
        
        assertTrue(true, "Interface support test passed");
    }
    
    /**
     * @notice Test lockbox creation functions
     */
    function test_lockbox_creation() public {
        // Test createLockboxWithETH
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 3 ether}(user1, keyAddr1, bytes32("with_eth"));
        assertEq(lockx.ownerOf(0), user1, "Should create lockbox with ETH");
        
        // Test createLockboxWithERC20
        vm.startPrank(user2);
        token.approve(address(lockx), 1000e18);
        lockx.createLockboxWithERC20(user2, keyAddr2, address(token), 1000e18, bytes32("erc20"));
        assertEq(lockx.ownerOf(1), user2, "Should create lockbox with ERC20");
        vm.stopPrank();
        
        // Test createLockboxWithERC721 - first ensure user3 owns the NFT
        // Note: NFT 1 is owned by user1, let's use a different approach
        vm.startPrank(user1); // user1 owns NFT 1
        nft.approve(address(lockx), 1);
        lockx.createLockboxWithERC721(user1, keyAddr2, address(nft), 1, bytes32("nft"));
        assertEq(lockx.ownerOf(2), user1, "Should create lockbox with NFT");
        vm.stopPrank();
        
        // Test zero key error
        vm.prank(user1);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithETH{value: 1 ether}(user1, address(0), bytes32("zero_key_eth"));
        
        assertTrue(true, "Lockbox creation test passed");
    }
    
    /**
     * @notice Test key rotation functionality
     */
    function test_key_rotation() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("rotation"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test successful key rotation
        address newKey = makeAddr("newKey");
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, newKey, bytes32("rotate"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.rotateLockboxKey(tokenId, messageHash, signature, newKey, bytes32("rotate"), expiry);
        
        // Verify key was rotated by trying to use old key (should fail)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, user1, bytes32("test_old_key"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash); // Old key
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // Should fail with old key
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("test_old_key"), expiry);
        
        assertTrue(true, "Key rotation test passed");
    }
    
    /**
     * @notice Test metadata URI functionality
     */
    function test_metadata_uri() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("metadata"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test default tokenURI - should revert with NoURI initially
        vm.expectRevert(); // NoURI
        lockx.tokenURI(tokenId);
        
        // Test setting custom metadata URI
        string memory customURI = "https://custom.metadata.com/";
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, customURI, bytes32("metadata"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.setTokenMetadataURI(tokenId, messageHash, signature, customURI, bytes32("metadata"), expiry);
        
        // Verify URI was set
        string memory newURI = lockx.tokenURI(tokenId);
        assertEq(newURI, customURI, "URI should be updated");
        
        assertTrue(true, "Metadata URI test passed");
    }
    
    /**
     * @notice Test burn functionality
     */
    function test_burn_functionality() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("burn_test"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Verify token exists before burn
        assertEq(lockx.ownerOf(tokenId), user1, "Token should exist before burn");
        
        // Test burn lockbox
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, bytes32("burn"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("burn"), expiry);
        
        // Verify token no longer exists
        vm.expectRevert();
        lockx.ownerOf(tokenId);
        
        assertTrue(true, "Burn functionality test passed");
    }
    
    /**
     * @notice Test receive ETH functionality
     */
    function test_receive_eth() public {
        uint256 initialBalance = address(lockx).balance;
        
        // Send ETH directly to contract
        (bool success, ) = address(lockx).call{value: 1 ether}("");
        assertTrue(success, "Should be able to send ETH to contract");
        
        assertEq(address(lockx).balance, initialBalance + 1 ether, "Contract should receive ETH");
        
        assertTrue(true, "Receive ETH test passed");
    }
    
    /**
     * @notice Test edge cases and error conditions
     */
    function test_edge_cases() public {
        // Test with very small amounts
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 wei}(user1, keyAddr1, bytes32("tiny"));
        
        // Test batch creation - user1 owns NFT 2
        vm.startPrank(user1);
        token.approve(address(lockx), 500e18);
        nft.approve(address(lockx), 2);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 500e18;
        
        address[] memory nfts = new address[](1);
        nfts[0] = address(nft);
        uint256[] memory nftIds = new uint256[](1);
        nftIds[0] = 2;
        
        lockx.createLockboxWithBatch{value: 1 ether}(
            user1, keyAddr1, 1 ether, tokens, amounts, nfts, nftIds, bytes32("batch")
        );
        vm.stopPrank();
        
        // Test multiple lockboxes for same user
        vm.startPrank(user3);
        lockx.createLockboxWithETH{value: 0.5 ether}(user3, keyAddr1, bytes32("multi1"));
        lockx.createLockboxWithETH{value: 0.3 ether}(user3, keyAddr2, bytes32("multi2"));
        // Note: user3 should have 3 tokens total now (including the NFT one created earlier)
        assertGe(lockx.balanceOf(user3), 2, "User3 should have at least 2 tokens");
        vm.stopPrank();
        
        assertTrue(true, "Edge cases test passed");
    }
    
    // Helper functions
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        address owner = lockx.ownerOf(tokenId);
        vm.prank(owner);
        return lockx.getNonce(tokenId);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) 
        internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}