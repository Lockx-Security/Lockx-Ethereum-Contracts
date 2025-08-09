// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

contract LockxHarness is Lockx {
    // expose eth balance mapping for invariant checks
    function getEthBal(uint256 tokenId) external view returns (uint256) {
        return _ethBalances[tokenId];
    }

    // expose ERC20 balance mapping for invariant checks
    function getERC20Bal(uint256 tokenId, address token) external view returns (uint256) {
        return _erc20Balances[tokenId][token];
    }
}

contract LockxInvariant is Test {
    LockxHarness internal lockx;
    MockERC20 internal mock20;
    MockERC721 internal mock721;
    address internal user = address(0xABC1);
    address internal lockboxKey = address(0xDEF1);
    bytes32 internal referenceId = bytes32('inv');

    function setUp() public {
        lockx = new LockxHarness();
        mock20 = new MockERC20();
        mock721 = new MockERC721();
        vm.deal(user, 100 ether);

        // mint and approve ERC20 to user
        mock20.mint(user, 1e18);
        vm.prank(user);
        mock20.approve(address(lockx), 1e18);

        // create one lockbox with some ETH
        vm.prank(user);
        lockx.createLockboxWithETH{value: 5 ether}(user, lockboxKey, referenceId);

        // deposit ERC20 into the same lockbox (tokenId 0)
        vm.prank(user);
        lockx.depositERC20(0, address(mock20), 1e18, referenceId);

        // mint NFT and deposit into same lockbox
        mock721.mint(user, 2);
        vm.prank(user);
        mock721.approve(address(lockx), 2);
        vm.prank(user);
        lockx.depositERC721(0, address(mock721), 2, referenceId);

        // target this contract for invariant testing
        targetContract(address(this));
    }

    // invariant: contract ETH balance equals stored accounting for tokenId 0
    function invariant_contractEthMatchesAccounting() public view {
        uint256 stored = lockx.getEthBal(0);
        assertEq(address(lockx).balance, stored);
    }

    // invariant: contract ERC20 balance equals stored accounting for tokenId 0
    function invariant_contractERC20MatchesAccounting() public view {
        uint256 stored = lockx.getERC20Bal(0, address(mock20));
        uint256 onchain = mock20.balanceOf(address(lockx));
        assertEq(onchain, stored, "ERC20 balance mismatch");
    }

    // invariant: no ERC20 or ETH assigned to tokenId 1 or 2 (isolation)
    function invariant_isolatedLockboxZero() public view {
        assertEq(lockx.getEthBal(1), 0);
        assertEq(lockx.getEthBal(2), 0);
        assertEq(lockx.getERC20Bal(1, address(mock20)), 0);
        assertEq(lockx.getERC20Bal(2, address(mock20)), 0);
    }
} 