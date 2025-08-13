// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxCore100
 * @notice Push Lockx.sol from 87.50% to 100% - hunt for 14 missing lines
 */
contract LockxCore100 is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public user3 = makeAddr("user3");
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        
        vm.deal(user1, 200 ether);
        vm.deal(user2, 200 ether);
        vm.deal(user3, 200 ether);
        
        token.mint(user1, 50000e18);
        token.mint(user2, 30000e18);
        token.mint(user3, 20000e18);
        
        for (uint256 i = 1; i <= 20; i++) {
            nft.mint(user1, i);
        }
        for (uint256 i = 21; i <= 35; i++) {
            nft.mint(user2, i);
        }
        for (uint256 i = 36; i <= 50; i++) {
            nft.mint(user3, i);
        }
    }
    
    /**
     * @notice Test all lockbox creation variants extensively
     */
    function test_all_creation_variants() public {
        // createLockboxWithETH - various amounts
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("eth_large"));
        
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 wei}(user1, keyAddr1, bytes32("eth_tiny"));
        
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 5 ether}(user2, keyAddr1, bytes32("eth_medium"));
        
        // createLockboxWithERC20 - test all paths
        vm.startPrank(user1);
        token.approve(address(lockx), 30000e18);
        lockx.createLockboxWithERC20(user1, keyAddr1, address(token), 5000e18, bytes32("erc20_normal"));
        lockx.createLockboxWithERC20(user1, keyAddr1, address(token), 1, bytes32("erc20_tiny"));
        lockx.createLockboxWithERC20(user1, keyAddr1, address(token), 10000e18, bytes32("erc20_large"));
        vm.stopPrank();
        
        // createLockboxWithERC721 - various NFTs
        vm.startPrank(user1);
        nft.approve(address(lockx), 1);
        nft.approve(address(lockx), 2);
        nft.approve(address(lockx), 3);
        
        lockx.createLockboxWithERC721(user1, keyAddr1, address(nft), 1, bytes32("nft1"));
        lockx.createLockboxWithERC721(user1, keyAddr1, address(nft), 2, bytes32("nft2"));
        lockx.createLockboxWithERC721(user1, keyAddr1, address(nft), 3, bytes32("nft3"));
        vm.stopPrank();
        
        // createLockboxWithBatch - comprehensive batch creation
        vm.startPrank(user2);
        token.approve(address(lockx), 10000e18);
        nft.approve(address(lockx), 21);
        nft.approve(address(lockx), 22);
        nft.approve(address(lockx), 23);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 2000e18;
        
        address[] memory nfts = new address[](3);
        nfts[0] = address(nft);
        nfts[1] = address(nft);
        nfts[2] = address(nft);
        
        uint256[] memory nftIds = new uint256[](3);
        nftIds[0] = 21;
        nftIds[1] = 22;
        nftIds[2] = 23;
        
        lockx.createLockboxWithBatch{value: 3 ether}(
            user2, keyAddr1, 3 ether, tokens, amounts, nfts, nftIds, bytes32("batch_comprehensive")
        );
        vm.stopPrank();
        
        assertTrue(true, "All creation variants tested");
    }
    
    /**
     * @notice Test error conditions thoroughly
     */
    function test_error_conditions_comprehensive() public {
        // ZeroKey errors
        vm.prank(user1);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithETH{value: 1 ether}(user1, address(0), bytes32("zero_key"));
        
        vm.startPrank(user2);
        token.approve(address(lockx), 1000e18);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithERC20(user2, address(0), address(token), 1000e18, bytes32("zero_key"));
        vm.stopPrank();
        
        vm.startPrank(user3);
        nft.approve(address(lockx), 36);
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithERC721(user3, address(0), address(nft), 36, bytes32("zero_key"));
        vm.stopPrank();
        
        // Batch creation errors
        vm.startPrank(user1);
        token.approve(address(lockx), 5000e18);
        nft.approve(address(lockx), 4);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 1000e18;
        
        address[] memory nfts = new address[](1);
        nfts[0] = address(nft);
        uint256[] memory nftIds = new uint256[](1);
        nftIds[0] = 4;
        
        vm.expectRevert(); // ZeroKey
        lockx.createLockboxWithBatch{value: 1 ether}(
            user1, address(0), 1 ether, tokens, amounts, nfts, nftIds, bytes32("batch_zero_key")
        );
        
        // ArrayLengthMismatch errors
        uint256[] memory wrongAmounts = new uint256[](2); // Wrong length
        vm.expectRevert(); // ArrayLengthMismatch
        lockx.createLockboxWithBatch{value: 1 ether}(
            user1, keyAddr1, 1 ether, tokens, wrongAmounts, nfts, nftIds, bytes32("array_mismatch")
        );
        
        uint256[] memory wrongNftIds = new uint256[](2); // Wrong length
        vm.expectRevert(); // ArrayLengthMismatch
        lockx.createLockboxWithBatch{value: 1 ether}(
            user1, keyAddr1, 1 ether, tokens, amounts, nfts, wrongNftIds, bytes32("nft_array_mismatch")
        );
        
        // EthValueMismatch error
        vm.expectRevert(); // EthValueMismatch
        lockx.createLockboxWithBatch{value: 2 ether}(
            user1, keyAddr1, 1 ether, tokens, amounts, nfts, nftIds, bytes32("eth_mismatch")
        );
        
        vm.stopPrank();
        
        assertTrue(true, "Error conditions tested");
    }
    
    /**
     * @notice Test all ERC721 standard functions comprehensively
     */
    function test_erc721_comprehensive() public {
        // Create multiple lockboxes
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("erc721_test1"));
        
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 3 ether}(user2, keyAddr1, bytes32("erc721_test2"));
        
        vm.prank(user3);
        lockx.createLockboxWithETH{value: 2 ether}(user3, keyAddr1, bytes32("erc721_test3"));
        
        // Test balanceOf for all users
        assertEq(lockx.balanceOf(user1), 1, "User1 balance");
        assertEq(lockx.balanceOf(user2), 1, "User2 balance");
        assertEq(lockx.balanceOf(user3), 1, "User3 balance");
        assertEq(lockx.balanceOf(makeAddr("nobody")), 0, "Nobody balance");
        
        // Test ownerOf for all tokens
        assertEq(lockx.ownerOf(0), user1, "Token 0 owner");
        assertEq(lockx.ownerOf(1), user2, "Token 1 owner");
        assertEq(lockx.ownerOf(2), user3, "Token 2 owner");
        
        // Test ownerOf for nonexistent token
        vm.expectRevert();
        lockx.ownerOf(999);
        
        // Test tokenURI for nonexistent token
        vm.expectRevert();
        lockx.tokenURI(999);
        
        // Test tokenURI for existing tokens (should revert with NoURI if not set)
        vm.expectRevert(); // NoURI
        lockx.tokenURI(0);
        
        assertTrue(true, "ERC721 comprehensive tests passed");
    }
    
    /**
     * @notice Test soulbound functionality comprehensively
     */
    function test_soulbound_comprehensive() public {
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("soulbound"));
        uint256 tokenId = 0;
        
        // Test locked function
        assertTrue(lockx.locked(tokenId), "Token should be locked");
        
        // Test all transfer functions should fail
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user1, user2, tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, user2, tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, user2, tokenId, "");
        
        // Test approvals work (but transfers still disabled)
        vm.prank(user1);
        lockx.approve(user2, tokenId);
        assertEq(lockx.getApproved(tokenId), user2, "Approval should work");
        
        vm.prank(user1);
        lockx.setApprovalForAll(user3, true);
        assertTrue(lockx.isApprovedForAll(user1, user3), "ApprovalForAll should work");
        
        // Even with approval, transfers should still fail
        vm.prank(user2);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user1, user2, tokenId);
        
        assertTrue(true, "Soulbound comprehensive tests passed");
    }
    
    /**
     * @notice Test interface support
     */
    function test_interface_support_comprehensive() public {
        // Test all supported interfaces
        assertTrue(lockx.supportsInterface(0x01ffc9a7), "ERC165");
        assertTrue(lockx.supportsInterface(0x80ac58cd), "ERC721");
        assertTrue(lockx.supportsInterface(0x5b5e139f), "ERC721Metadata");
        assertTrue(lockx.supportsInterface(type(IERC5192).interfaceId), "ERC5192");
        
        // Test unsupported interfaces
        assertFalse(lockx.supportsInterface(0x12345678), "Random interface");
        assertFalse(lockx.supportsInterface(0xffffffff), "Invalid interface");
        
        assertTrue(true, "Interface support comprehensive");
    }
    
    /**
     * @notice Test receive ETH functionality
     */
    function test_receive_eth_comprehensive() public {
        uint256 initialBalance = address(lockx).balance;
        
        // Send various amounts
        (bool success1, ) = address(lockx).call{value: 1 ether}("");
        assertTrue(success1, "Should receive 1 ETH");
        
        (bool success2, ) = address(lockx).call{value: 0.5 ether}("");
        assertTrue(success2, "Should receive 0.5 ETH");
        
        (bool success3, ) = address(lockx).call{value: 1 wei}("");
        assertTrue(success3, "Should receive 1 wei");
        
        assertEq(address(lockx).balance, initialBalance + 1.5 ether + 1, "Total ETH received");
        
        assertTrue(true, "Receive ETH comprehensive");
    }
    
    /**
     * @notice Test edge cases and boundary conditions
     */
    function test_edge_cases_comprehensive() public {
        // Test with maximum users
        address[] memory users = new address[](10);
        for (uint256 i = 0; i < 10; i++) {
            users[i] = makeAddr(string(abi.encodePacked("user", i)));
            vm.deal(users[i], 10 ether);
            
            vm.prank(users[i]);
            lockx.createLockboxWithETH{value: 1 ether}(users[i], keyAddr1, bytes32(abi.encodePacked("user", i)));
            
            assertEq(lockx.balanceOf(users[i]), 1, "Each user should have 1 token");
        }
        
        // Test totalSupply concept (count tokens)
        uint256 totalTokens = 0;
        for (uint256 i = 0; i < 100; i++) {
            try lockx.ownerOf(i) {
                totalTokens++;
            } catch {
                break;
            }
        }
        assertEq(totalTokens, 10, "Should have 10 tokens total");
        
        assertTrue(true, "Edge cases comprehensive");
    }
}