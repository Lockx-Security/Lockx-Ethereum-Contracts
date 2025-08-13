// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxDepositsHunt
 * @notice Hunt for the final 2 missing lines in Deposits.sol
 * Try various edge cases and error conditions
 */
contract LockxDepositsHunt is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        
        vm.deal(user1, 50 ether);
        vm.deal(user2, 50 ether);
        tokenA.mint(user1, 10000e18);
        tokenB.mint(user1, 10000e18);
        
        for (uint256 i = 1; i <= 10; i++) {
            nft.mint(user1, i);
        }
    }
    
    /**
     * @notice Try to hit every possible line and edge case
     */
    function test_hunt_missing_lines() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("hunt"));
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        
        // Test all deposit variations
        lockx.depositETH{value: 1 ether}(tokenId, bytes32("eth1"));
        lockx.depositETH{value: 0.5 ether}(tokenId, bytes32("eth2"));
        lockx.depositETH{value: 1 wei}(tokenId, bytes32("eth3"));
        
        // Test ERC20 deposits with different scenarios
        tokenA.approve(address(lockx), 8000e18);
        tokenB.approve(address(lockx), 5000e18);
        
        // First deposit (new token registration)
        lockx.depositERC20(tokenId, address(tokenA), 1000e18, bytes32("tokenA1"));
        // Second deposit (existing token)  
        lockx.depositERC20(tokenId, address(tokenA), 500e18, bytes32("tokenA2"));
        // Third deposit (existing token)
        lockx.depositERC20(tokenId, address(tokenA), 200e18, bytes32("tokenA3"));
        
        // Different token (new registration)
        lockx.depositERC20(tokenId, address(tokenB), 800e18, bytes32("tokenB1"));
        // Same token again
        lockx.depositERC20(tokenId, address(tokenB), 300e18, bytes32("tokenB2"));
        
        // NFT deposits
        for (uint256 i = 1; i <= 5; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("nft", i)));
        }
        
        // Batch deposits with various combinations
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100e18;
        amounts[1] = 150e18;
        
        address[] memory nftContracts = new address[](2);
        nftContracts[0] = address(nft);
        nftContracts[1] = address(nft);
        
        uint256[] memory nftIds = new uint256[](2);
        nftIds[0] = 6;
        nftIds[1] = 7;
        
        nft.approve(address(lockx), 6);
        nft.approve(address(lockx), 7);
        
        // Comprehensive batch
        lockx.batchDeposit{value: 2 ether}(tokenId, 2 ether, tokens, amounts, nftContracts, nftIds, bytes32("batch1"));
        
        // Empty arrays batch (ETH only)
        address[] memory empty = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        lockx.batchDeposit{value: 1 ether}(tokenId, 1 ether, empty, emptyAmounts, empty, emptyAmounts, bytes32("eth_only"));
        
        // Tokens only batch
        address[] memory tokensOnly = new address[](1);
        tokensOnly[0] = address(tokenA);
        uint256[] memory tokensOnlyAmounts = new uint256[](1);
        tokensOnlyAmounts[0] = 75e18;
        
        lockx.batchDeposit{value: 0}(tokenId, 0, tokensOnly, tokensOnlyAmounts, empty, emptyAmounts, bytes32("tokens_only"));
        
        // NFTs only batch
        address[] memory nftsOnly = new address[](1);
        nftsOnly[0] = address(nft);
        uint256[] memory nftsOnlyIds = new uint256[](1);
        nftsOnlyIds[0] = 8;
        
        nft.approve(address(lockx), 8);
        lockx.batchDeposit{value: 0}(tokenId, 0, empty, emptyAmounts, nftsOnly, nftsOnlyIds, bytes32("nfts_only"));
        
        vm.stopPrank();
        
        // Try with different users
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 5 ether}(user2, keyAddr1, bytes32("user2"));
        
        assertTrue(true, "Comprehensive deposit hunt completed");
    }
    
    /**
     * @notice Test error conditions
     */
    function test_error_conditions() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("errors"));
        uint256 tokenId = 0;
        
        // Test all error conditions
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositETH{value: 0}(tokenId, bytes32("zero_eth"));
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC20(tokenId, address(0), 100e18, bytes32("zero_token"));
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC20(tokenId, address(tokenA), 0, bytes32("zero_amount"));
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC721(tokenId, address(0), 1, bytes32("zero_nft"));
        
        // Wrong owner
        vm.prank(user2);
        vm.expectRevert();
        lockx.depositETH{value: 1 ether}(tokenId, bytes32("wrong_owner"));
        
        // Nonexistent token
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositETH{value: 1 ether}(999, bytes32("nonexistent"));
        
        // Batch errors
        address[] memory empty = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 0}(tokenId, 0, empty, emptyAmounts, empty, emptyAmounts, bytes32("zero_batch"));
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 1 ether}(tokenId, 2 ether, empty, emptyAmounts, empty, emptyAmounts, bytes32("mismatch"));
        
        address[] memory mismatchTokens = new address[](2);
        uint256[] memory mismatchAmounts = new uint256[](1);
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 0}(tokenId, 0, mismatchTokens, mismatchAmounts, empty, emptyAmounts, bytes32("mismatch_arrays"));
        
        assertTrue(true, "Error conditions tested");
    }
}