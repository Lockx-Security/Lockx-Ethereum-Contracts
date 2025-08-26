// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {SignatureVerification} from '../../contracts/SignatureVerification.sol';

contract LockxKeyRotationInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal token;

    address internal user = address(0xA11CE);
    uint256 internal oldPk = uint256(0xAA);
    address internal oldKey;
    uint256 internal newPk = uint256(0xBB);
    address internal newKey;
    bytes32 internal ref = bytes32('rotate');

    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('4'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );

    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        token.initialize("Test Token", "TEST");
        oldKey = vm.addr(oldPk);
        newKey = vm.addr(newPk);
        vm.deal(user, 10 ether);
        token.mint(user, 1_000_000 ether);
        vm.prank(user);
        token.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        lockx.createLockboxWithERC20(user, oldKey, address(token), 100_000 ether, ref);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                block.chainid,
                address(lockx)
            )
        );
    }
    function _hashTyped(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
    }
    function _sign(uint256 pk, bytes32 digest) internal view returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_rotateKey_then_oldKeyInvalid_newKeyValid() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);

        // 1) Rotate to newKey
        bytes memory data = abi.encode(tokenId, newKey, ref, user, block.timestamp + 3600);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(0), keccak256(data))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(oldPk, digest);
        vm.prank(user);
        lockx.rotateLockboxKey(tokenId, digest, sig, newKey, ref, block.timestamp + 3600);

        // 2) Try withdraw signed by old key → should revert InvalidSignature
        vm.prank(user);
        uint256 nonce2 = lockx.getNonce(tokenId);
        bytes memory wd = abi.encode(tokenId, address(token), uint256(50_000 ether), user, ref, user, block.timestamp + 3600);
        bytes32 sh2 = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce2, uint8(2), keccak256(wd)));
        bytes32 dg2 = _hashTyped(sh2);
        bytes memory sigOld = _sign(oldPk, dg2);
        vm.prank(user);
        vm.expectRevert(SignatureVerification.InvalidSignature.selector);
        lockx.withdrawERC20(tokenId, dg2, sigOld, address(token), 50_000 ether, user, ref, block.timestamp + 3600);

        // 3) Withdraw signed by new key → should succeed
        bytes memory sigNew = _sign(newPk, dg2);
        vm.prank(user);
        lockx.withdrawERC20(tokenId, dg2, sigNew, address(token), 50_000 ether, user, ref, block.timestamp + 3600);
    }
}


