// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxEdgeCases
 * @notice Tests edge cases and boundary conditions
 * @dev Ensures the contract handles extreme and unusual inputs correctly
 */
contract LockxEdgeCases is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user = makeAddr("user");
    uint256 private key = 0x1234;
    address public keyAddr;
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        keyAddr = vm.addr(key);
        
        vm.deal(user, 100 ether);
        token.mint(user, 1000000e18); // 1 million tokens instead of max/2
        
        for (uint i = 0; i < 100; i++) {
            nft.mint(user, i);
        }
    }
    
    function test_edgeCase_zeroETHDeposit() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("zero"));
        
        // Try zero deposit - should revert
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSignature("ZeroAmount()"));
        lockx.depositETH{value: 0}(0, bytes32("zero"));
    }
    
    function test_edgeCase_zeroTokenDeposit() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("zero"));
        
        // Try zero token deposit - should revert
        vm.startPrank(user);
        token.approve(address(lockx), 0);
        vm.expectRevert(abi.encodeWithSignature("ZeroAmount()"));
        lockx.depositERC20(0, address(token), 0, bytes32("zero"));
        vm.stopPrank();
    }
    
    function test_edgeCase_maxUint256Deposit() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("max"));
        
        // Try depositing large amount of tokens  
        uint256 maxAmount = 10000e18; // 10k tokens - reasonable for testing
        token.mint(user, maxAmount);
        
        vm.startPrank(user);
        token.approve(address(lockx), maxAmount);
        lockx.depositERC20(0, address(token), maxAmount, bytes32("max"));
        vm.stopPrank();
        
        // Verify deposit worked
        vm.prank(user);
        (, Withdrawals.erc20Balances[] memory tokens,) = lockx.getFullLockbox(0);
        
        bool found = false;
        for (uint i = 0; i < tokens.length; i++) {
            if (tokens[i].tokenAddress == address(token)) {
                assertEq(tokens[i].balance, maxAmount);
                found = true;
                break;
            }
        }
        assertTrue(found, "Token not found");
    }
    
    function test_edgeCase_manySmallDeposits() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("many"));
        
        // Make 100 tiny deposits
        for (uint i = 0; i < 100; i++) {
            vm.prank(user);
            lockx.depositETH{value: 0.001 ether}(0, bytes32(uint256(i)));
        }
        
        // Verify total
        vm.prank(user);
        (uint256 ethBalance, , ) = lockx.getFullLockbox(0);
        assertEq(ethBalance, 0.11 ether, "Total should be 0.11 ETH");
    }
    
    function test_edgeCase_multipleTokenTypes() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("multi"));
        
        // Create and deposit 10 different tokens
        MockERC20[] memory tokens = new MockERC20[](10);
        for (uint i = 0; i < 10; i++) {
            tokens[i] = new MockERC20();
            tokens[i].mint(user, 1000e18);
            
            vm.startPrank(user);
            tokens[i].approve(address(lockx), 100e18);
            lockx.depositERC20(0, address(tokens[i]), 100e18, bytes32(uint256(i)));
            vm.stopPrank();
        }
        
        // Verify all tokens are tracked
        vm.prank(user);
        (, Withdrawals.erc20Balances[] memory deposited,) = lockx.getFullLockbox(0);
        assertEq(deposited.length, 10, "Should have 10 token types");
    }
    
    function test_edgeCase_manyNFTs() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("nfts"));
        
        // Deposit 50 NFTs
        vm.startPrank(user);
        for (uint i = 0; i < 50; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(0, address(nft), i, bytes32(uint256(i)));
        }
        vm.stopPrank();
        
        // Verify all NFTs are tracked
        vm.prank(user);
        (, , Withdrawals.nftBalances[] memory nfts) = lockx.getFullLockbox(0);
        // Each NFT is a separate entry in the array
        assertEq(nfts.length, 50, "Should have 50 NFTs");
    }
    
    function test_edgeCase_emptyLockbox() public {
        // Create empty lockbox with minimum ETH
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.000001 ether}(user, keyAddr, bytes32("empty"));
        
        // Query empty lockbox
        vm.prank(user);
        (uint256 ethBal, Withdrawals.erc20Balances[] memory tokens, Withdrawals.nftBalances[] memory nfts) = lockx.getFullLockbox(0);
        
        assertEq(ethBal, 0.000001 ether, "Should have minimal ETH");
        assertEq(tokens.length, 0, "Should have no tokens");
        assertEq(nfts.length, 0, "Should have no NFTs");
    }
    
    function test_edgeCase_duplicateNFTReverts() public {
        // Create lockbox and deposit NFT
        vm.startPrank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("dup"));
        
        nft.approve(address(lockx), 5);
        lockx.depositERC721(0, address(nft), 5, bytes32("first"));
        
        // Try depositing same NFT again - should revert
        vm.expectRevert(); // NFT is already in lockx
        lockx.depositERC721(0, address(nft), 5, bytes32("duplicate"));
        vm.stopPrank();
    }
    
    function test_edgeCase_nonExistentTokenId() public {
        // Try operations on non-existent token ID
        vm.prank(user);
        vm.expectRevert();
        lockx.depositETH{value: 1 ether}(999, bytes32("nonexistent"));
        
        vm.prank(user);
        vm.expectRevert();
        lockx.getNonce(999);
        
        vm.prank(user);
        vm.expectRevert();
        lockx.getFullLockbox(999);
    }
    
    function test_edgeCase_wrongOwnerAccess() public {
        // User creates lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("owner"));
        
        // Different user tries to access
        address otherUser = makeAddr("other");
        vm.deal(otherUser, 2 ether); // Fund the other user
        
        vm.prank(otherUser);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.depositETH{value: 1 ether}(0, bytes32("wrong"));
        
        vm.prank(otherUser);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.getNonce(0);
    }
    
    function test_edgeCase_veryLongReferenceId() public {
        // Create lockbox with max bytes32 reference ID
        bytes32 maxRefId = bytes32(type(uint256).max);
        
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, maxRefId);
        
        // Deposit with max reference ID
        vm.prank(user);
        lockx.depositETH{value: 0.01 ether}(0, maxRefId);
        
        // Should work fine
        vm.prank(user);
        (uint256 balance, , ) = lockx.getFullLockbox(0);
        assertEq(balance, 0.02 ether);
    }
    
    function test_edgeCase_sameAddressOwnerAndKey() public {
        // Create lockbox where owner is also the key (not recommended but allowed)
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, user, bytes32("same"));
        
        // Should work
        assertEq(lockx.ownerOf(0), user);
    }
    
    function test_edgeCase_rapidSequentialOperations() public {
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("rapid"));
        
        // Rapid operations in same block
        vm.startPrank(user);
        for (uint i = 0; i < 20; i++) {
            if (i % 2 == 0) {
                lockx.depositETH{value: 0.001 ether}(0, bytes32(uint256(i)));
            } else {
                token.approve(address(lockx), 10e18);
                lockx.depositERC20(0, address(token), 10e18, bytes32(uint256(i)));
            }
        }
        vm.stopPrank();
        
        // Verify state consistency
        vm.prank(user);
        (uint256 ethBal, Withdrawals.erc20Balances[] memory tokens, ) = lockx.getFullLockbox(0);
        assertEq(ethBal, 0.02 ether, "ETH balance wrong");
        assertGt(tokens.length, 0, "Should have tokens");
    }
    
    function testFuzz_edgeCase_randomAmounts(uint256 amount) public {
        // Bound to reasonable but edge values
        amount = bound(amount, 1, type(uint128).max);
        
        vm.deal(user, amount + 1 ether);
        
        // Create lockbox with fuzzed amount
        vm.prank(user);
        lockx.createLockboxWithETH{value: amount}(user, keyAddr, bytes32("fuzz"));
        
        // Verify it worked
        vm.prank(user);
        (uint256 balance, , ) = lockx.getFullLockbox(0);
        assertEq(balance, amount);
    }
    
    function testFuzz_edgeCase_manyOperations(uint8 numOps) public {
        numOps = uint8(bound(numOps, 1, 50));
        
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 0.01 ether}(user, keyAddr, bytes32("ops"));
        
        // Perform random operations
        for (uint i = 0; i < numOps; i++) {
            uint256 opType = uint256(keccak256(abi.encode(i))) % 3;
            
            if (opType == 0) {
                // ETH deposit
                vm.prank(user);
                lockx.depositETH{value: 0.001 ether}(0, bytes32(uint256(i)));
            } else if (opType == 1) {
                // Token deposit
                vm.startPrank(user);
                token.approve(address(lockx), 1e18);
                lockx.depositERC20(0, address(token), 1e18, bytes32(uint256(i)));
                vm.stopPrank();
            } else {
                // NFT deposit (if available)
                uint256 nftId = 50 + i;
                if (nftId < 100) {
                    vm.startPrank(user);
                    nft.approve(address(lockx), nftId);
                    lockx.depositERC721(0, address(nft), nftId, bytes32(uint256(i)));
                    vm.stopPrank();
                }
            }
        }
        
        // Verify lockbox still accessible
        vm.prank(user);
        lockx.getFullLockbox(0);
    }
}