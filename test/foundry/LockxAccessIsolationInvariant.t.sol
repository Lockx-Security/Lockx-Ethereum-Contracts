// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

// Ensures that only the NFT owner of a tokenId can access token-gated views and nonces
contract LockxAccessIsolationInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal token;

    address internal owner0 = address(0xA0);
    address internal owner1 = address(0xA1);
    address internal key0 = address(0xB0);
    address internal key1 = address(0xB1);

    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        vm.deal(owner0, 10 ether);
        vm.deal(owner1, 10 ether);
        token.mint(owner0, 1e21);
        token.mint(owner1, 1e21);

        vm.prank(owner0);
        lockx.createLockboxWithETH{value: 1 ether}(owner0, key0, bytes32('a'));
        vm.prank(owner1);
        lockx.createLockboxWithETH{value: 1 ether}(owner1, key1, bytes32('b'));

        targetContract(address(this));
    }

    function tryGetNonceAsOther(uint8 which) external {
        if (which % 2 == 0) {
            // owner1 trying to read token 0
            vm.expectRevert();
            vm.prank(owner1);
            lockx.getNonce(0);
        } else {
            // owner0 trying to read token 1
            vm.expectRevert();
            vm.prank(owner0);
            lockx.getNonce(1);
        }
    }

    function invariant_viewsAreOwnerGated() public {
        // Positive paths
        vm.prank(owner0);
        lockx.getNonce(0);
        vm.prank(owner1);
        lockx.getNonce(1);
    }
}


