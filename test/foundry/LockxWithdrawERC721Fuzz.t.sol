// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

contract LockxWithdrawERC721Fuzz is Test {
    Lockx internal lockx;
    MockERC721 internal nft;

    address internal user = address(0xF00D);
    uint256 internal lockboxPrivKey = uint256(0xC0FFEE);
    address internal lockboxKey;

    bytes32 internal referenceId = bytes32('w721fuzz');

    bytes32 private constant OPERATION_TYPEHASH =
        keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    function setUp() public {
        lockx = new Lockx();
        nft = new MockERC721();
        lockboxKey = vm.addr(lockboxPrivKey);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes('Lockx')),
                    keccak256(bytes('3')),
                    block.chainid,
                    address(lockx)
                )
            );
    }

    function _sign(bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(lockboxPrivKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function testFuzz_withdrawERC721(uint256 newNftId) public {
        vm.assume(newNftId > 1 && newNftId < 1_000_000);

        // Mint NFT to user and create lockbox with it
        nft.mint(user, newNftId);

        vm.startPrank(user);
        nft.approve(address(lockx), newNftId);
        lockx.createLockboxWithERC721(user, lockboxKey, address(nft), newNftId, referenceId);
        vm.stopPrank();

        uint256 tokenId = 0; // first minted lockbox token
        uint256 nonce = 1;
        uint256 signatureExpiry = block.timestamp + 1 hours;

        // Build data hash
        bytes32 dataHash = keccak256(
            abi.encode(tokenId, address(nft), newNftId, user, referenceId, user, signatureExpiry)
        );
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(3), dataHash)
        );
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
        bytes memory sig = _sign(digest);

        // Withdraw NFT back to user
        vm.prank(user);
        lockx.withdrawERC721(
            tokenId,
            digest,
            sig,
            address(nft),
            newNftId,
            user,
            referenceId,
            signatureExpiry
        );

        // Assert ownership returned
        assertEq(nft.ownerOf(newNftId), user);
    }
}
