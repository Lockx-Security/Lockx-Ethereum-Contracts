// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";

/**
 * @title LockxAdvancedWithdrawals  
 * @notice Advanced withdrawal tests to increase Withdrawals.sol coverage from 19.63% to 40%+
 */
contract LockxAdvancedWithdrawals is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    MockSwapRouter public router;
    
    address public user = makeAddr("user");
    uint256 private userKey = 0x1234;
    address public keyAddr;
    
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
        nft = new MockERC721();
        router = new MockSwapRouter();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr = vm.addr(userKey);
        
        // Fund user and router
        vm.deal(user, 100 ether);
        vm.deal(address(router), 100 ether);
        tokenA.mint(user, 10000e18);
        tokenB.mint(user, 10000e18);
        tokenA.mint(address(router), 10000e18);
        tokenB.mint(address(router), 10000e18);
        
        for (uint i = 0; i < 10; i++) {
            nft.mint(user, i);
        }
        
        // Create lockbox with multiple assets
        vm.startPrank(user);
        tokenA.approve(address(lockx), 1000e18);
        lockx.createLockboxWithERC20(user, keyAddr, address(tokenA), 1000e18, bytes32("test"));
        
        // Add more assets
        lockx.depositETH{value: 10 ether}(0, bytes32("eth"));
        tokenB.approve(address(lockx), 500e18);
        lockx.depositERC20(0, address(tokenB), 500e18, bytes32("tokenb"));
        nft.approve(address(lockx), 1);
        lockx.depositERC721(0, address(nft), 1, bytes32("nft1"));
        nft.approve(address(lockx), 2);
        lockx.depositERC721(0, address(nft), 2, bytes32("nft2"));
        vm.stopPrank();
    }
    
    /**
     * @notice Test successful ETH withdrawal (normal path)
     */
    function test_withdrawETH_success() public {
        uint256 tokenId = 0;
        uint256 amount = 1 ether;
        uint256 expiry = block.timestamp + 1 hours;
        bytes32 refId = bytes32("success");
        
        // Debug: check ownership before withdrawal
        address owner = lockx.ownerOf(tokenId);
        console.log("Lockbox owner:", owner);
        console.log("User address:", user);
        console.log("Are they equal?", owner == user);
        
        bytes memory data = abi.encode(
            tokenId, amount, user, refId, user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        uint256 balanceBefore = user.balance;
        
        vm.prank(user);
        lockx.withdrawETH(tokenId, messageHash, signature, amount, user, refId, expiry);
        
        assertEq(user.balance - balanceBefore, amount, "ETH should be withdrawn");
    }
    
    /**
     * @notice Test successful ERC20 withdrawal (normal path)
     */
    function test_withdrawERC20_success() public {
        uint256 tokenId = 0;
        uint256 amount = 100e18;
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory signature = _createERC20WithdrawSignature(tokenId, address(tokenA), amount, user, expiry);
        bytes memory data = abi.encode(
            tokenId, address(tokenA), amount, user, bytes32("success"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data, _getCurrentNonce(tokenId));
        
        uint256 balanceBefore = tokenA.balanceOf(user);
        
        vm.prank(user);
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), amount, user, bytes32("success"), expiry);
        
        assertGe(tokenA.balanceOf(user) - balanceBefore, amount, "Tokens should be withdrawn");
    }
    
    /**
     * @notice Test successful ERC721 withdrawal (normal path)
     */
    function test_withdrawERC721_success() public {
        uint256 tokenId = 0;
        uint256 nftTokenId = 1;
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory signature = _createERC721WithdrawSignature(tokenId, address(nft), nftTokenId, user, expiry);
        bytes memory data = abi.encode(
            tokenId, address(nft), nftTokenId, user, bytes32("success"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 3, data, _getCurrentNonce(tokenId));
        
        vm.prank(user);
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), nftTokenId, user, bytes32("success"), expiry);
        
        assertEq(nft.ownerOf(nftTokenId), user, "NFT should be withdrawn");
    }
    
    /**
     * @notice Test successful batch withdrawal (normal path) 
     */
    function test_batchWithdraw_success() public {
        uint256 tokenId = 0;
        uint256 ethAmount = 2 ether;
        uint256 expiry = block.timestamp + 1 hours;
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 200e18;
        amounts[1] = 100e18;
        
        address[] memory nftContracts = new address[](1);
        nftContracts[0] = address(nft);
        
        uint256[] memory nftTokenIds = new uint256[](1);
        nftTokenIds[0] = 2;
        
        bytes memory signature = _createBatchWithdrawSignature(
            tokenId, ethAmount, tokens, amounts, nftContracts, nftTokenIds, user, expiry
        );
        
        bytes memory data = abi.encode(
            tokenId, ethAmount, tokens, amounts, nftContracts, nftTokenIds,
            user, bytes32("batch"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 6, data, _getCurrentNonce(tokenId));
        
        uint256 ethBefore = user.balance;
        uint256 tokenABefore = tokenA.balanceOf(user);
        uint256 tokenBBefore = tokenB.balanceOf(user);
        
        vm.prank(user);
        lockx.batchWithdraw(
            tokenId, messageHash, signature, ethAmount, tokens, amounts,
            nftContracts, nftTokenIds, user, bytes32("batch"), expiry
        );
        
        assertGe(user.balance - ethBefore, ethAmount, "ETH should be withdrawn");
        assertGe(tokenA.balanceOf(user) - tokenABefore, amounts[0], "TokenA should be withdrawn");
        assertGe(tokenB.balanceOf(user) - tokenBBefore, amounts[1], "TokenB should be withdrawn");
        assertEq(nft.ownerOf(2), user, "NFT should be withdrawn");
    }
    
    /**
     * @notice Test swap operations (normal paths)
     */
    function test_swapInLockbox_tokenToEth_success() public {
        uint256 tokenId = 0;
        uint256 amountIn = 100e18; // TokenA
        uint256 minAmountOut = 0.998 ether; // ETH after 0.2% fee
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(0), amountIn, minAmountOut, address(lockx)
        );
        
        bytes memory signature = _createSwapSignature(
            tokenId, address(tokenA), address(0), amountIn, minAmountOut, swapData, expiry, address(0)
        );
        
        bytes memory data = abi.encode(
            tokenId, address(tokenA), address(0), amountIn, minAmountOut,
            address(router), keccak256(swapData), bytes32("swap"), user, expiry, address(0)
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, _getCurrentNonce(tokenId));
        
        vm.prank(user);
        (uint256 ethBefore, , ) = lockx.getFullLockbox(tokenId);
        
        vm.prank(user);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(0), amountIn,
            minAmountOut, address(router), swapData, bytes32("swap"), expiry, address(0)
        );
        
        vm.prank(user);
        (uint256 ethAfter, , ) = lockx.getFullLockbox(tokenId);
        assertGt(ethAfter, ethBefore, "ETH should increase from swap");
    }
    
    /**
     * @notice Test swap ETH to token
     */
    function test_swapInLockbox_ethToToken_success() public {
        uint256 tokenId = 0;
        uint256 amountIn = 1 ether; // ETH
        uint256 minAmountOut = 948e18; // ~950 tokens minus 0.2% fee
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(0), address(tokenA), amountIn, minAmountOut, address(lockx)
        );
        
        bytes memory signature = _createSwapSignature(
            tokenId, address(0), address(tokenA), amountIn, minAmountOut, swapData, expiry, user
        );
        
        bytes memory data = abi.encode(
            tokenId, address(0), address(tokenA), amountIn, minAmountOut,
            address(router), keccak256(swapData), bytes32("ethswap"), user, expiry, user
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, _getCurrentNonce(tokenId));
        
        vm.prank(user);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(0), address(tokenA), amountIn,
            minAmountOut, address(router), swapData, bytes32("ethswap"), expiry, user
        );
    }
    
    /**
     * @notice Test token to token swap
     */
    function test_swapInLockbox_tokenToToken_success() public {
        uint256 tokenId = 0;
        uint256 amountIn = 100e18; // TokenA
        uint256 minAmountOut = 94.8e18; // TokenB (95% rate minus 0.2% fee)
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(tokenB), amountIn, minAmountOut, address(lockx)
        );
        
        bytes memory signature = _createSwapSignature(
            tokenId, address(tokenA), address(tokenB), amountIn, minAmountOut, swapData, expiry, user
        );
        
        bytes memory data = abi.encode(
            tokenId, address(tokenA), address(tokenB), amountIn, minAmountOut,
            address(router), keccak256(swapData), bytes32("tokenswap"), user, expiry, user
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, _getCurrentNonce(tokenId));
        
        vm.prank(user);
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(tokenB), amountIn,
            minAmountOut, address(router), swapData, bytes32("tokenswap"), expiry, user
        );
    }
    
    // Helper signature functions
    function _createETHWithdrawSignature(uint256 tokenId, uint256 amount, address recipient, uint256 expiry) 
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, amount, recipient, bytes32("success"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createERC20WithdrawSignature(uint256 tokenId, address tokenAddr, uint256 amount, address recipient, uint256 expiry)
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, tokenAddr, amount, recipient, bytes32("success"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createERC721WithdrawSignature(uint256 tokenId, address nftContract, uint256 nftTokenId, address recipient, uint256 expiry)
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, nftContract, nftTokenId, recipient, bytes32("success"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 3, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createBatchWithdrawSignature(
        uint256 tokenId, uint256 ethAmount, address[] memory tokens, uint256[] memory amounts,
        address[] memory nftContracts, uint256[] memory nftTokenIds, address recipient, uint256 expiry
    ) internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, ethAmount, tokens, amounts, nftContracts, nftTokenIds,
            recipient, bytes32("batch"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 6, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createSwapSignature(
        uint256 tokenId, address tokenIn, address tokenOut, uint256 amountIn, 
        uint256 minAmountOut, bytes memory swapData, uint256 expiry, address recipient
    ) internal returns (bytes memory) {
        bytes32 refId;
        if (tokenIn == address(0)) {
            refId = bytes32("ethswap");
        } else if (tokenOut == address(0)) {
            refId = bytes32("swap");
        } else {
            refId = bytes32("tokenswap");
        }
        
        bytes memory data = abi.encode(
            tokenId, tokenIn, tokenOut, amountIn, minAmountOut,
            address(router), keccak256(swapData), refId, user, expiry, recipient
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, _getCurrentNonce(tokenId));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        address owner = lockx.ownerOf(tokenId);
        vm.prank(owner);
        return lockx.getNonce(tokenId);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}