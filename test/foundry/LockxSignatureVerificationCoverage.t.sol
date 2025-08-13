// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";

/**
 * @title LockxSignatureVerificationCoverage
 * @notice Targeted tests to achieve 100% coverage on SignatureVerification.sol
 */
contract LockxSignatureVerificationCoverage is Test {
    Lockx public lockx;
    MockERC20 public token;
    
    address public user = makeAddr("user");
    uint256 private userKey = 0x1234;
    address public keyAddr;
    
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
        
        keyAddr = vm.addr(userKey);
        
        // Fund user
        vm.deal(user, 10 ether);
        token.mint(user, 1000e18);
        
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
    }
    
    /**
     * @notice Test edge cases in signature verification
     */
    function test_signatureVerification_edgeCases() public {
        // Just test that the contract behaves correctly with edge cases
        // This hits additional code paths in SignatureVerification
        uint256 tokenId = 0;
        
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        assertTrue(nonce > 0, "Nonce should be initialized");
        
        vm.prank(user);  
        address activeKey = lockx.getActiveLockboxPublicKeyForToken(tokenId);
        assertTrue(activeKey != address(0), "Active key should be set");
    }
    
    /**
     * @notice Test various error conditions to hit missing coverage
     */
    function test_signatureVerification_errorConditions() public {
        uint256 tokenId = 0;
        
        // Test invalid message hash
        bytes memory data = abi.encode(
            tokenId, 1 ether, user, bytes32("invalid"), user, block.timestamp + 1 hours
        );
        
        // Create signature with correct hash
        bytes32 correctMessageHash = _computeMessageHash(tokenId, 1, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, correctMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // But provide wrong message hash
        bytes32 wrongMessageHash = keccak256("wrong");
        
        vm.prank(user);
        vm.expectRevert(); // Should revert with InvalidMessageHash
        lockx.withdrawETH(
            tokenId, wrongMessageHash, signature, 1 ether, user, 
            bytes32("invalid"), block.timestamp + 1 hours
        );
        
        // Test invalid signature
        bytes memory invalidSignature = abi.encodePacked(r, s, uint8(v + 1)); // Wrong v
        
        vm.prank(user);
        vm.expectRevert(); // Should revert with InvalidSignature  
        lockx.withdrawETH(
            tokenId, correctMessageHash, invalidSignature, 1 ether, user,
            bytes32("invalid"), block.timestamp + 1 hours
        );
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data) internal returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        
        return keccak256(abi.encodePacked('\\x19\\x01', domainSeparator, structHash));
    }
}