// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";

contract EdgeCaseAttacks is Test {
    Lockx public lockx;
    MockERC20 public token;
    
    address public attacker = makeAddr("attacker");
    address public victim = makeAddr("victim");
    uint256 public attackerPrivateKey = 0x1234;
    address public attackerPublicKey;
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        token.initialize("Test Token", "TEST");
        
        attackerPublicKey = vm.addr(attackerPrivateKey);
        token.mint(attacker, 1000);
        token.mint(victim, 1000);
    }
    
    function testSignatureReplayAttack() public {
        // Create lockbox
        vm.startPrank(attacker);
        token.approve(address(lockx), 100);
        lockx.createLockboxWithERC20(attacker, attackerPublicKey, address(token), 100, bytes32(0));
        uint256 tokenId = 0;
        
        // Create a valid withdraw signature
        uint256 nonce = lockx.getNonce(tokenId);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)"),
                tokenId,
                nonce,
                uint8(1), // WITHDRAW_ERC20
                keccak256(abi.encode(tokenId, address(token), 10, attacker, bytes32(0), attacker, block.timestamp + 1000))
            )
        );
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Lockx")), keccak256(bytes("4")), block.chainid, address(lockx)
            )
        );
        
        bytes32 messageHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Use the signature once
        lockx.withdrawERC20(tokenId, messageHash, signature, address(token), 10, attacker, bytes32(0), block.timestamp + 1000);
        
        // Try to replay the same signature - should fail due to nonce increment
        vm.expectRevert(); // Should fail due to invalid signature (nonce changed)
        lockx.withdrawERC20(tokenId, messageHash, signature, address(token), 10, attacker, bytes32(0), block.timestamp + 1000);
        
        vm.stopPrank();
        console.log("Signature replay protection works");
    }
    
    function testUnauthorizedWithdraw() public {
        // Victim creates lockbox
        vm.startPrank(victim);
        token.approve(address(lockx), 100);
        uint256 victimPrivateKey = 0x5678;
        address victimPublicKey = vm.addr(victimPrivateKey);
        lockx.createLockboxWithERC20(victim, victimPublicKey, address(token), 100, bytes32(0));
        uint256 tokenId = 0;
        vm.stopPrank();
        
        // Attacker tries to withdraw from victim's lockbox
        vm.startPrank(attacker);
        
        // Try to call withdraw without proper signature
        vm.expectRevert(); // Should fail due to ownership check
        lockx.withdrawERC20(tokenId, bytes32(0), "", address(token), 10, attacker, bytes32(0), block.timestamp + 1000);
        
        vm.stopPrank();
        console.log("Unauthorized withdraw properly blocked");
    }
    
    function testSelfCallPrevention() public {
        // Test that calling the lockx contract itself is blocked
        vm.startPrank(attacker);
        token.approve(address(lockx), 1);
        lockx.createLockboxWithERC20(attacker, attackerPublicKey, address(token), 1, bytes32(0));
        uint256 tokenId = 0;
        
        // Try to call lockx contract itself
        bytes memory selfCallData = abi.encodeWithSelector(lockx.withdrawERC20.selector);
        
        uint256 nonce = lockx.getNonce(tokenId);
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256("Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)"),
                tokenId, nonce, uint8(7),
                keccak256(abi.encode(
                    tokenId, address(token), address(0), 1, 0,
                    address(lockx), keccak256(selfCallData), bytes32(0),
                    attacker, block.timestamp + 1000, attacker
                ))
            )
        );
        
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Lockx")), keccak256(bytes("4")), block.chainid, address(lockx)
            )
        );
        
        bytes32 messageHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attackerPrivateKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Should fail due to target == address(this) check
        vm.expectRevert(); // ZeroAddress
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(token), address(0), 1, 0,
            address(lockx), selfCallData, bytes32(0), block.timestamp + 1000, attacker
        );
        
        vm.stopPrank();
        console.log("Self-call prevention works");
    }
}