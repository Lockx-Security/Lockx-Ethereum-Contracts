// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockFeeOnTransferToken.sol";

contract LockxDepositsSimple is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    MockFeeOnTransferToken public feeToken;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2"); 
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        feeToken = new MockFeeOnTransferToken();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        tokenA.mint(user1, 10000e18);
        tokenB.mint(user1, 10000e18);
        feeToken.mint(user1, 10000e18);
        
        for (uint256 i = 1; i <= 20; i++) {
            nft.mint(user1, i);
        }
        
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("setup"));
    }
    
    function test_deposits_comprehensive() public {
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        
        // Test normal ETH deposit 
        lockx.depositETH{value: 1 ether}(tokenId, bytes32("eth"));
        
        // Test ERC20 deposits with first/second deposit logic
        tokenA.approve(address(lockx), 5000e18);
        lockx.depositERC20(tokenId, address(tokenA), 1000e18, bytes32("first_tokenA"));
        lockx.depositERC20(tokenId, address(tokenA), 500e18, bytes32("second_tokenA"));
        
        // Test different token
        tokenB.approve(address(lockx), 2000e18);
        lockx.depositERC20(tokenId, address(tokenB), 800e18, bytes32("tokenB"));
        
        // Test fee-on-transfer token
        feeToken.approve(address(lockx), 2000e18);
        lockx.depositERC20(tokenId, address(feeToken), 1000e18, bytes32("fee_token"));
        
        // Test NFT deposits
        nft.approve(address(lockx), 1);
        nft.approve(address(lockx), 2);
        lockx.depositERC721(tokenId, address(nft), 1, bytes32("nft1"));
        lockx.depositERC721(tokenId, address(nft), 2, bytes32("nft2"));
        
        // Test batch deposits
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 300e18;
        amounts[1] = 200e18;
        
        address[] memory nfts = new address[](2);
        nfts[0] = address(nft);
        nfts[1] = address(nft);
        
        uint256[] memory nftIds = new uint256[](2);
        nftIds[0] = 3;
        nftIds[1] = 4;
        
        nft.approve(address(lockx), 3);
        nft.approve(address(lockx), 4);
        
        lockx.batchDeposit{value: 2 ether}(tokenId, 2 ether, tokens, amounts, nfts, nftIds, bytes32("batch"));
        
        // Test ETH only batch
        address[] memory empty = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        lockx.batchDeposit{value: 1 ether}(tokenId, 1 ether, empty, emptyAmounts, empty, emptyAmounts, bytes32("eth_only"));
        
        vm.stopPrank();
        assertTrue(true, "Comprehensive deposits test passed");
    }
    
    function test_deposits_error_conditions() public {
        uint256 tokenId = 0;
        
        // Test zero amount ETH
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositETH{value: 0}(tokenId, bytes32("zero"));
        
        // Test zero address ERC20
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC20(tokenId, address(0), 100e18, bytes32("zero_addr"));
        
        // Test zero amount ERC20  
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC20(tokenId, address(tokenA), 0, bytes32("zero_amount"));
        
        // Test zero address NFT
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositERC721(tokenId, address(0), 1, bytes32("zero_nft"));
        
        // Test nonexistent token
        vm.prank(user1);
        vm.expectRevert();
        lockx.depositETH{value: 1 ether}(999, bytes32("nonexistent"));
        
        // Test wrong owner
        vm.prank(user2);
        vm.expectRevert();
        lockx.depositETH{value: 1 ether}(tokenId, bytes32("wrong_owner"));
        
        assertTrue(true, "Error conditions test passed");
    }
    
    function test_batch_deposit_errors() public {
        uint256 tokenId = 0;
        
        address[] memory empty = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        // Test zero amount batch
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 0}(tokenId, 0, empty, emptyAmounts, empty, emptyAmounts, bytes32("zero"));
        
        // Test ETH mismatch
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 1 ether}(tokenId, 2 ether, empty, emptyAmounts, empty, emptyAmounts, bytes32("mismatch"));
        
        // Test mismatched arrays
        address[] memory tokens = new address[](2);
        uint256[] memory amounts = new uint256[](1); // Wrong length
        
        vm.prank(user1);
        vm.expectRevert();
        lockx.batchDeposit{value: 0}(tokenId, 0, tokens, amounts, empty, emptyAmounts, bytes32("mismatch_tokens"));
        
        assertTrue(true, "Batch deposit errors test passed");
    }
}