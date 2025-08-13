// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

contract LockxFuzz is Test {
    Lockx internal lockx;
    MockERC20 internal token;
    MockERC721 internal nft;

    address internal user = address(0xBEEF);
    address internal lockboxKey = address(0xABCD);
    bytes32 internal referenceId = bytes32('fuzz');

    function setUp() public {
        vm.deal(user, 100 ether);

        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();

        token.mint(user, 1_000_000 ether);
    }

    // Fuzz deposit amounts to ensure ETH balances update correctly
    function testFuzz_ethDeposit(uint96 amount) public {
        vm.assume(amount > 0 && amount < 10 ether);

        vm.prank(user);
        lockx.createLockboxWithETH{value: amount}(user, lockboxKey, referenceId);

        // lockx contract should now hold the deposited ETH
        assertEq(address(lockx).balance, amount);
    }
}
