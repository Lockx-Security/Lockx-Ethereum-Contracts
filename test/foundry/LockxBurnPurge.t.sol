// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {LockxStateHarness} from '../../contracts/mocks/LockxHarness.sol';

contract LockxBurnPurge is Test {
    LockxStateHarness internal lockx;
    address internal user = address(0xB0B);
    uint256 internal keyPk = uint256(0xC0FFEE);
    address internal lockboxKey;
    bytes32 internal ref = bytes32('burn');

    // EIP-712 helpers
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('3'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );

    function setUp() public {
        lockx = new LockxStateHarness();
        lockboxKey = vm.addr(keyPk);
        vm.deal(user, 10 ether);

        vm.prank(user);
        lockx.createLockboxWithETH{value: 2 ether}(user, lockboxKey, ref);
    }

    function _domainSeparator() internal view returns (bytes32) {
        uint256 chainId;
        assembly { chainId := chainid() }
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                chainId,
                address(lockx)
            )
        );
    }

    function _hashTyped(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
    }

    function _sign(bytes32 digest) internal returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_burn_purges_storage() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 expiry = block.timestamp + 3600;

        // Build burn data: abi.encode(tokenId, referenceId, msg.sender, signatureExpiry)
        bytes memory data = abi.encode(tokenId, ref, user, expiry);

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(4), keccak256(data))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        // Burn
        vm.prank(user);
        lockx.burnLockbox(tokenId, digest, sig, ref, expiry);

        // ownerOf should revert
        vm.expectRevert();
        lockx.ownerOf(tokenId);

        // harness storage checks
        assertEq(lockx.getEthBal(tokenId), 0, 'eth not purged');
        // ERC20/NFT arrays should be empty
        assertEq(lockx.getErc20ArrayLength(tokenId), 0, 'erc20 array not purged');
        assertEq(lockx.getNftKeysLength(tokenId), 0, 'nft keys not purged');
    }
}


