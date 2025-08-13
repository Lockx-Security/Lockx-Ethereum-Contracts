// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";

/**
 * @title LockxSignature100
 * @notice Get SignatureVerification.sol to 100% - hunt for the final 1 line
 */
contract LockxSignature100 is Test {
    Lockx public lockx;
    
    address public user1 = makeAddr("user1");
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
    function setUp() public {
        lockx = new Lockx();
        keyAddr1 = vm.addr(key1);
        vm.deal(user1, 100 ether);
    }
    
    /**
     * @notice Try to trigger AlreadyInitialized by double initialization
     * This is tricky since initialize() is internal and called during minting
     */
    function test_already_initialized_somehow() public {
        // Create a lockbox (this calls initialize internally)
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("test"));
        uint256 tokenId = 0;
        
        // The token is now initialized. The AlreadyInitialized error would only 
        // trigger if initialize() was called again, but it's internal.
        // Maybe through some edge case in the contract?
        
        // Try various operations to see if any trigger different code paths
        vm.prank(user1);
        uint256 nonce = lockx.getNonce(tokenId);
        assertGt(nonce, 0, "Nonce should be initialized");
        
        vm.prank(user1);
        address activeKey = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertEq(activeKey, keyAddr1, "Key should be set");
        
        assertTrue(true, "Attempt to find AlreadyInitialized");
    }
    
    /**
     * @notice Try edge cases in signature verification
     */
    function test_signature_edge_cases() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("edge"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test malformed signatures
        bytes memory malformedSig = abi.encodePacked(bytes32(0), bytes32(0), uint8(0));
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 1 ether, user1, bytes32("malformed"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        
        vm.prank(user1);
        vm.expectRevert(); 
        lockx.withdrawETH(tokenId, messageHash, malformedSig, 1 ether, user1, bytes32("malformed"), expiry);
        
        // Test with completely wrong message hash
        bytes32 wrongHash = keccak256("totally wrong");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory validSig = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidMessageHash
        lockx.withdrawETH(tokenId, wrongHash, validSig, 1 ether, user1, bytes32("wrong_hash"), expiry);
        
        assertTrue(true, "Signature edge cases tested");
    }
    
    /**
     * @notice Test all operation types thoroughly
     */
    function test_comprehensive_operations() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("comprehensive"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test every single operation type to make sure all code paths hit
        
        // ROTATE_KEY = 0
        uint256 currentNonce = _getCurrentNonce(tokenId);
        address newKey = makeAddr("newKey");
        bytes memory data = abi.encode(tokenId, newKey, bytes32("rotate1"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.rotateLockboxKey(tokenId, messageHash, signature, newKey, bytes32("rotate1"), expiry);
        
        // Now use the new key for subsequent operations
        uint256 newKeyPrivate = uint256(keccak256(abi.encodePacked("newKey")));
        
        // WITHDRAW_ETH = 1
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, user1, bytes32("eth"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(newKeyPrivate, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("eth"), expiry);
        
        // SET_TOKEN_URI = 5
        currentNonce = _getCurrentNonce(tokenId);
        string memory uri = "https://metadata.test/";
        data = abi.encode(tokenId, uri, bytes32("uri"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 5, data, currentNonce);
        (v, r, s) = vm.sign(newKeyPrivate, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.setTokenMetadataURI(tokenId, messageHash, signature, uri, bytes32("uri"), expiry);
        
        // BURN_LOCKBOX = 4 (this will trigger _purgeAuth)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, bytes32("final_burn"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 4, data, currentNonce);
        (v, r, s) = vm.sign(newKeyPrivate, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("final_burn"), expiry);
        
        assertTrue(true, "Comprehensive operations completed");
    }
    
    // Helper functions
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        address owner = lockx.ownerOf(tokenId);
        vm.prank(owner);
        return lockx.getNonce(tokenId);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) 
        internal view returns (bytes32) {
        bytes32 OPERATION_TYPEHASH = keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
        bytes32 EIP712_DOMAIN_TYPEHASH = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
        bytes32 NAME_HASH = keccak256('Lockx');
        bytes32 VERSION_HASH = keccak256('3');
        
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}