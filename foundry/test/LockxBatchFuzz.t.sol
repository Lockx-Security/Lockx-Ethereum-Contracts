// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

/// @notice Fuzz tests for the `createLockboxWithBatch` flow exercising combinations of ETH, ERC20, and ERC721.
contract LockxBatchFuzz is Test {
    Lockx internal lockx;
    MockERC20 internal tknA;
    MockERC20 internal tknB;
    MockERC721 internal nftA;
    address internal alice = address(0xA11CE);
    address internal key = address(0xBEEF);

    function setUp() public {
        lockx = new Lockx();
        tknA = new MockERC20();
        tknB = new MockERC20();
        nftA = new MockERC721();

        // fund Alice with ETH and tokens
        vm.deal(alice, 100 ether);
        tknA.mint(alice, 1e24);
        tknB.mint(alice, 1e24);

        vm.startPrank(alice);
        tknA.approve(address(lockx), type(uint256).max);
        tknB.approve(address(lockx), type(uint256).max);
        vm.stopPrank();
    }

    /// Fuzz a batch deposit of up to 2 ERC20 tokens plus optional ETH and an NFT.
    /// - `amountEth` limited to ≤ 10 ether to avoid overflow.
    /// - `amountA` & `amountB` limited to small range to keep gas reasonable.
    /// - `mintNft` flag decides whether to include an NFT in the batch.
    function testFuzz_batchDeposit(
        uint96 amountEth,
        uint128 amountA,
        uint128 amountB,
        bool mintNft
    ) public {
        amountEth = uint96(bound(amountEth, 0, 10 ether));
        amountA = uint128(bound(amountA, 1e9, 1e21));
        amountB = uint128(bound(amountB, 1e9, 1e21));

        address[] memory tokens = new address[](2);
        uint256[] memory amts = new uint256[](2);
        tokens[0] = address(tknA);
        tokens[1] = address(tknB);
        amts[0] = amountA;
        amts[1] = amountB;

        address[] memory nfts;
        uint256[] memory ids;

        if (mintNft) {
            nftA.mint(alice, 77);
            vm.prank(alice);
            nftA.approve(address(lockx), 77);
            nfts = new address[](1);
            ids = new uint256[](1);
            nfts[0] = address(nftA);
            ids[0] = 77;
        } else {
            nfts = new address[](0);
            ids = new uint256[](0);
        }

        bytes32 ref = bytes32('batch');

        vm.prank(alice);
        lockx.createLockboxWithBatch{value: amountEth}(
            alice,
            key,
            amountEth,
            tokens,
            amts,
            nfts,
            ids,
            ref
        );

        // After deposit balances and ownership should be correct
        assertEq(address(lockx).balance, amountEth);
        assertEq(tknA.balanceOf(address(lockx)), amountA);
        assertEq(tknB.balanceOf(address(lockx)), amountB);
        if (mintNft) {
            assertEq(nftA.ownerOf(77), address(lockx));
        }
    }
}
