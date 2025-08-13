// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxDepositsCoverage
 * @notice Targeted tests to increase coverage on Deposits.sol from 54.65% to 80%+
 */
contract LockxDepositsCoverage is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    
    address public user = makeAddr("user");
    address public keyAddr = makeAddr("key");
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        // Fund user
        vm.deal(user, 10 ether);
        token.mint(user, 1000e18);
        nft.mint(user, 1);
        
        // Create basic lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
    }
    
    /**
     * @notice Test ZeroAmount error in depositETH - line 96
     */
    function test_depositETH_zeroAmount_error() public {
        uint256 tokenId = 0;
        
        vm.prank(user);
        vm.expectRevert(); // ZeroAmount
        lockx.depositETH{value: 0}(tokenId, bytes32("zero"));
    }
    
    /**
     * @notice Test ZeroAddress error in depositERC20 - line 116
     */
    function test_depositERC20_zeroAddress_error() public {
        uint256 tokenId = 0;
        
        vm.prank(user);
        vm.expectRevert(); // ZeroAddress
        lockx.depositERC20(tokenId, address(0), 100e18, bytes32("zero"));
    }
    
    /**
     * @notice Test ZeroAmount error in depositERC20 - line 117
     */
    function test_depositERC20_zeroAmount_error() public {
        uint256 tokenId = 0;
        
        vm.startPrank(user);
        token.approve(address(lockx), 0);
        vm.expectRevert(); // ZeroAmount
        lockx.depositERC20(tokenId, address(token), 0, bytes32("zero"));
        vm.stopPrank();
    }
    
    /**
     * @notice Test ZeroAddress error in depositERC721 - line 137
     */
    function test_depositERC721_zeroAddress_error() public {
        uint256 tokenId = 0;
        
        vm.prank(user);
        vm.expectRevert(); // ZeroAddress
        lockx.depositERC721(tokenId, address(0), 1, bytes32("zero"));
    }
    
    /**
     * @notice Test ETHMismatch error in batchDeposit - line 166
     */
    function test_batchDeposit_ethMismatch_error() public {
        uint256 tokenId = 0;
        uint256 declaredETH = 2 ether;
        uint256 actualETH = 1 ether; // Mismatch!
        
        address[] memory tokenAddresses = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftTokenIds = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert(); // ETHMismatch
        lockx.batchDeposit{value: actualETH}(
            tokenId, declaredETH, tokenAddresses, amounts, 
            nftContracts, nftTokenIds, bytes32("mismatch")
        );
    }
    
    /**
     * @notice Test MismatchedInputs error in batchDeposit - line 170
     */
    function test_batchDeposit_mismatchedInputs_error() public {
        uint256 tokenId = 0;
        
        // Arrays with different lengths
        address[] memory tokenAddresses = new address[](2);
        tokenAddresses[0] = address(token);
        tokenAddresses[1] = address(token);
        
        uint256[] memory amounts = new uint256[](1); // Wrong length!
        amounts[0] = 100e18;
        
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftTokenIds = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert(); // MismatchedInputs
        lockx.batchDeposit{value: 0}(
            tokenId, 0, tokenAddresses, amounts,
            nftContracts, nftTokenIds, bytes32("mismatch")
        );
    }
    
    /**
     * @notice Test ZeroAmount error in batchDeposit when totalETH is zero but msg.value > 0 - line 163
     */
    function test_batchDeposit_zeroETH_withValue_error() public {
        uint256 tokenId = 0;
        uint256 declaredETH = 0; // Zero
        uint256 actualETH = 1 ether; // But sending ETH!
        
        address[] memory tokenAddresses = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftTokenIds = new uint256[](0);
        
        vm.prank(user);
        vm.expectRevert(); // ZeroAmount (line 163: if (amountETH > 0 && msg.value == 0) revert ZeroAmount();)
        lockx.batchDeposit{value: actualETH}(
            tokenId, declaredETH, tokenAddresses, amounts,
            nftContracts, nftTokenIds, bytes32("zero")
        );
    }
    
    /**
     * @notice Test array length mismatch for NFTs in batchDeposit
     */
    function test_batchDeposit_nftArrayMismatch_error() public {
        uint256 tokenId = 0;
        
        address[] memory tokenAddresses = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        
        // NFT arrays with different lengths
        address[] memory nftContracts = new address[](2);
        nftContracts[0] = address(nft);
        nftContracts[1] = address(nft);
        
        uint256[] memory nftTokenIds = new uint256[](1); // Wrong length!
        nftTokenIds[0] = 1;
        
        vm.prank(user);
        vm.expectRevert(); // MismatchedInputs
        lockx.batchDeposit{value: 0}(
            tokenId, 0, tokenAddresses, amounts,
            nftContracts, nftTokenIds, bytes32("mismatch")
        );
    }
    
    /**
     * @notice Test NotOwner error when non-owner tries to deposit
     */
    function test_deposit_notOwner_error() public {
        uint256 tokenId = 0;
        address nonOwner = makeAddr("nonowner");
        
        vm.deal(nonOwner, 1 ether);
        vm.prank(nonOwner);
        vm.expectRevert(); // NotOwner
        lockx.depositETH{value: 0.1 ether}(tokenId, bytes32("notowner"));
    }
    
    /**
     * @notice Test NonexistentToken error when using invalid token ID
     */
    function test_deposit_nonexistentToken_error() public {
        uint256 invalidTokenId = 999;
        
        vm.prank(user);
        vm.expectRevert(); // NotOwner (which is thrown by _requireOwnsLockbox when token doesn't exist)
        lockx.depositETH{value: 0.1 ether}(invalidTokenId, bytes32("invalid"));
    }
}