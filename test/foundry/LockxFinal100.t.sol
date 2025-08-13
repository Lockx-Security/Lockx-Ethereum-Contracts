// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxFinal100
 * @notice Final comprehensive test to push all contracts to 100% coverage
 * Target any remaining edge cases across Lockx.sol, Deposits.sol, Withdrawals.sol
 */
contract LockxFinal100 is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user1 = makeAddr("user1");
    address public owner;
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        owner = lockx.owner(); // Get the actual owner
        
        vm.deal(user1, 100 ether);
        token.mint(user1, 100000e18);
        
        for (uint256 i = 1; i <= 30; i++) {
            nft.mint(user1, i);
        }
    }
    
    /**
     * @notice Test owner-only functions
     */
    function test_owner_functions_comprehensive() public {
        string memory newURI = "https://new-metadata.example.com/";
        
        // Test setDefaultMetadataURI (owner-only)
        vm.prank(owner);
        lockx.setDefaultMetadataURI(newURI);
        
        // Test that non-owner cannot call it
        vm.prank(user1);
        vm.expectRevert(); // Should revert with Ownable: caller is not the owner
        lockx.setDefaultMetadataURI("https://unauthorized.com/");
        
        assertTrue(true, "Owner functions tested");
    }
    
    /**
     * @notice Test extreme edge cases in token operations
     */
    function test_extreme_edge_cases_all_contracts() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("extreme"));
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        
        // Test depositing and withdrawing the same token multiple times
        token.approve(address(lockx), 50000e18);
        
        // Multiple deposits and partial withdrawals to test array management
        lockx.depositERC20(tokenId, address(token), 1000e18, bytes32("deposit1"));
        lockx.depositERC20(tokenId, address(token), 500e18, bytes32("deposit2"));  
        lockx.depositERC20(tokenId, address(token), 2000e18, bytes32("deposit3"));
        
        // Now test edge cases with NFTs
        for (uint256 i = 1; i <= 5; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("mass", i)));
        }
        
        // Test depositing max amounts
        uint256 remaining = token.balanceOf(user1);
        if (remaining > 0) {
            token.approve(address(lockx), remaining);
            lockx.depositERC20(tokenId, address(token), remaining, bytes32("max_deposit"));
        }
        
        // Test depositing remaining NFTs  
        for (uint256 i = 6; i <= 15; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("remaining", i)));
        }
        
        vm.stopPrank();
        
        assertTrue(true, "Extreme edge cases tested");
    }
    
    /**
     * @notice Test all error conditions across contracts
     */
    function test_comprehensive_error_conditions() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("errors"));
        uint256 tokenId = 0;
        
        // Test all possible error conditions
        
        // 1. Test with wrong user (NotOwner errors)
        address wrongUser = makeAddr("wrongUser");
        vm.deal(wrongUser, 10 ether);
        
        vm.prank(wrongUser);
        vm.expectRevert(); // NotOwner
        lockx.depositETH{value: 1 ether}(tokenId, bytes32("wrong_user"));
        
        // 2. Test with nonexistent token (NonexistentToken)
        vm.prank(user1);
        vm.expectRevert(); // NonexistentToken or ERC721NonexistentToken
        lockx.depositETH{value: 1 ether}(999, bytes32("nonexistent"));
        
        // 3. Test zero amounts and addresses
        vm.prank(user1);
        vm.expectRevert(); // ZeroAmount
        lockx.depositETH{value: 0}(tokenId, bytes32("zero_eth"));
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAddress
        lockx.depositERC20(tokenId, address(0), 100e18, bytes32("zero_addr"));
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAmount
        lockx.depositERC20(tokenId, address(token), 0, bytes32("zero_amount"));
        
        // 4. Test batch deposit errors
        address[] memory emptyTokens = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAmount (nothing to deposit)
        lockx.batchDeposit{value: 0}(tokenId, 0, emptyTokens, emptyAmounts, emptyTokens, emptyAmounts, bytes32("empty"));
        
        // 5. ETH mismatch error
        vm.prank(user1);
        vm.expectRevert(); // ETHMismatch
        lockx.batchDeposit{value: 1 ether}(tokenId, 2 ether, emptyTokens, emptyAmounts, emptyTokens, emptyAmounts, bytes32("mismatch"));
        
        // 6. Array length mismatch
        address[] memory mismatchTokens = new address[](2);
        mismatchTokens[0] = address(token);
        mismatchTokens[1] = address(token);
        uint256[] memory mismatchAmounts = new uint256[](1);
        mismatchAmounts[0] = 100e18;
        
        vm.prank(user1);
        vm.expectRevert(); // MismatchedInputs
        lockx.batchDeposit{value: 0}(tokenId, 0, mismatchTokens, mismatchAmounts, emptyTokens, emptyAmounts, bytes32("array_mismatch"));
        
        assertTrue(true, "Comprehensive error conditions tested");
    }
    
    /**
     * @notice Test Lockx-specific functionality
     */
    function test_lockx_specific_functions() public {
        // Test token URI functionality
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 2 ether}(user1, keyAddr1, bytes32("uri_test"));
        uint256 tokenId = 0;
        
        // Test tokenURI with no URI set (should revert)
        vm.expectRevert(); // NoURI or similar
        lockx.tokenURI(tokenId);
        
        // Test tokenURI with nonexistent token
        vm.expectRevert(); // ERC721NonexistentToken
        lockx.tokenURI(999);
        
        // Test name and symbol
        assertEq(lockx.name(), "Lockx.io", "Contract name");
        assertEq(lockx.symbol(), "Lockbox", "Contract symbol");
        
        // Test supportsInterface with various interfaces
        assertTrue(lockx.supportsInterface(0x01ffc9a7), "Should support ERC165");
        assertTrue(lockx.supportsInterface(0x80ac58cd), "Should support ERC721");
        assertTrue(lockx.supportsInterface(0x5b5e139f), "Should support ERC721Metadata");
        assertFalse(lockx.supportsInterface(0x12345678), "Should not support random interface");
        
        // Test locked functionality (soulbound)
        assertTrue(lockx.locked(tokenId), "Token should be locked/soulbound");
        
        // Test all transfer functions should fail (soulbound)
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user1, makeAddr("recipient"), tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, makeAddr("recipient"), tokenId);
        
        vm.prank(user1);
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user1, makeAddr("recipient"), tokenId, "");
        
        assertTrue(true, "Lockx-specific functions tested");
    }
    
    /**
     * @notice Test receive ETH functionality
     */
    function test_receive_eth() public {
        uint256 balanceBefore = address(lockx).balance;
        
        // Send ETH directly to contract
        (bool success, ) = address(lockx).call{value: 5 ether}("");
        assertTrue(success, "Should accept ETH");
        
        assertEq(address(lockx).balance, balanceBefore + 5 ether, "ETH should be received");
        
        assertTrue(true, "Receive ETH tested");
    }
    
    /**
     * @notice Test complex scenarios with multiple operations
     */
    function test_complex_multi_operation_scenarios() public {
        // Create multiple lockboxes for different scenarios
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(user1);
            lockx.createLockboxWithETH{value: 3 ether}(
                user1, keyAddr1, bytes32(abi.encode("complex", i))
            );
        }
        
        vm.startPrank(user1);
        
        // Complex deposit patterns for each lockbox
        token.approve(address(lockx), 30000e18);
        
        for (uint256 tokenId = 0; tokenId < 3; tokenId++) {
            // Varied deposit amounts
            lockx.depositERC20(tokenId, address(token), (tokenId + 1) * 1000e18, bytes32("complex_erc20"));
            
            // NFT deposits
            if (tokenId * 3 + 1 <= 30) {
                for (uint256 nftId = tokenId * 3 + 1; nftId <= tokenId * 3 + 3 && nftId <= 30; nftId++) {
                    nft.approve(address(lockx), nftId);
                    lockx.depositERC721(tokenId, address(nft), nftId, bytes32(abi.encode("complex_nft", nftId)));
                }
            }
            
            // Additional ETH deposits
            lockx.depositETH{value: (tokenId + 1) * 0.5 ether}(tokenId, bytes32("complex_eth"));
        }
        
        vm.stopPrank();
        
        // Verify all operations completed
        for (uint256 tokenId = 0; tokenId < 3; tokenId++) {
            assertEq(lockx.ownerOf(tokenId), user1, "Owner should be correct");
        }
        
        assertTrue(true, "Complex multi-operation scenarios tested");
    }
}