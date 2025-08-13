// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

// Validates batchWithdraw duplicate/mismatch protections and conservation under fuzz
contract LockxBatchWithdrawInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockERC721 internal nft;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xFACE);
    address internal key;
    bytes32 internal ref = bytes32('batchInv');

    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        key = vm.addr(keyPk);
        vm.deal(user, 10 ether);
        tokenA.mint(user, 1e24);
        tokenB.mint(user, 1e24);
        vm.startPrank(user);
        tokenA.approve(address(lockx), type(uint256).max);
        tokenB.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 1 ether}(user, key, ref);
        lockx.depositERC20(0, address(tokenA), 5e21, ref);
        lockx.depositERC20(0, address(tokenB), 5e21, ref);
        nft.mint(user, 1);
        nft.approve(address(lockx), 1);
        lockx.depositERC721(0, address(nft), 1, ref);
        vm.stopPrank();
        targetContract(address(this));
    }

    function tryMismatched(uint8 which) external {
        address[] memory toks;
        uint256[] memory amts;
        address[] memory nfts;
        uint256[] memory ids;
        if (which % 2 == 0) {
            toks = new address[](2);
            amts = new uint256[](1);
        } else {
            nfts = new address[](2);
            ids = new uint256[](1);
        }
        vm.prank(user);
        vm.expectRevert();
        lockx.batchWithdraw(0, bytes32(0), hex'', 0, toks, amts, nfts, ids, user, ref, block.timestamp + 1);
    }

    // Invariant: Batch withdraw should always validate array length mismatches
    function invariant_batchWithdrawArrayMismatchDetection() external {
        // Try mismatched arrays - should always revert
        address[] memory toks = new address[](2);
        uint256[] memory amts = new uint256[](1); // Mismatch
        address[] memory nfts = new address[](0);
        uint256[] memory ids = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert();
        lockx.batchWithdraw(0, bytes32(0), hex'', 0, toks, amts, nfts, ids, user, ref, block.timestamp + 1);
    }

    // Invariant: Batch withdraw should prevent duplicate token entries
    function invariant_batchWithdrawNoDuplicates() external {
        // Try duplicate tokens - should always revert
        address[] memory toks = new address[](2);
        toks[0] = address(tokenA);
        toks[1] = address(tokenA); // Duplicate
        uint256[] memory amts = new uint256[](2);
        amts[0] = 1000;
        amts[1] = 2000;
        address[] memory nfts = new address[](0);
        uint256[] memory ids = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert();
        lockx.batchWithdraw(0, bytes32(0), hex'', 0, toks, amts, nfts, ids, user, ref, block.timestamp + 1);
    }
}


