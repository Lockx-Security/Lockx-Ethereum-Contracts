// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {LockxStateHarness} from '../../contracts/mocks/LockxHarness.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

/// @notice Invariant suite covering interactions across three independent lockboxes
///         owned by different users. Ensures contract-level ETH / ERC20 balances
///         always equal the sum of per-lockbox accounting.
contract LockxMultiUserInvariant is Test {
    LockxStateHarness internal lockx;
    MockERC20 internal tokA;
    MockERC20 internal tokB;

    address internal user1 = address(0x1111);
    address internal user2 = address(0x2222);
    address internal user3 = address(0x3333);

    address internal key1 = address(0xAAAA);
    address internal key2 = address(0xBBBB);
    address internal key3 = address(0xCCCC);

    bytes32 internal refId = bytes32('multiInv');

    function setUp() public {
        lockx = new LockxStateHarness();
        tokA = new MockERC20();
        tokB = new MockERC20();

        // fund users
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);

        // mint ERC20s to users and approve lockx
        tokA.mint(user1, 1e24);
        tokA.mint(user2, 1e24);
        tokA.mint(user3, 1e24);
        tokB.mint(user1, 1e24);
        tokB.mint(user2, 1e24);
        tokB.mint(user3, 1e24);

        vm.startPrank(user1);
        tokA.approve(address(lockx), type(uint256).max);
        tokB.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 10 ether}(user1, key1, refId);
        vm.stopPrank();

        vm.startPrank(user2);
        tokA.approve(address(lockx), type(uint256).max);
        tokB.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 20 ether}(user2, key2, refId);
        vm.stopPrank();

        vm.startPrank(user3);
        tokA.approve(address(lockx), type(uint256).max);
        tokB.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 30 ether}(user3, key3, refId);
        vm.stopPrank();

        // Tell the invariant engine to fuzz calls to this contract (handlers) only
        targetContract(address(this));
    }

    /* ─────────────────────  Handlers  ───────────────────── */

    /// @dev Fuzz handler: users deposit additional ETH into their own lockboxes.
    function depositEth(uint8 which, uint96 rawAmt) external {
        uint256 amt = uint256(rawAmt) % 5 ether;
        if (amt == 0) return;

        if (which % 3 == 0) {
            vm.prank(user1);
            lockx.depositETH{value: amt}(0, refId);
        } else if (which % 3 == 1) {
            vm.prank(user2);
            lockx.depositETH{value: amt}(1, refId);
        } else {
            vm.prank(user3);
            lockx.depositETH{value: amt}(2, refId);
        }
    }

    /// @dev Fuzz handler: users deposit ERC20 A into their lockboxes.
    function depositTokA(uint8 which, uint96 rawAmt) external {
        uint256 amt = uint256(rawAmt) % 1e21; // up to 1,000 tokA
        if (amt == 0) return;
        if (which % 3 == 0) {
            vm.prank(user1);
            lockx.depositERC20(0, address(tokA), amt, refId);
        } else if (which % 3 == 1) {
            vm.prank(user2);
            lockx.depositERC20(1, address(tokA), amt, refId);
        } else {
            vm.prank(user3);
            lockx.depositERC20(2, address(tokA), amt, refId);
        }
    }

    /// @dev Fuzz handler: users deposit ERC20 B into their lockboxes.
    function depositTokB(uint8 which, uint96 rawAmt) external {
        uint256 amt = uint256(rawAmt) % 1e21;
        if (amt == 0) return;
        if (which % 3 == 0) {
            vm.prank(user1);
            lockx.depositERC20(0, address(tokB), amt, refId);
        } else if (which % 3 == 1) {
            vm.prank(user2);
            lockx.depositERC20(1, address(tokB), amt, refId);
        } else {
            vm.prank(user3);
            lockx.depositERC20(2, address(tokB), amt, refId);
        }
    }

    /* ─────────────────────  Invariants  ───────────────────── */

    function invariant_totalEthMatches() public view {
        uint256 total;
        total += lockx.getEthBal(0);
        total += lockx.getEthBal(1);
        total += lockx.getEthBal(2);
        assertEq(address(lockx).balance, total);
    }

    function invariant_tokABalancesMatch() public view {
        uint256 totalA;
        uint256 totalB;
        totalA += lockx.getERC20Bal(0, address(tokA));
        totalA += lockx.getERC20Bal(1, address(tokA));
        totalA += lockx.getERC20Bal(2, address(tokA));

        totalB += lockx.getERC20Bal(0, address(tokB));
        totalB += lockx.getERC20Bal(1, address(tokB));
        totalB += lockx.getERC20Bal(2, address(tokB));

        assertEq(tokA.balanceOf(address(lockx)), totalA);
        assertEq(tokB.balanceOf(address(lockx)), totalB);
    }
} 