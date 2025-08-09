// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {SignatureVerification} from '../../contracts/SignatureVerification.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockSwapRouter} from '../../contracts/mocks/MockSwapRouter.sol';

contract LockxSignatureBinding is Test {
    Lockx internal lockx;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockSwapRouter internal router;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xF00D);
    address internal key;
    bytes32 internal ref = bytes32('bind');

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
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        router = new MockSwapRouter();
        key = vm.addr(keyPk);
        vm.deal(user, 10 ether);
        tokenB.mint(address(router), 1e26);
        tokenA.mint(user, 1e24);
        vm.prank(user);
        tokenA.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        lockx.createLockboxWithERC20(user, key, address(tokenA), 5e21, ref);
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
    function _sign(bytes32 digest) internal view returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_cannotRedirectRecipient() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 1e21;
        uint256 minOut = (amountIn * 80) / 100;
        address recipientSigned = address(0xAA);
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            recipientSigned
        );
        bytes memory authData = abi.encode(
            tokenId,
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            keccak256(data),
            ref,
            user,
            block.timestamp + 3600,
            recipientSigned
        );
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        // Attempt to change recipient in call should revert InvalidMessageHash
        address recipientCall = address(0xBB);
        vm.prank(user);
        vm.expectRevert(SignatureVerification.InvalidMessageHash.selector);
        lockx.swapInLockbox(
            tokenId,
            digest,
            sig,
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            recipientCall
        );
    }
}


