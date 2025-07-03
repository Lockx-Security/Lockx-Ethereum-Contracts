// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';

/// @notice Invariant test ensuring the per-Lockbox signature nonce is monotonically
///         non-decreasing across contract interactions.
/// @dev    The test creates three independent Lockboxes (one per user) and then
///         tracks the observed nonce over the course of the invariant run.
contract LockxNonceInvariant is Test {
    Lockx internal lockx;

    address internal user1 = address(0xAAA1);
    address internal user2 = address(0xAAA2);
    address internal user3 = address(0xAAA3);
    address internal key1 = address(0xBEEF1);
    address internal key2 = address(0xBEEF2);
    address internal key3 = address(0xBEEF3);

    bytes32 internal refId = bytes32('nonceInv');

    // last observed nonce per tokenId
    mapping(uint256 => uint256) private _lastNonce;

    function setUp() public {
        lockx = new Lockx();

        // give each user some ETH to create a Lockbox
        vm.deal(user1, 10 ether);
        vm.deal(user2, 10 ether);
        vm.deal(user3, 10 ether);

        // user1 creates lockbox #0 with ETH
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, key1, refId);

        // user2 creates lockbox #1 with ETH
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 2 ether}(user2, key2, refId);

        // user3 creates lockbox #2 with ETH
        vm.prank(user3);
        lockx.createLockboxWithETH{value: 3 ether}(user3, key3, refId);

        // initialise lastNonce mapping (all start at 1 per implementation)
        _lastNonce[0] = 1;
        _lastNonce[1] = 1;
        _lastNonce[2] = 1;

        // target this invariant test contract itself (no external calls needed)
        targetContract(address(this));
    }

    /// @notice Dummy function the invariant engine will call randomly.
    ///         It has no effect but allows calls to this contract so that the
    ///         invariant is evaluated multiple times per run.
    function ping(uint256) external {}

    /// @notice Invariant: nonce must never decrease for any of the first three lockboxes.
    function invariant_noncesMonotonic() public {
        _checkAndRecordNonce(0, user1);
        _checkAndRecordNonce(1, user2);
        _checkAndRecordNonce(2, user3);
    }

    function _checkAndRecordNonce(uint256 tokenId, address owner) internal {
        vm.prank(owner);
        uint256 current = lockx.getNonce(tokenId);
        assertGe(current, _lastNonce[tokenId]);
        _lastNonce[tokenId] = current;
    }
} 