// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/RejectETH.sol";

/**
 * @title LockxWithdrawalsCoverage
 * @notice Targeted tests to increase coverage on Withdrawals.sol from 62.58% to 80%+
 */
contract LockxWithdrawalsCoverage is Test {
    Lockx public lockx;
    MockERC20 public token;
    MockERC721 public nft;
    RejectETH public rejecter;
    
    address public user = makeAddr("user");
    uint256 private userKey = 0x1234;
    address public keyAddr;
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('3'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        rejecter = new RejectETH();
        
        token.initialize("Test Token", "TEST");
        nft.initialize("Test NFT", "TNFT");
        
        keyAddr = vm.addr(userKey);
        
        // Fund user
        vm.deal(user, 10 ether);
        token.mint(user, 1000e18);
        nft.mint(user, 1);
        
        // Create lockbox with assets
        vm.startPrank(user);
        token.approve(address(lockx), 100e18);
        lockx.createLockboxWithERC20(user, keyAddr, address(token), 100e18, bytes32("test"));
        lockx.depositETH{value: 1 ether}(0, bytes32("eth"));
        nft.approve(address(lockx), 1);
        lockx.depositERC721(0, address(nft), 1, bytes32("nft"));
        vm.stopPrank();
    }
    
    /**
     * @notice Test SignatureExpired error - line 72, 133, 204, 275, 410
     */
    function test_signatureExpired_error() public {
        uint256 tokenId = 0;
        uint256 pastTimestamp = block.timestamp - 1; // Expired
        
        bytes memory signature = _createETHWithdrawSignature(tokenId, 0.1 ether, user, pastTimestamp);
        bytes memory data = abi.encode(
            tokenId, 0.1 ether, user, bytes32("expired"), user, pastTimestamp
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data);
        
        vm.prank(user);
        vm.expectRevert(); // SignatureExpired
        lockx.withdrawETH(
            tokenId, messageHash, signature, 0.1 ether, user, 
            bytes32("expired"), pastTimestamp
        );
    }
    
    /**
     * @notice Test EthTransferFailed error - line 99, 309, 521
     */
    function test_ethTransferFailed_error() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Try to withdraw ETH to contract that rejects it
        bytes memory signature = _createETHWithdrawSignature(tokenId, 0.1 ether, address(rejecter), expiry);
        bytes memory data = abi.encode(
            tokenId, 0.1 ether, address(rejecter), bytes32("fail"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data);
        
        vm.prank(user);
        vm.expectRevert(); // EthTransferFailed
        lockx.withdrawETH(
            tokenId, messageHash, signature, 0.1 ether, address(rejecter),
            bytes32("fail"), expiry
        );
    }
    
    /**
     * @notice Test NoETHBalance error - line 94, 306, 440
     */
    function test_noETHBalance_error() public {
        uint256 tokenId = 0;
        uint256 tooMuch = 10 ether; // More than available
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory signature = _createETHWithdrawSignature(tokenId, tooMuch, user, expiry);
        bytes memory data = abi.encode(
            tokenId, tooMuch, user, bytes32("toomuch"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data);
        
        vm.prank(user);
        vm.expectRevert(); // NoETHBalance
        lockx.withdrawETH(
            tokenId, messageHash, signature, tooMuch, user,
            bytes32("toomuch"), expiry
        );
    }
    
    /**
     * @notice Test InsufficientTokenBalance error - line 158, 328, 442
     */
    function test_insufficientTokenBalance_error() public {
        uint256 tokenId = 0;
        uint256 tooMuch = 500e18; // More than available
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory signature = _createERC20WithdrawSignature(tokenId, address(token), tooMuch, user, expiry);
        bytes memory data = abi.encode(
            tokenId, address(token), tooMuch, user, bytes32("toomuch"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data);
        
        vm.prank(user);
        vm.expectRevert(); // InsufficientTokenBalance
        lockx.withdrawERC20(
            tokenId, messageHash, signature, address(token), tooMuch, user,
            bytes32("toomuch"), expiry
        );
    }
    
    /**
     * @notice Test NFTNotFound error - line 226, 358
     */
    function test_nftNotFound_error() public {
        uint256 tokenId = 0;
        uint256 nonExistentNFT = 999; // NFT not in lockbox
        uint256 expiry = block.timestamp + 1 hours;
        
        bytes memory signature = _createERC721WithdrawSignature(tokenId, address(nft), nonExistentNFT, user, expiry);
        bytes memory data = abi.encode(
            tokenId, address(nft), nonExistentNFT, user, bytes32("notfound"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 3, data);
        
        vm.prank(user);
        vm.expectRevert(); // NFTNotFound
        lockx.withdrawERC721(
            tokenId, messageHash, signature, address(nft), nonExistentNFT, user,
            bytes32("notfound"), expiry
        );
    }
    
    /**
     * @notice Test DuplicateEntry error in batch withdraw - line 317, 349
     */
    function test_duplicateEntry_error() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Create arrays with duplicate addresses
        address[] memory tokens = new address[](2);
        tokens[0] = address(token);
        tokens[1] = address(token); // Duplicate!
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10e18;
        amounts[1] = 20e18;
        
        bytes memory signature = _createBatchWithdrawSignature(
            tokenId, 0, tokens, amounts, new address[](0), new uint256[](0), user, expiry
        );
        
        bytes memory data = abi.encode(
            tokenId, 0, tokens, amounts, new address[](0), new uint256[](0),
            user, bytes32("dup"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data);
        
        vm.prank(user);
        vm.expectRevert(); // DuplicateEntry
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 0, tokens, amounts,
            new address[](0), new uint256[](0), user, bytes32("dup"), expiry
        );
    }
    
    /**
     * @notice Test InvalidSwap error - line 413 (tokenIn == tokenOut)
     */
    function test_invalidSwap_error() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Try to swap token to itself
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(token), address(token), 10e18, 9e18, address(lockx) // Same token!
        );
        
        bytes memory signature = _createSwapSignature(
            tokenId, address(token), address(token), 10e18, 9e18, swapData, expiry
        );
        
        bytes memory data = abi.encode(
            tokenId, address(token), address(token), 10e18, 9e18,
            address(this), swapData, bytes32("invalid"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data);
        
        vm.prank(user);
        vm.expectRevert(); // InvalidSwap
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(token), address(token), 10e18,
            9e18, address(this), swapData, bytes32("invalid"), expiry, user
        );
    }
    
    // Helper functions for signature creation
    function _createETHWithdrawSignature(uint256 tokenId, uint256 amount, address recipient, uint256 expiry) 
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, amount, recipient, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createERC20WithdrawSignature(uint256 tokenId, address tokenAddr, uint256 amount, address recipient, uint256 expiry)
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, tokenAddr, amount, recipient, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createERC721WithdrawSignature(uint256 tokenId, address nftContract, uint256 nftTokenId, address recipient, uint256 expiry)
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, nftContract, nftTokenId, recipient, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 3, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createBatchWithdrawSignature(
        uint256 tokenId, uint256 ethAmount, address[] memory tokens, uint256[] memory amounts,
        address[] memory nftContracts, uint256[] memory nftTokenIds, address recipient, uint256 expiry
    ) internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, ethAmount, tokens, amounts, nftContracts, nftTokenIds,
            recipient, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createSwapSignature(
        uint256 tokenId, address tokenIn, address tokenOut, uint256 amountIn, 
        uint256 minAmountOut, bytes memory swapData, uint256 expiry
    ) internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, tokenIn, tokenOut, amountIn, minAmountOut,
            address(this), swapData, bytes32("test"), user, expiry
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data) internal returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        
        return keccak256(abi.encodePacked('\\x19\\x01', domainSeparator, structHash));
    }
}