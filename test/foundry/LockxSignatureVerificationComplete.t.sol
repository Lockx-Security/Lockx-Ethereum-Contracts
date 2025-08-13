// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";

/**
 * @title LockxSignatureVerificationComplete
 * @notice Complete coverage tests to push SignatureVerification.sol from 67.86% to 90%+
 * Target: Hit all 28 lines to achieve 100% coverage
 */
contract LockxSignatureVerificationComplete is Test {
    Lockx public lockx;
    MockERC20 public token;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public nonOwner = makeAddr("nonOwner");
    
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    uint256 private key3 = 0x3333;
    
    address public keyAddr1;
    address public keyAddr2;
    address public keyAddr3;
    
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
        lockx = new Lockx();
        token = new MockERC20();
        token.initialize("Test Token", "TEST");
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        keyAddr3 = vm.addr(key3);
        
        // Fund users
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        token.mint(user1, 1000e18);
        token.mint(user2, 1000e18);
        
        // Create lockboxes for testing
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("user1"));
        
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 3 ether}(user2, keyAddr2, bytes32("user2"));
    }
    
    /**
     * @notice Test accessing nonce and public key (view functions - lines 167-168, 179-180)
     */
    function test_viewFunctions_coverage() public {
        uint256 tokenId = 0;
        
        // Test getActiveLockboxPublicKeyForToken
        vm.prank(user1);
        address activeKey = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertEq(activeKey, keyAddr1, "Should return correct active key");
        
        // Test getNonce
        vm.prank(user1);
        uint256 nonce = lockx.getNonce(tokenId);
        assertEq(nonce, 1, "Initial nonce should be 1");
        
        // Test NotOwner error (lines 96, 167, 179)
        vm.prank(nonOwner);
        vm.expectRevert(); // NotOwner
        lockx.getActiveLockboxPublicKeyForToken(tokenId);
        
        vm.prank(nonOwner);
        vm.expectRevert(); // NotOwner
        lockx.getNonce(tokenId);
    }
    
    /**
     * @notice Test successful key rotation (lines 145-146)
     */
    function test_keyRotation_success() public {
        uint256 tokenId = 0;
        address newKey = keyAddr3;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Create key rotation signature
        bytes memory data = abi.encode(
            tokenId, newKey, bytes32("rotate"), user1, expiry
        );
        vm.prank(user1);
        uint256 currentNonce = lockx.getNonce(tokenId);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Perform key rotation
        vm.prank(user1);
        lockx.rotateLockboxKey(tokenId, messageHash, signature, newKey, bytes32("rotate"), expiry);
        
        // Verify key was rotated
        vm.prank(user1);
        address activeKey = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertEq(activeKey, newKey, "Key should be rotated");
        
        // Verify nonce incremented (line 142)
        vm.prank(user1);
        uint256 nonce = lockx.getNonce(tokenId);
        assertEq(nonce, 2, "Nonce should increment after operation");
    }
    
    /**
     * @notice Test key rotation to zero address (edge case - line 145 condition)
     */
    function test_keyRotation_zeroAddress() public {
        uint256 tokenId = 0;
        address zeroKey = address(0);
        uint256 expiry = block.timestamp + 1 hours;
        
        // Create key rotation signature with zero address
        bytes memory data = abi.encode(
            tokenId, zeroKey, bytes32("zero"), user1, expiry
        );
        vm.prank(user1);
        uint256 currentNonce = lockx.getNonce(tokenId);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Get key before rotation
        vm.prank(user1);
        address keyBefore = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        
        // Perform key rotation with zero address
        vm.prank(user1);
        lockx.rotateLockboxKey(tokenId, messageHash, signature, zeroKey, bytes32("zero"), expiry);
        
        // Key should NOT change when rotating to zero address (line 145 condition)
        vm.prank(user1);
        address keyAfter = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertEq(keyAfter, keyBefore, "Key should not change when rotating to zero address");
    }
    
    /**
     * @notice Test signature verification errors (lines 133, 138)
     */
    function test_signatureVerification_errors() public {
        uint256 tokenId = 0;
        uint256 amount = 1 ether;
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory data = abi.encode(
            tokenId, amount, user1, bytes32("test"), user1, expiry
        );
        
        // Test InvalidMessageHash error (line 133)
        bytes32 correctHash = _computeMessageHash(tokenId, 1, data, 1);
        bytes32 wrongHash = keccak256("wrong hash");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, correctHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidMessageHash
        lockx.withdrawETH(tokenId, wrongHash, signature, amount, user1, bytes32("test"), expiry);
        
        // Test InvalidSignature error (line 138)
        uint256 wrongKey = 0x9999;
        (v, r, s) = vm.sign(wrongKey, correctHash);
        bytes memory wrongSignature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidSignature
        lockx.withdrawETH(tokenId, correctHash, wrongSignature, amount, user1, bytes32("test"), expiry);
    }
    
    /**
     * @notice Test burnLockbox to hit _purgeAuth function (line 151)
     */
    function test_burnLockbox_purgeAuth() public {
        uint256 tokenId = 1; // Use user2's lockbox to avoid nonce conflicts
        uint256 expiry = block.timestamp + 1 hours;
        
        // Create burn signature
        bytes memory data = abi.encode(
            tokenId, bytes32("burn"), user2, expiry
        );
        vm.prank(user2);
        uint256 currentNonce = lockx.getNonce(tokenId);
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key2, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Burn the lockbox (this should call _purgeAuth internally)
        vm.prank(user2);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("burn"), expiry);
        
        // Verify token no longer exists
        vm.expectRevert(); // Token burned, should revert
        lockx.ownerOf(tokenId);
    }
    
    /**
     * @notice Test different operation types to hit verifySignature paths
     */
    function test_allOperationTypes_coverage() public {
        // Test WITHDRAW_ETH (opType = 1)
        uint256 tokenId = 0; // Use user1's lockbox
        uint256 amount = 1 ether;
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory data = abi.encode(
            tokenId, amount, user1, bytes32("eth"), user1, expiry
        );
        vm.prank(user1);
        uint256 currentNonce = lockx.getNonce(tokenId);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawETH(tokenId, messageHash, signature, amount, user1, bytes32("eth"), expiry);
        
        // Test WITHDRAW_ERC20 (opType = 2)
        vm.startPrank(user1);
        token.approve(address(lockx), 100e18);
        lockx.depositERC20(tokenId, address(token), 100e18, bytes32("deposit"));
        
        data = abi.encode(
            tokenId, address(token), 50e18, user1, bytes32("token"), user1, expiry
        );
        currentNonce = lockx.getNonce(tokenId);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC20(tokenId, messageHash, signature, address(token), 50e18, user1, bytes32("token"), expiry);
        vm.stopPrank();
    }
    
    /**
     * @notice Test constructor and initialization coverage
     */
    function test_constructor_initialization() public {
        // The constructor (lines 72-74) is hit when lockx is deployed in setUp()
        // The initialize function (lines 82-89) is hit when creating lockboxes
        
        // Test that we can't double-initialize by trying to create a lockbox that somehow 
        // triggers the AlreadyInitialized error. This is difficult to trigger directly
        // since the contract prevents it, but let's verify the system works correctly
        
        vm.prank(user1);
        uint256 nonce1 = lockx.getNonce(0);
        assertTrue(nonce1 > 0, "Lockbox should be initialized");
        
        vm.prank(user2);  
        uint256 nonce2 = lockx.getNonce(1);
        assertTrue(nonce2 > 0, "Lockbox should be initialized");
    }
    
    // Helper functions
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 expectedNonce) 
        internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, expectedNonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}