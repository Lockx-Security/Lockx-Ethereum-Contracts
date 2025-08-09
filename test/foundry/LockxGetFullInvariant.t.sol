// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {LockxStateHarness} from '../../contracts/mocks/LockxHarness.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

contract LockxGetFullInvariant is Test {
    LockxStateHarness internal lockx;
    MockERC20 internal tA;
    MockERC20 internal tB;
    MockERC721 internal n;

    address internal user = address(0xA11CE);
    address internal key = address(0xBEEF);
    bytes32 internal ref = bytes32('full');

    function setUp() public {
        lockx = new LockxStateHarness();
        tA = new MockERC20();
        tB = new MockERC20();
        n = new MockERC721();

        vm.deal(user, 5 ether);
        tA.mint(user, 1e24);
        tB.mint(user, 1e24);

        vm.startPrank(user);
        tA.approve(address(lockx), type(uint256).max);
        tB.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithETH{value: 1 ether}(user, key, ref);
        lockx.depositERC20(0, address(tA), 3e21, ref);
        lockx.depositERC20(0, address(tB), 2e21, ref);
        n.mint(user, 77);
        n.approve(address(lockx), 77);
        lockx.depositERC721(0, address(n), 77, ref);
        vm.stopPrank();
    }

    function test_getFull_matches_internal_state() public {
        vm.prank(user);
        (uint256 ethBal, LockxStateHarness.erc20Balances[] memory erc20s, LockxStateHarness.nftBalances[] memory nfts) = lockx.getFullLockbox(0);

        // ETH
        assertEq(ethBal, lockx.getEthBal(0));

        // ERC20s: lengths and balances match
        uint256 arrLen = lockx.getErc20ArrayLength(0);
        assertEq(erc20s.length, arrLen);
        for (uint256 i; i < arrLen; ++i) {
            address token = lockx.getErc20AddressAt(0, i);
            assertEq(erc20s[i].tokenAddress, token);
            assertEq(erc20s[i].balance, lockx.getERC20Bal(0, token));
        }

        // NFTs: returned list must reflect present records (non-zero contract)
        // Basic check: at least our deposited NFT appears
        bool found;
        for (uint256 i; i < nfts.length; ++i) {
            if (nfts[i].nftContract == address(n) && nfts[i].nftTokenId == 77) {
                found = true;
            }
        }
        assertTrue(found);
    }
}


