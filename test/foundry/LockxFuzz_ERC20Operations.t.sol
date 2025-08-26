// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

contract LockxERC20Fuzz is Test {
    Lockx internal lockx;
    MockERC20 internal token;

    address internal user = address(0xBEEF);
    address internal lockboxKey = address(0xABBA);
    bytes32 internal referenceId = bytes32('erc20fuzz');

    function setUp() public {
        vm.deal(user, 100 ether);
        lockx = new Lockx();
        token = new MockERC20();
        token.mint(user, 1_000_000 ether);
    }

    function testFuzz_erc20Deposit(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount) % 1_000_000 ether;
        vm.assume(amount > 0);

        vm.startPrank(user);
        token.approve(address(lockx), amount);
        lockx.createLockboxWithERC20(user, lockboxKey, address(token), amount, referenceId);
        vm.stopPrank();

        assertEq(token.balanceOf(address(lockx)), amount);
    }
}
