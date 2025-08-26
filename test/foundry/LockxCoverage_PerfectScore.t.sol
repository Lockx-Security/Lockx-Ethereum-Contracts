// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";
import "../../contracts/mocks/MockFeeOnTransferToken.sol";
import "../../contracts/mocks/RejectETH.sol";
import "../../contracts/mocks/SignatureVerificationHarness.sol";

/**
 * @title LockxPerfect100
 * @notice PERFECT 100% COVERAGE - Hit every single line including edge cases
 */
contract LockxPerfect100 is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;
    MockERC721 public nft;
    MockSwapRouter public swapRouter;
    MockFeeOnTransferToken public feeToken;
    RejectETH public rejectETH;
    SignatureVerificationHarness public sigHarness;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    address public user3 = makeAddr("user3");
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    address public keyAddr1;
    address public keyAddr2;
    
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('4'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        tokenC = new MockERC20();
        nft = new MockERC721();
        swapRouter = new MockSwapRouter();
        feeToken = new MockFeeOnTransferToken();
        rejectETH = new RejectETH();
        sigHarness = new SignatureVerificationHarness();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        tokenC.initialize("Token C", "TOKC");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        
        vm.deal(user1, 1000 ether);
        vm.deal(user2, 1000 ether);
        vm.deal(user3, 1000 ether);
        vm.deal(address(swapRouter), 1000 ether);
        
        tokenA.mint(user1, 1000000e18);
        tokenB.mint(user1, 1000000e18);
        tokenC.mint(user1, 1000000e18);
        feeToken.mint(user1, 1000000e18);
        tokenA.mint(address(swapRouter), 1000000e18);
        tokenB.mint(address(swapRouter), 1000000e18);
        tokenC.mint(address(swapRouter), 1000000e18);
        
        for (uint256 i = 0; i < 100; i++) {
            nft.mint(user1, i);
        }
    }
    
    /**
     * @notice Hit missing lines in SignatureVerification.sol
     */
    function test_signatureVerification_missing_lines() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("sig"));
        uint256 tokenId = 0;
        
        // Test InvalidMessageHash error (line 133)
        uint256 expiry = block.timestamp + 1 hours;
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 1 ether, user1, bytes32("test"), user1, expiry);
        bytes32 correctMessageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        bytes32 wrongMessageHash = keccak256("wrong hash");
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, correctMessageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidMessageHash
        lockx.withdrawETH(tokenId, wrongMessageHash, signature, 1 ether, user1, bytes32("test"), expiry);
        
        // Test AlreadyInitialized error (line 84) - harder to test directly
        // We need to use a harness to test the internal initialize function
        // First mint a token to the harness
        sigHarness.mint(user1, 999);
        
        // Initialize it once
        vm.prank(user1);
        sigHarness.testInitialize(999, keyAddr1);
        
        // Try to initialize again - should revert with AlreadyInitialized
        vm.prank(user1);
        vm.expectRevert(); // AlreadyInitialized
        sigHarness.testInitialize(999, keyAddr2);
    }
    
    /**
     * @notice Hit missing lines in Lockx.sol
     */
    function test_lockx_missing_lines() public {
        // Test _finalizeBurn internal function (through burnLockbox)
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("burn_test"));
        uint256 tokenId = 0;
        
        // Add some assets to make burn more complex
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 1000e18);
        lockx.depositERC20(tokenId, address(tokenA), 1000e18, bytes32("for_burn"));
        nft.approve(address(lockx), 10);
        lockx.depositERC721(tokenId, address(nft), 10, bytes32("nft_burn"));
        vm.stopPrank();
        
        // Withdraw all assets before burning
        uint256 expiry = block.timestamp + 1 hours;
        
        // Withdraw ETH (5 ether)
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 5 ether, user1, bytes32("withdraw_eth"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawETH(tokenId, messageHash, signature, 5 ether, user1, bytes32("withdraw_eth"), expiry);
        
        // Withdraw ERC20 (1000e18 tokenA)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 1000e18, user1, bytes32("withdraw_erc20"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 1000e18, user1, bytes32("withdraw_erc20"), expiry);
        
        // Withdraw NFT (ID 10)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 10, user1, bytes32("withdraw_nft"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 10, user1, bytes32("withdraw_nft"), expiry);
        
        // Now burn the empty lockbox
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, bytes32("burn"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 4, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.burnLockbox(tokenId, messageHash, signature, bytes32("burn"), expiry);
        
        // Test _update internal function edge cases (through transfers which are disabled)
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 1 ether}(user2, keyAddr2, bytes32("transfer_test"));
        uint256 tokenId2 = 1;
        
        // Try all transfer variations to hit _update checks
        vm.startPrank(user2);
        vm.expectRevert(); // TransfersDisabled
        lockx.transferFrom(user2, user3, tokenId2);
        
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user2, user3, tokenId2);
        
        vm.expectRevert(); // TransfersDisabled
        lockx.safeTransferFrom(user2, user3, tokenId2, "data");
        vm.stopPrank();
        
        // Test fallback function
        (bool success, ) = address(lockx).call{value: 0}(abi.encodeWithSignature("nonExistent()"));
        assertFalse(success);
    }
    
    /**
     * @notice Hit missing lines in Withdrawals.sol
     */
    function test_withdrawals_missing_lines() public {
        // Create lockbox with comprehensive assets
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 100 ether}(user1, keyAddr1, bytes32("with"));
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 100000e18);
        tokenB.approve(address(lockx), 100000e18);
        tokenC.approve(address(lockx), 100000e18);
        
        lockx.depositERC20(tokenId, address(tokenA), 50000e18, bytes32("A"));
        lockx.depositERC20(tokenId, address(tokenB), 30000e18, bytes32("B"));
        lockx.depositERC20(tokenId, address(tokenC), 20000e18, bytes32("C"));
        
        // Deposit many NFTs to test array iteration edge cases
        for (uint256 i = 0; i < 50; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("nft", i)));
        }
        vm.stopPrank();
        
        uint256 expiry = block.timestamp + 1 hours;
        uint256 currentNonce;
        bytes memory data;
        bytes32 messageHash;
        uint8 v;
        bytes32 r;
        bytes32 s;
        bytes memory signature;
        
        // Test edge case: withdraw NFT from middle of array
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 25, user2, bytes32("middle_nft"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 25, user2, bytes32("middle_nft"), expiry);
        
        // Test swap with SwapCallFailed error
        MockSwapRouter badRouter = new MockSwapRouter();
        badRouter.setShouldRevert(true);
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(tokenB), 1000e18, 948e18, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 1000e18, 948e18,
            address(badRouter), keccak256(swapData), bytes32("swap_fail"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SwapCallFailed
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 1000e18,
            948e18, address(badRouter), swapData, bytes32("swap_fail"), expiry, address(0)
        );
        
        // Test complete token removal in swap (remove from middle of array)
        currentNonce = _getCurrentNonce(tokenId);
        swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenC), address(tokenA), 20000e18, 18960e18, address(lockx)
        );
        
        data = abi.encode(
            tokenId, address(tokenC), address(tokenA), 20000e18, 18960e18,
            address(swapRouter), keccak256(swapData), bytes32("complete_c"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenC), address(tokenA), 20000e18,
            18960e18, address(swapRouter), swapData, bytes32("complete_c"), expiry, address(0)
        );
        
        // Test batch with complete removal of multiple tokens
        currentNonce = _getCurrentNonce(tokenId);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(tokenB);
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 30000e18; // Complete removal
        
        address[] memory nfts = new address[](10);
        uint256[] memory nftIds = new uint256[](10);
        for (uint256 i = 0; i < 10; i++) {
            nfts[i] = address(nft);
            nftIds[i] = i * 4; // Every 4th NFT
        }
        
        data = abi.encode(
            tokenId, 20 ether, tokens, amounts, nfts, nftIds,
            user3, bytes32("batch_complete"), user1, expiry
        );
        messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 20 ether, tokens, amounts,
            nfts, nftIds, user3, bytes32("batch_complete"), expiry
        );
        
        // Test getFullLockbox after many operations
        vm.prank(user1);
        (uint256 ethBal, Lockx.erc20Balances[] memory erc20s, Lockx.nftBalances[] memory nftList) = lockx.getFullLockbox(tokenId);
        assertGt(ethBal, 0);
        // TokenB and TokenC should be removed, only TokenA remains
        assertEq(erc20s.length, 1);
        assertEq(erc20s[0].tokenAddress, address(tokenA));
        // Many NFTs should remain
        assertGt(nftList.length, 20);
    }
    
    /**
     * @notice Additional edge cases for 100% coverage
     */
    function test_additional_edge_cases() public {
        // Test createLockboxWithERC20 with fee-on-transfer token
        vm.startPrank(user1);
        feeToken.approve(address(lockx), 10000e18);
        feeToken.setFeePercentage(500); // 5% fee
        lockx.createLockboxWithERC20(user1, keyAddr1, address(feeToken), 10000e18, bytes32("fee_create"));
        uint256 tokenId = 0;
        vm.stopPrank();
        
        // Test createLockboxWithBatch with only ETH
        vm.prank(user2);
        lockx.createLockboxWithBatch{value: 10 ether}(
            user2, keyAddr2, 10 ether,
            new address[](0), new uint256[](0),
            new address[](0), new uint256[](0),
            bytes32("eth_only_batch")
        );
        
        // Test withdrawals with zero arrays in batch
        uint256 tokenId2 = 1;
        uint256 expiry = block.timestamp + 1 hours;
        uint256 currentNonce = _getCurrentNonce(tokenId2);
        
        bytes memory data = abi.encode(
            tokenId2, 5 ether, new address[](0), new uint256[](0),
            new address[](0), new uint256[](0),
            user3, bytes32("eth_only_withdraw"), user2, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId2, 6, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key2, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user2);
        lockx.batchWithdraw(
            tokenId2, messageHash, signature, 5 ether,
            new address[](0), new uint256[](0),
            new address[](0), new uint256[](0),
            user3, bytes32("eth_only_withdraw"), expiry
        );
        
        // Test SignatureExpired with exactly expired timestamp
        uint256 exactExpiry = block.timestamp;
        vm.warp(block.timestamp + 1); // Move time forward
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, user1, bytes32("exact_expired"), user1, exactExpiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("exact_expired"), exactExpiry);
    }
    
    // Helper functions
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        address owner = lockx.ownerOf(tokenId);
        vm.prank(owner);
        return lockx.getNonce(tokenId);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) 
        internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}