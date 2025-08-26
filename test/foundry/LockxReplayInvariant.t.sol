// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

// Asserts that a messageHash/signature cannot be replayed because nonce increments
contract LockxReplayInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal tokenA;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xD00D);
    address internal lockboxKey;
    bytes32 internal ref = bytes32('replay');

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
        tokenA = new MockERC20();
        lockboxKey = vm.addr(keyPk);
        vm.deal(user, 100 ether);
        tokenA.mint(user, 1_000_000 ether);
        vm.prank(user);
        tokenA.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        lockx.createLockboxWithERC20(user, lockboxKey, address(tokenA), 1_000_000 ether, ref);
    }

    function _domainSeparator() internal view returns (bytes32) {
        uint256 chainId; assembly { chainId := chainid() }
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, chainId, address(lockx))
        );
    }
    function _hashTyped(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
    }
    function _sign(bytes32 digest) internal view returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_replay_prevented_on_nonce_increment() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amount = 5e20;

        bytes memory data = abi.encode(
            tokenId,
            address(tokenA),
            amount,
            user,
            ref,
            user,
            block.timestamp + 3600
        );

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(2), keccak256(data))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        // First withdrawal should succeed
        vm.prank(user);
        lockx.withdrawERC20(
            tokenId,
            digest,
            sig,
            address(tokenA),
            amount,
            user,
            ref,
            block.timestamp + 3600
        );

        // Replay with the same digest/sig must revert due to nonce increment
        vm.prank(user);
        vm.expectRevert();
        lockx.withdrawERC20(
            tokenId,
            digest,
            sig,
            address(tokenA),
            amount,
            user,
            ref,
            block.timestamp + 3600
        );
    }
}


