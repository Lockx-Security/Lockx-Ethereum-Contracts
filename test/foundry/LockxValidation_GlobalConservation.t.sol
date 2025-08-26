// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {LockxStateHarness} from '../../contracts/mocks/LockxHarness.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

// Sums per-lockbox accounting across many tokens and compares to on-chain balances
contract LockxGlobalConservation is Test {
    LockxStateHarness internal lockx;
    MockERC20 internal a;
    MockERC20 internal b;
    MockERC20 internal c;

    address internal u1 = address(0x1111);
    address internal u2 = address(0x2222);
    address internal k1 = address(0xAAAA);
    address internal k2 = address(0xBBBB);
    bytes32 internal ref = bytes32('global');

    function setUp() public {
        lockx = new LockxStateHarness();
        a = new MockERC20();
        b = new MockERC20();
        c = new MockERC20();
        vm.deal(u1, 10 ether);
        vm.deal(u2, 10 ether);
        a.mint(u1, 1e24); a.mint(u2, 1e24);
        b.mint(u1, 1e24); b.mint(u2, 1e24);
        c.mint(u1, 1e24); c.mint(u2, 1e24);
        vm.startPrank(u1);
        a.approve(address(lockx), type(uint256).max);
        b.approve(address(lockx), type(uint256).max);
        c.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 3 ether}(u1, k1, ref);
        vm.stopPrank();
        vm.startPrank(u2);
        a.approve(address(lockx), type(uint256).max);
        b.approve(address(lockx), type(uint256).max);
        c.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 4 ether}(u2, k2, ref);
        vm.stopPrank();
        targetContract(address(this));
    }

    function deposit(uint8 which, uint8 tokenIdx, uint96 raw) external {
        uint256 amt = uint256(raw) % 1e21;
        if (amt == 0) return;
        if (which % 2 == 0) {
            vm.prank(u1);
            if (tokenIdx % 3 == 0) lockx.depositERC20(0, address(a), amt, ref);
            else if (tokenIdx % 3 == 1) lockx.depositERC20(0, address(b), amt, ref);
            else lockx.depositERC20(0, address(c), amt, ref);
        } else {
            vm.prank(u2);
            if (tokenIdx % 3 == 0) lockx.depositERC20(1, address(a), amt, ref);
            else if (tokenIdx % 3 == 1) lockx.depositERC20(1, address(b), amt, ref);
            else lockx.depositERC20(1, address(c), amt, ref);
        }
    }

    function invariant_sumPerLockboxEqualsContract() public view {
        // ETH
        uint256 totalEth = lockx.getEthBal(0) + lockx.getEthBal(1);
        assertEq(address(lockx).balance, totalEth);

        // ERC20s
        address[3] memory toks = [address(a), address(b), address(c)];
        for (uint256 i; i < 3; ++i) {
            uint256 total = lockx.getERC20Bal(0, toks[i]) + lockx.getERC20Bal(1, toks[i]);
            assertEq(MockERC20(toks[i]).balanceOf(address(lockx)), total);
        }
    }
}


