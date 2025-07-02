// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {LockxStateHarness} from '../../contracts/mocks/LockxHarness.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

/// @notice Invariants covering the bookkeeping arrays that track ERC-20 deposits.
contract LockxArrayInvariant is Test {
    LockxStateHarness internal lockx;
    MockERC20 internal tknA;
    MockERC20 internal tknB;
    address internal user = address(0xA11CE);
    address internal key = address(0xBEEF);
    bytes32 internal ref = bytes32('arr');

    function setUp() public {
        lockx = new LockxStateHarness();
        tknA = new MockERC20();
        tknB = new MockERC20();

        // fund user & approve tokens
        tknA.mint(user, 1e24); // large supply
        tknB.mint(user, 1e24);
        vm.prank(user);
        tknA.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        tknB.approve(address(lockx), type(uint256).max);

        // create a lockbox & deposit two tokens so arrays are non-empty
        vm.prank(user);
        lockx.createLockboxWithERC20(user, key, address(tknA), 1e18, ref);
        vm.prank(user);
        lockx.depositERC20(0, address(tknB), 5e17, ref);
    }

    // ─────────────────────── Invariants ─────────────────────────

    // The index mapping must point back into the addresses array and be consistent.
    function invariant_erc20IndexBijection() public view {
        uint256 len = lockx.getErc20ArrayLength(0);
        for (uint256 i; i < len; ++i) {
            address tokenAddr = lockx.getErc20AddressAt(0, i);
            uint256 idx = lockx.getErc20Index(0, tokenAddr);
            // stored indices are 1-based (0 means absent)
            assertGt(idx, 0);
            // convert to 0-based for array access
            uint256 arrayIdx = idx - 1;
            assertLt(arrayIdx, len);
            assertEq(lockx.getErc20AddressAt(0, arrayIdx), tokenAddr);
            // known flag must be true
            assertTrue(lockx.getErc20Known(0, tokenAddr));
        }
    }

    // There must be no duplicate addresses in the array.
    function invariant_noDuplicateAddresses() public view {
        uint256 len = lockx.getErc20ArrayLength(0);
        for (uint256 i; i < len; ++i) {
            address addrI = lockx.getErc20AddressAt(0, i);
            for (uint256 j = i + 1; j < len; ++j) {
                address addrJ = lockx.getErc20AddressAt(0, j);
                assert(addrI != addrJ);
            }
        }
    }
}
