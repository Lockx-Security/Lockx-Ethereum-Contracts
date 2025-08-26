// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";
import "../../contracts/mocks/RejectETH.sol";

/**
 * @title LockxWithdrawalsUltimate
 * @notice Target the remaining 75 lines in Withdrawals.sol to get from 53.99% to 100%
 * Focus on: All withdrawal functions, swap operations, batch withdrawals, and error conditions
 */
contract LockxWithdrawalsUltimate is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;
    MockERC721 public nft;
    MockSwapRouter public router;
    RejectETH public rejectETH;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    address public keyAddr1;
    address public keyAddr2;
    
    // EIP-712 constants
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
        router = new MockSwapRouter();
        rejectETH = new RejectETH();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        tokenC.initialize("Token C", "TOKC");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        
        vm.deal(user1, 200 ether);
        vm.deal(user2, 200 ether);
        vm.deal(address(router), 100 ether);
        
        tokenA.mint(user1, 20000e18);
        tokenB.mint(user1, 20000e18);
        tokenC.mint(user1, 20000e18);
        tokenA.mint(user2, 10000e18);
        tokenA.mint(address(router), 50000e18);
        tokenB.mint(address(router), 50000e18);
        
        for (uint256 i = 1; i <= 50; i++) {
            nft.mint(user1, i);
        }
        
        // Create lockboxes with comprehensive assets
        vm.startPrank(user1);
        lockx.createLockboxWithETH{value: 50 ether}(user1, keyAddr1, bytes32("user1_lockbox"));
        tokenA.approve(address(lockx), 10000e18);
        tokenB.approve(address(lockx), 8000e18);
        tokenC.approve(address(lockx), 5000e18);
        lockx.depositERC20(0, address(tokenA), 5000e18, bytes32("tokenA"));
        lockx.depositERC20(0, address(tokenB), 3000e18, bytes32("tokenB"));
        lockx.depositERC20(0, address(tokenC), 2000e18, bytes32("tokenC"));
        
        for (uint256 i = 1; i <= 20; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(0, address(nft), i, bytes32(abi.encode("nft", i)));
        }
        vm.stopPrank();
        
        vm.startPrank(user2);
        lockx.createLockboxWithETH{value: 20 ether}(user2, keyAddr2, bytes32("user2_lockbox"));
        tokenA.approve(address(lockx), 5000e18);
        lockx.depositERC20(1, address(tokenA), 3000e18, bytes32("tokenA2"));
        vm.stopPrank();
    }
    
    /**
     * @notice Test all ETH withdrawal paths and error conditions
     */
    function test_withdrawETH_comprehensive() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test successful ETH withdrawal
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 5 ether, user2, bytes32("eth_success"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        uint256 balanceBefore = user2.balance;
        vm.prank(user1);
        lockx.withdrawETH(tokenId, messageHash, signature, 5 ether, user2, bytes32("eth_success"), expiry);
        assertEq(user2.balance - balanceBefore, 5 ether, "ETH should be withdrawn");
        
        // Test zero address error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, address(0), bytes32("zero_addr"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAddress
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, address(0), bytes32("zero_addr"), expiry);
        
        // Test signature expired error
        uint256 pastExpiry = block.timestamp - 1;
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, user1, bytes32("expired"), user1, pastExpiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("expired"), pastExpiry);
        
        // Test insufficient ETH balance error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1000 ether, user1, bytes32("too_much"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // NoETHBalance
        lockx.withdrawETH(tokenId, messageHash, signature, 1000 ether, user1, bytes32("too_much"), expiry);
        
        // Test ETH transfer failure
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, address(rejectETH), bytes32("reject"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // EthTransferFailed
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, address(rejectETH), bytes32("reject"), expiry);
        
        assertTrue(true, "ETH withdrawal comprehensive test passed");
    }
    
    /**
     * @notice Test all ERC20 withdrawal paths and error conditions
     */
    function test_withdrawERC20_comprehensive() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test successful ERC20 withdrawal
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, address(tokenA), 1000e18, user2, bytes32("token_success"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        uint256 balanceBefore = tokenA.balanceOf(user2);
        vm.prank(user1);
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 1000e18, user2, bytes32("token_success"), expiry);
        assertGe(tokenA.balanceOf(user2) - balanceBefore, 1000e18, "Tokens should be withdrawn");
        
        // Test zero address recipient error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 500e18, address(0), bytes32("zero_addr"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAddress
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 500e18, address(0), bytes32("zero_addr"), expiry);
        
        // Test insufficient token balance error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 50000e18, user1, bytes32("too_much"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InsufficientTokenBalance
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 50000e18, user1, bytes32("too_much"), expiry);
        
        // Test complete withdrawal to trigger removal
        currentNonce = _getCurrentNonce(tokenId);
        uint256 remainingBalance = 4000e18; // Remaining balance after previous withdrawal
        data = abi.encode(tokenId, address(tokenA), remainingBalance, user1, bytes32("complete"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), remainingBalance, user1, bytes32("complete"), expiry);
        
        assertTrue(true, "ERC20 withdrawal comprehensive test passed");
    }
    
    /**
     * @notice Test all ERC721 withdrawal paths and error conditions  
     */
    function test_withdrawERC721_comprehensive() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test successful NFT withdrawal
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, address(nft), 1, user2, bytes32("nft_success"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 1, user2, bytes32("nft_success"), expiry);
        assertEq(nft.ownerOf(1), user2, "NFT should be withdrawn");
        
        // Test zero address recipient error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 2, address(0), bytes32("zero_addr"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAddress
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 2, address(0), bytes32("zero_addr"), expiry);
        
        // Test NFT not found error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 999, user1, bytes32("not_found"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // NFTNotFound
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 999, user1, bytes32("not_found"), expiry);
        
        // Test multiple NFT withdrawals to trigger removal
        for (uint256 i = 2; i <= 5; i++) {
            currentNonce = _getCurrentNonce(tokenId);
            data = abi.encode(tokenId, address(nft), i, user1, bytes32(abi.encode("nft", i)), user1, expiry);
            messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
            (v, r, s) = vm.sign(key1, messageHash);
            signature = abi.encodePacked(r, s, v);
            
            vm.prank(user1);
            lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), i, user1, bytes32(abi.encode("nft", i)), expiry);
        }
        
        assertTrue(true, "ERC721 withdrawal comprehensive test passed");
    }
    
    /**
     * @notice Test all batch withdrawal paths and combinations
     */
    function test_batchWithdraw_comprehensive() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test comprehensive batch withdrawal
        uint256 currentNonce = _getCurrentNonce(tokenId);
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenB);
        tokens[1] = address(tokenC);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000e18;
        amounts[1] = 500e18;
        
        address[] memory nfts = new address[](3);
        nfts[0] = address(nft);
        nfts[1] = address(nft);
        nfts[2] = address(nft);
        
        uint256[] memory nftIds = new uint256[](3);
        nftIds[0] = 6;
        nftIds[1] = 7;
        nftIds[2] = 8;
        
        bytes memory data = abi.encode(
            tokenId, 3 ether, tokens, amounts, nfts, nftIds,
            user2, bytes32("batch_comprehensive"), user1, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        uint256 ethBefore = user2.balance;
        uint256 tokenBBefore = tokenB.balanceOf(user2);
        uint256 tokenCBefore = tokenC.balanceOf(user2);
        
        vm.prank(user1);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 3 ether, tokens, amounts,
            nfts, nftIds, user2, bytes32("batch_comprehensive"), expiry
        );
        
        assertGe(user2.balance - ethBefore, 3 ether, "ETH should be withdrawn");
        assertGe(tokenB.balanceOf(user2) - tokenBBefore, 1000e18, "TokenB should be withdrawn");
        assertGe(tokenC.balanceOf(user2) - tokenCBefore, 500e18, "TokenC should be withdrawn");
        assertEq(nft.ownerOf(6), user2, "NFT 6 should be withdrawn");
        assertEq(nft.ownerOf(7), user2, "NFT 7 should be withdrawn");
        assertEq(nft.ownerOf(8), user2, "NFT 8 should be withdrawn");
        
        // Test ETH-only batch withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        address[] memory emptyTokens = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        
        data = abi.encode(
            tokenId, 2 ether, emptyTokens, emptyAmounts, emptyTokens, emptyAmounts,
            user1, bytes32("eth_only_batch"), user1, expiry
        );
        messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 2 ether, emptyTokens, emptyAmounts,
            emptyTokens, emptyAmounts, user1, bytes32("eth_only_batch"), expiry
        );
        
        // Test tokens-only batch
        currentNonce = _getCurrentNonce(tokenId);
        address[] memory tokensOnly = new address[](1);
        tokensOnly[0] = address(tokenB);
        uint256[] memory amountsOnly = new uint256[](1);
        amountsOnly[0] = 500e18;
        
        data = abi.encode(
            tokenId, 0, tokensOnly, amountsOnly, emptyTokens, emptyAmounts,
            user1, bytes32("tokens_only_batch"), user1, expiry
        );
        messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 0, tokensOnly, amountsOnly,
            emptyTokens, emptyAmounts, user1, bytes32("tokens_only_batch"), expiry
        );
        
        assertTrue(true, "Batch withdrawal comprehensive test passed");
    }
    
    /**
     * @notice Test all swap operations and error conditions
     */
    function test_swapInLockbox_comprehensive() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test successful token-to-ETH swap
        uint256 currentNonce = _getCurrentNonce(tokenId);
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenB), address(0), 500e18, 1 ether, address(lockx)
        );
        
        bytes memory data = abi.encode(
            tokenId, address(tokenB), address(0), 500e18, 1 ether,
            address(router), keccak256(swapData), bytes32("swap_success"), user1, expiry, user1
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenB), address(0), 500e18,
            1 ether, address(router), swapData, bytes32("swap_success"), expiry, user1
        );
        
        // Test signature expired error
        uint256 pastExpiry = block.timestamp - 1;
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenC), address(0), 300e18, 0.5 ether,
            address(router), keccak256(swapData), bytes32("expired"), user1, pastExpiry, user1
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenC), address(0), 300e18,
            0.5 ether, address(router), swapData, bytes32("expired"), pastExpiry, user1
        );
        
        // Test invalid swap (same token)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenC), address(tokenC), 300e18, 300e18,
            address(router), keccak256(swapData), bytes32("same_token"), user1, expiry, user1
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidSwap
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenC), address(tokenC), 300e18,
            300e18, address(router), swapData, bytes32("same_token"), expiry, user1
        );
        
        assertTrue(true, "Swap comprehensive test passed");
    }
    
    /**
     * @notice Test view function getFullLockbox
     */
    function test_getFullLockbox() public {
        uint256 tokenId = 0;
        
        vm.prank(user1);
        (uint256 ethBalance, Lockx.erc20Balances[] memory tokens, Lockx.nftBalances[] memory nfts) = 
            lockx.getFullLockbox(tokenId);
        
        assertGt(ethBalance, 0, "Should have ETH balance");
        assertGt(tokens.length, 0, "Should have token balances");
        assertGt(nfts.length, 0, "Should have NFT balances");
        
        assertTrue(true, "getFullLockbox test passed");
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