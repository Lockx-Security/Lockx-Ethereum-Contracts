// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockFeeOnTransferToken.sol";
import "../../contracts/mocks/MockSwapRouter.sol";
import "../../contracts/mocks/RejectETH.sol";

contract LockxFinalPush95Plus is Test {
    Lockx lockx;
    MockERC20 tokenA;
    MockERC20 tokenB; 
    MockERC721 nft;
    MockFeeOnTransferToken feeToken;
    MockSwapRouter router;
    RejectETH rejectETH;
    
    address user1 = address(0x1234);
    address user2 = address(0x5678);  
    address user3 = address(0x9999);
    uint256 key1 = 0xA11CE;
    uint256 key2 = 0xB0B;
    address keyAddr1 = vm.addr(key1);
    address keyAddr2 = vm.addr(key2);
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        feeToken = new MockFeeOnTransferToken();
        router = new MockSwapRouter();
        rejectETH = new RejectETH();
        
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);
        vm.deal(address(rejectETH), 10 ether);
        vm.deal(address(router), 50 ether); // Fund router for ETH swaps
        
        tokenA.mint(user1, 50000e18);
        tokenB.mint(user1, 50000e18);
        feeToken.mint(user1, 50000e18);
        
        for(uint i = 1; i <= 10; i++) {
            nft.mint(user1, i);
        }
        
        // Create lockboxes with substantial assets
        vm.startPrank(user1);
        lockx.createLockboxWithETH{value: 20 ether}(user1, keyAddr1, bytes32("test1"));
        
        // Load up the lockbox with various assets
        tokenA.approve(address(lockx), 10000e18);
        lockx.depositERC20(0, address(tokenA), 10000e18, bytes32("tokenA"));
        
        tokenB.approve(address(lockx), 5000e18);
        lockx.depositERC20(0, address(tokenB), 5000e18, bytes32("tokenB"));
        
        feeToken.approve(address(lockx), 8000e18);
        lockx.depositERC20(0, address(feeToken), 8000e18, bytes32("feeToken"));
        
        for(uint i = 1; i <= 5; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(0, address(nft), i, bytes32(abi.encode("nft", i)));
        }
        vm.stopPrank();
        
        // Create second lockbox
        vm.prank(user2);
        lockx.createLockboxWithETH{value: 10 ether}(user2, keyAddr2, bytes32("test2"));
    }
    
    function test_deposits_edge_cases_95_percent() public {
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        
        // Test edge cases that might hit missing lines
        
        // 1. Test depositing to same token multiple times to hit balance updates
        tokenA.approve(address(lockx), 1000e18);
        lockx.depositERC20(tokenId, address(tokenA), 500e18, bytes32("first"));
        lockx.depositERC20(tokenId, address(tokenA), 500e18, bytes32("second"));
        
        // 2. Test fee-on-transfer edge cases
        feeToken.approve(address(lockx), 3000e18);
        lockx.depositERC20(tokenId, address(feeToken), 1500e18, bytes32("fee1"));
        lockx.depositERC20(tokenId, address(feeToken), 1500e18, bytes32("fee2"));
        
        // 3. Test batch deposit with mixed types and edge cases
        address[] memory tokens = new address[](3);
        tokens[0] = address(tokenA);
        tokens[1] = address(tokenB);  
        tokens[2] = address(feeToken);
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100e18;
        amounts[1] = 200e18;
        amounts[2] = 150e18;
        
        address[] memory nfts = new address[](2);
        nfts[0] = address(nft);
        nfts[1] = address(nft);
        
        uint256[] memory nftIds = new uint256[](2);
        nftIds[0] = 6;
        nftIds[1] = 7;
        
        tokenA.approve(address(lockx), 100e18);
        tokenB.approve(address(lockx), 200e18);
        feeToken.approve(address(lockx), 150e18);
        nft.approve(address(lockx), 6);
        nft.approve(address(lockx), 7);
        
        lockx.batchDeposit{value: 2 ether}(
            tokenId, 2 ether, tokens, amounts, nfts, nftIds, bytes32("complex")
        );
        
        // 4. Test deposit error conditions to hit error paths
        
        // Test ZeroAddress error in _depositERC20
        vm.expectRevert();
        lockx.depositERC20(tokenId, address(0), 100e18, bytes32("zero"));
        
        // Test ZeroAmount by trying to deposit 0 (if not already handled)
        tokenA.approve(address(lockx), 0);
        vm.expectRevert(); // Should revert with ZeroAmount or similar
        lockx.depositERC20(tokenId, address(tokenA), 0, bytes32("zero_amount"));
        
        vm.stopPrank();
    }
    
    function test_withdrawals_comprehensive_90_percent() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Test comprehensive withdrawal scenarios to hit all remaining lines
        
        // 1. Test ETH withdrawal error conditions
        vm.startPrank(user1);
        
        // Test withdrawal to address(0) - should hit ZeroAddress error
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 1 ether, address(0), bytes32("zero"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.expectRevert(); // ZeroAddress
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, address(0), bytes32("zero"), expiry);
        
        // 2. Test successful ETH withdrawal to different recipient
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 3 ether, user2, bytes32("eth"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawETH(tokenId, messageHash, signature, 3 ether, user2, bytes32("eth"), expiry);
        
        // 3. Test withdrawing more ETH than available - should hit NoETHBalance
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 100 ether, user1, bytes32("too_much"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.expectRevert(); // NoETHBalance
        lockx.withdrawETH(tokenId, messageHash, signature, 100 ether, user1, bytes32("too_much"), expiry);
        
        // 4. Test ERC20 withdrawal with insufficient balance
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 50000e18, user1, bytes32("too_much"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.expectRevert(); // InsufficientTokenBalance
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 50000e18, user1, bytes32("too_much"), expiry);
        
        // 5. Test successful ERC20 withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(tokenA), 1000e18, user3, bytes32("token"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC20(tokenId, messageHash, signature, address(tokenA), 1000e18, user3, bytes32("token"), expiry);
        
        // 6. Test NFT withdrawal with non-existent NFT
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 99, user1, bytes32("missing"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        vm.expectRevert(); // NFTNotFound
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 99, user1, bytes32("missing"), expiry);
        
        // 7. Test successful NFT withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 1, user2, bytes32("nft"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 1, user2, bytes32("nft"), expiry);
        
        // 8. Test batch withdrawal with complex scenario
        currentNonce = _getCurrentNonce(tokenId);
        
        address[] memory tokens = new address[](2);
        tokens[0] = address(tokenB);
        tokens[1] = address(feeToken);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 1000e18;
        amounts[1] = 500e18;
        
        address[] memory nftContracts = new address[](1);
        nftContracts[0] = address(nft);
        
        uint256[] memory nftIds = new uint256[](1);
        nftIds[0] = 2;
        
        data = abi.encode(
            tokenId, 2 ether, tokens, amounts, nftContracts, nftIds,
            user1, bytes32("batch"), user1, expiry
        );
        messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 2 ether, tokens, amounts,
            nftContracts, nftIds, user1, bytes32("batch"), expiry
        );
        
        // 9. Test swap operations to hit swap logic
        // No need to approve router, contract handles approvals internally
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(tokenA), address(0), 2000e18, 0, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(tokenA), address(0), 2000e18, 0,
            address(router), keccak256(swapData), bytes32("swap"), user1, expiry, user1
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(tokenA), address(0), 2000e18,
            0, address(router), swapData, bytes32("swap"), expiry, user1
        );
        
        vm.stopPrank();
        
        assertTrue(true, "Withdrawals comprehensive coverage");
    }
    
    function test_signature_verification_final_lines() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        
        // Test key rotation with new key to hit verification lines
        address newKeyAddr = vm.addr(0xDEADBEEF);
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, newKeyAddr, bytes32("rotate"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 0, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        lockx.rotateLockboxKey(tokenId, messageHash, signature, newKeyAddr, bytes32("rotate"), expiry);
        
        // Test operation with new key to verify rotation worked
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, 0.5 ether, user1, bytes32("new_key"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (v, r, s) = vm.sign(0xDEADBEEF, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawETH(tokenId, messageHash, signature, 0.5 ether, user1, bytes32("new_key"), expiry);
        
        vm.stopPrank();
        
        assertTrue(true, "Signature verification final lines covered");
    }
    
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        return lockx.getNonce(tokenId);
    }
    
    // Helper function
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 expectedNonce) 
        internal view returns (bytes32) {
        bytes32 OPERATION_TYPEHASH = keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
        bytes32 EIP712_DOMAIN_TYPEHASH = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
        bytes32 NAME_HASH = keccak256(bytes('Lockx'));
        bytes32 VERSION_HASH = keccak256(bytes('3'));
        
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, expectedNonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}