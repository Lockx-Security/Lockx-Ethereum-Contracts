// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';

contract LockxSoulboundInvariant is Test {
    Lockx internal lockx;
    address internal user = address(0xABCD);
    address internal key = address(0xBEEF);

    function setUp() public {
        lockx = new Lockx();
        vm.deal(user, 1 ether);
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.5 ether}(user, key, bytes32('sb'));
        targetContract(address(this));
    }

    function tryTransfer(uint256 tokenId, address to) public {
        vm.startPrank(user);
        // Expect revert for any transfer path
        vm.expectRevert(); lockx.transferFrom(user, to, tokenId);
        vm.expectRevert(); lockx.safeTransferFrom(user, to, tokenId);
        vm.expectRevert(); lockx.safeTransferFrom(user, to, tokenId, '');
        vm.stopPrank();
    }

    function invariant_soulbound_noTransfers() public {
        // Exercise revert expectations directly
        vm.startPrank(user);
        vm.expectRevert(); lockx.transferFrom(user, address(0x1234), 0);
        vm.expectRevert(); lockx.safeTransferFrom(user, address(0x1234), 0);
        vm.expectRevert(); lockx.safeTransferFrom(user, address(0x1234), 0, '');
        vm.stopPrank();
    }
}


