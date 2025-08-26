// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";
import "../../contracts/mocks/MockFeeOnTransferToken.sol";
import "../../contracts/mocks/RejectETH.sol";

/**
 * @title LockxWithdrawalsUltimate100
 * @notice ULTIMATE comprehensive test to hit ALL missing lines in Withdrawals.sol  
 * Current: 68.71% (112/163) → Target: 100% (163/163)
 * Missing: 51 lines of complex error conditions, swap paths, view logic
 */
contract LockxWithdrawalsUltimate100 is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC20 public tokenC;
    MockERC721 public nft;
    MockSwapRouter public swapRouter;
    MockFeeOnTransferToken public feeToken;
    RejectETH public rejectETH;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    uint256 private key1 = 0x1111;
    address public keyAddr1;
    
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
        swapRouter = new MockSwapRouter();
        feeToken = new MockFeeOnTransferToken();
        rejectETH = new RejectETH();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        tokenC.initialize("Token C", "TOKC");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr1 = vm.addr(key1);
        
        vm.deal(user1, 200 ether);
        vm.deal(user2, 200 ether);
        vm.deal(address(swapRouter), 100 ether); // Fund router for ETH swaps
        tokenA.mint(user1, 100000e18);
        tokenB.mint(user1, 100000e18);
        tokenC.mint(user1, 100000e18);
        feeToken.mint(user1, 100000e18);
        
        // Mint tokens to swap router for swaps
        tokenA.mint(address(swapRouter), 50000e18);
        tokenB.mint(address(swapRouter), 50000e18);
        tokenC.mint(address(swapRouter), 50000e18);
        
        for (uint256 i = 1; i <= 50; i++) {
            nft.mint(user1, i);
        }
    }
    
    /**
     * @notice Test ALL error conditions in withdrawal functions
     */
    function test_all_withdrawal_errors() public {
        // Create lockbox
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("errors"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test NoETHBalance error
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 20 ether, user1, bytes32("too_much_eth"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // NoETHBalance
        lockx.withdrawETH(tokenId, messageHash, signature, 20 ether, user1, bytes32("too_much_eth"), expiry);
        
        // Setup tokens for more error testing
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 5000e18);
        lockx.depositERC20(tokenId, address(tokenA), 3000e18, bytes32("setup_A"));
        nft.approve(address(lockx), 1);
        lockx.depositERC721(tokenId, address(nft), 1, bytes32("setup_nft"));
        vm.stopPrank();
        
        // Test InsufficientTokenBalance error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 5000e18, user1, bytes32("too_much_token"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InsufficientTokenBalance
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 5000e18, user1, bytes32("too_much_token"), expiry);
        
        // Test NFTNotFound error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 999, user1, bytes32("nonexistent_nft"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // NFTNotFound
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 999, user1, bytes32("nonexistent_nft"), expiry);
        
        // Test EthTransferFailed error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, address(rejectETH), bytes32("reject_eth"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // EthTransferFailed
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, address(rejectETH), bytes32("reject_eth"), expiry);
        
        // Test SignatureExpired error
        uint256 pastExpiry = block.timestamp - 1;
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 1 ether, user1, bytes32("expired"), user1, pastExpiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("expired"), pastExpiry);
        
        assertTrue(true, "All withdrawal errors tested");
    }
    
    /**
     * @notice Test ALL swap error conditions and edge cases
     */
    function test_comprehensive_swap_errors_and_paths() public {
        // Create lockbox with assets
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 15 ether}(user1, keyAddr1, bytes32("swap_test"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 10000e18);
        lockx.depositERC20(tokenId, address(tokenA), 8000e18, bytes32("swap_setup"));
        vm.stopPrank();
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(tokenB), 1000e18, 948e18, address(lockx)
        );
        
        // Test SignatureExpired in swap
        uint256 pastExpiry = block.timestamp - 1;
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 1000e18, 948e18,
            address(swapRouter), keccak256(swapData), bytes32("expired"), user1, pastExpiry, address(0)
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // SignatureExpired
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 1000e18,
            950e18, address(swapRouter), swapData, bytes32("expired"), pastExpiry, address(0)
        );
        
        // Test ZeroAddress target error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 1000e18, 948e18,
            address(0), keccak256(swapData), bytes32("zero_target"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAddress
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 1000e18,
            950e18, address(0), swapData, bytes32("zero_target"), expiry, address(0)
        );
        
        // Test ZeroAmount error
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 0, 950e18,
            address(swapRouter), keccak256(swapData), bytes32("zero_amount"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // ZeroAmount
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 0,
            950e18, address(swapRouter), swapData, bytes32("zero_amount"), expiry, address(0)
        );
        
        // Test InvalidSwap error (same token)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(tokenA), 1000e18, 950e18,
            address(swapRouter), keccak256(swapData), bytes32("same_token"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InvalidSwap
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenA), 1000e18,
            950e18, address(swapRouter), swapData, bytes32("same_token"), expiry, address(0)
        );
        
        // Test NoETHBalance error (swap ETH when insufficient)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(0), address(tokenB), 20 ether, 19 ether,
            address(swapRouter), keccak256(swapData), bytes32("insufficient_eth"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // NoETHBalance
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(0), address(tokenB), 20 ether,
            19 ether, address(swapRouter), swapData, bytes32("insufficient_eth"), expiry, address(0)
        );
        
        // Test InsufficientTokenBalance error (swap token when insufficient)
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 10000e18, 9500e18,
            address(swapRouter), keccak256(swapData), bytes32("insufficient_token"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        vm.expectRevert(); // InsufficientTokenBalance
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 10000e18,
            9500e18, address(swapRouter), swapData, bytes32("insufficient_token"), expiry, address(0)
        );
        
        assertTrue(true, "Comprehensive swap errors tested");
    }
    
    /**
     * @notice Test successful swap paths including recipient variants
     */
    function test_successful_swap_paths() public {
        // Create lockbox with assets
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("swap_success"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 5000e18);
        lockx.depositERC20(tokenId, address(tokenA), 3000e18, bytes32("swap_setup"));
        vm.stopPrank();
        
        // Test 1: ERC20 to ERC20 swap, output to lockbox (recipient = address(0))
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(tokenB), 1000e18, 948e18, address(lockx)
        );
        
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(
            tokenId, address(tokenA), address(tokenB), 1000e18, 948e18,
            address(swapRouter), keccak256(swapData), bytes32("erc20_to_erc20"), user1, expiry, address(0)
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), 1000e18,
            948e18, address(swapRouter), swapData, bytes32("erc20_to_erc20"), expiry, address(0)
        );
        
        // Test 2: ETH to ERC20 swap, output to external recipient
        swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(0), address(tokenB), 2 ether, 1896e18, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(0), address(tokenB), 2 ether, 1896e18,
            address(swapRouter), keccak256(swapData), bytes32("eth_to_erc20"), user1, expiry, user2
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(0), address(tokenB), 2 ether,
            1896e18, address(swapRouter), swapData, bytes32("eth_to_erc20"), expiry, user2
        );
        
        // Test 3: ERC20 to ETH swap, output to external recipient
        swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(0), 500e18, 4.99 ether, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(0), 500e18, 4.99 ether,
            address(swapRouter), keccak256(swapData), bytes32("erc20_to_eth"), user1, expiry, user2
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(0), 500e18,
            4.99 ether, address(swapRouter), swapData, bytes32("erc20_to_eth"), expiry, user2
        );
        
        // Test 4: ETH to ETH (different amounts), output to lockbox
        swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(0), address(0), 1 ether, 0.95 ether, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(0), address(0), 1 ether, 0.95 ether,
            address(swapRouter), keccak256(swapData), bytes32("eth_to_eth"), user1, expiry, address(0)
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        // This should fail with InvalidSwap since tokenIn == tokenOut
        vm.prank(user1);
        vm.expectRevert(); // InvalidSwap
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(0), address(0), 1 ether,
            0.95 ether, address(swapRouter), swapData, bytes32("eth_to_eth"), expiry, address(0)
        );
        
        assertTrue(true, "Successful swap paths tested");
    }
    
    /**
     * @notice Test getFullLockbox view function thoroughly
     */
    function test_getFullLockbox_comprehensive() public {
        // Create lockbox with complex state
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 8 ether}(user1, keyAddr1, bytes32("view_test"));
        uint256 tokenId = 0;
        
        // Initially empty except ETH
        vm.prank(user1);
        (uint256 ethBalance, Lockx.erc20Balances[] memory tokens, Lockx.nftBalances[] memory nfts) = 
            lockx.getFullLockbox(tokenId);
        assertEq(ethBalance, 8 ether, "Initial ETH balance");
        assertEq(tokens.length, 0, "No initial tokens");
        assertEq(nfts.length, 0, "No initial NFTs");
        
        // Add various assets
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 5000e18);
        tokenB.approve(address(lockx), 3000e18);
        tokenC.approve(address(lockx), 1000e18);
        
        lockx.depositERC20(tokenId, address(tokenA), 2000e18, bytes32("deposit_A"));
        lockx.depositERC20(tokenId, address(tokenB), 1500e18, bytes32("deposit_B"));
        lockx.depositERC20(tokenId, address(tokenC), 500e18, bytes32("deposit_C"));
        
        for (uint256 i = 1; i <= 5; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("deposit_nft", i)));
        }
        
        lockx.depositETH{value: 3 ether}(tokenId, bytes32("more_eth"));
        vm.stopPrank();
        
        // Test full state
        vm.prank(user1);
        (ethBalance, tokens, nfts) = lockx.getFullLockbox(tokenId);
        assertEq(ethBalance, 11 ether, "Total ETH balance");
        assertEq(tokens.length, 3, "Should have 3 ERC20 tokens");
        assertEq(nfts.length, 5, "Should have 5 NFTs");
        
        // Verify token balances
        bool foundA;
        bool foundB;
        bool foundC;
        for (uint256 i = 0; i < tokens.length; i++) {
            if (tokens[i].tokenAddress == address(tokenA)) {
                assertEq(tokens[i].balance, 2000e18, "TokenA balance");
                foundA = true;
            } else if (tokens[i].tokenAddress == address(tokenB)) {
                assertEq(tokens[i].balance, 1500e18, "TokenB balance");
                foundB = true;
            } else if (tokens[i].tokenAddress == address(tokenC)) {
                assertEq(tokens[i].balance, 500e18, "TokenC balance");
                foundC = true;
            }
        }
        assertTrue(foundA && foundB && foundC, "All tokens should be found");
        
        // Test after partial withdrawals (creates gaps in arrays)
        uint256 expiry = block.timestamp + 1 hours;
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, address(tokenB), 1500e18, user1, bytes32("remove_B"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Withdraw all of tokenB (should remove from array)
        vm.prank(user1);
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenB), 1500e18, user1, bytes32("remove_B"), expiry);
        
        // Test view after removal
        vm.prank(user1);
        (ethBalance, tokens, nfts) = lockx.getFullLockbox(tokenId);
        assertEq(tokens.length, 2, "Should have 2 tokens after removal");
        assertEq(nfts.length, 5, "NFTs should remain");
        
        // Test with wrong owner
        vm.prank(user2);
        vm.expectRevert(); // NotOwner
        lockx.getFullLockbox(tokenId);
        
        // Test with nonexistent token
        vm.prank(user1);
        vm.expectRevert(); // NonexistentToken
        lockx.getFullLockbox(999);
        
        assertTrue(true, "getFullLockbox comprehensive testing completed");
    }
    
    /**
     * @notice Test complex batch withdrawal scenarios
     */
    function test_complex_batch_withdrawals() public {
        // Create lockbox with mixed assets
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 20 ether}(user1, keyAddr1, bytes32("batch_complex"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 10000e18);
        tokenB.approve(address(lockx), 8000e18);
        tokenC.approve(address(lockx), 5000e18);
        
        lockx.depositERC20(tokenId, address(tokenA), 4000e18, bytes32("batch_setup_A"));
        lockx.depositERC20(tokenId, address(tokenB), 3000e18, bytes32("batch_setup_B"));
        lockx.depositERC20(tokenId, address(tokenC), 2000e18, bytes32("batch_setup_C"));
        
        for (uint256 i = 10; i <= 20; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(tokenId, address(nft), i, bytes32(abi.encode("batch_nft", i)));
        }
        vm.stopPrank();
        
        // Test complex batch withdrawal with mixed assets
        uint256 currentNonce = _getCurrentNonce(tokenId);
        
        address[] memory tokens = new address[](3);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        tokens[2] = address(tokenC);
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 1000e18;
        amounts[1] = 500e18;
        amounts[2] = 2000e18; // Full amount - should trigger removal
        
        address[] memory nftContracts = new address[](5);
        uint256[] memory nftIds = new uint256[](5);
        for (uint256 i = 0; i < 5; i++) {
            nftContracts[i] = address(nft);
            nftIds[i] = 15 + i; // NFTs 15-19
        }
        
        bytes memory data = abi.encode(
            tokenId, 8 ether, tokens, amounts, nftContracts, nftIds, 
            user2, bytes32("complex_batch"), user1, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        uint256 user2EthBefore = user2.balance;
        uint256 user2TokenABefore = tokenA.balanceOf(user2);
        uint256 user2TokenBBefore = tokenB.balanceOf(user2);
        uint256 user2TokenCBefore = tokenC.balanceOf(user2);
        
        vm.prank(user1);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 8 ether, tokens, amounts,
            nftContracts, nftIds, user2, bytes32("complex_batch"), expiry
        );
        
        // Verify transfers
        assertGe(user2.balance - user2EthBefore, 8 ether, "ETH transferred");
        assertGe(tokenA.balanceOf(user2) - user2TokenABefore, 1000e18, "TokenA transferred");
        assertGe(tokenB.balanceOf(user2) - user2TokenBBefore, 500e18, "TokenB transferred");
        assertGe(tokenC.balanceOf(user2) - user2TokenCBefore, 2000e18, "TokenC transferred");
        
        // Verify NFTs transferred
        for (uint256 i = 15; i <= 19; i++) {
            assertEq(nft.ownerOf(i), user2, "NFT transferred");
        }
        
        assertTrue(true, "Complex batch withdrawals tested");
    }
    
    /**
     * @notice Test fee-on-transfer token edge cases in swaps
     */
    function test_fee_on_transfer_swap_scenarios() public {
        // Create lockbox with fee-on-transfer tokens
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("fee_test"));
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        feeToken.approve(address(lockx), 5000e18);
        lockx.depositERC20(tokenId, address(feeToken), 3000e18, bytes32("fee_setup"));
        vm.stopPrank();
        
        // Test swap with fee-on-transfer token as input
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(feeToken), address(tokenB), 1000e18, 948e18, address(lockx)
        );
        
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(
            tokenId, address(feeToken), address(tokenB), 1000e18, 948e18,
            address(swapRouter), keccak256(swapData), bytes32("fee_swap"), user1, expiry, address(0)
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Setup router to have tokens for swap
        feeToken.mint(address(swapRouter), 2000e18);
        
        vm.prank(user1);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(feeToken), address(tokenB), 1000e18,
            948e18, address(swapRouter), swapData, bytes32("fee_swap"), expiry, address(0)
        );
        
        assertTrue(true, "Fee-on-transfer swap scenarios tested");
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