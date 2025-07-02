// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

contract LockxERC721Fuzz is Test {
    Lockx internal lockx;
    MockERC721 internal nft;

    address internal user = address(0xCAFE);
    address internal lockboxKey = address(0xC0DE);
    bytes32 internal referenceId = bytes32('erc721fuzz');

    function setUp() public {
        lockx = new Lockx();
        nft = new MockERC721();
    }

    function testFuzz_erc721Deposit(uint256 tokenId) public {
        vm.assume(tokenId > 1 && tokenId < 1_000_000);

        // mint NFT to user
        nft.mint(user, tokenId);

        vm.startPrank(user);
        nft.approve(address(lockx), tokenId);
        lockx.createLockboxWithERC721(user, lockboxKey, address(nft), tokenId, referenceId);
        vm.stopPrank();

        assertEq(nft.ownerOf(tokenId), address(lockx));
    }
}
