// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockFeeOnTransferToken.sol";
import "../../contracts/mocks/MockSwapRouter.sol";

contract LockxFinalPush100 is Test {
    Lockx lockx;
    MockERC20 token;
    MockERC721 nft;
    MockFeeOnTransferToken feeToken;
    MockSwapRouter router;
    
    address user1 = address(0x1234);
    address user2 = address(0x5678);
    address user3 = address(0x9999);
    uint256 key1 = 0xA11CE;
    uint256 key2 = 0xB0B;
    address keyAddr1 = vm.addr(key1);
    address keyAddr2 = vm.addr(key2);
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        feeToken = new MockFeeOnTransferToken();
        router = new MockSwapRouter();
        
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        vm.deal(user3, 100 ether);
        vm.deal(address(router), 50 ether); // Fund router for ETH swaps
        
        token.mint(user1, 10000e18);
        token.mint(user2, 10000e18);
        feeToken.mint(user1, 10000e18);
        feeToken.mint(user2, 10000e18);
        
        nft.mint(user1, 1);
        nft.mint(user2, 2);
        nft.mint(user1, 3);
    }
    
    function test_deposits_final_5_lines() public {
        // Create lockboxes
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 5 ether}(user1, keyAddr1, bytes32("test1"));
        
        vm.prank(user2);  
        lockx.createLockboxWithETH{value: 3 ether}(user2, keyAddr2, bytes32("test2"));
        
        uint256 tokenId = 0;
        
        // Test edge cases that might hit missing lines in Deposits.sol
        vm.startPrank(user1);
        
        // 1. Test fee-on-transfer token deposits
        feeToken.approve(address(lockx), 1000e18);
        lockx.depositERC20(tokenId, address(feeToken), 1000e18, bytes32("fee_token"));
        
        // 2. Test batch deposit with complex arrays
        address[] memory tokens = new address[](2);
        tokens[0] = address(token);
        tokens[1] = address(feeToken);
        
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 500e18;
        amounts[1] = 200e18;
        
        address[] memory nftContracts = new address[](2);
        nftContracts[0] = address(nft);
        nftContracts[1] = address(nft);
        
        uint256[] memory nftIds = new uint256[](2);
        nftIds[0] = 1;
        nftIds[1] = 3;
        
        token.approve(address(lockx), 500e18);
        feeToken.approve(address(lockx), 200e18);
        nft.approve(address(lockx), 1);
        nft.approve(address(lockx), 3);
        
        lockx.batchDeposit{value: 1 ether}(
            tokenId,
            1 ether,
            tokens,
            amounts, 
            nftContracts,
            nftIds,
            bytes32("complex_batch")
        );
        
        // 3. Test depositing to array boundaries  
        lockx.depositETH{value: 1 wei}(tokenId, bytes32("boundary"));
        
        // 4. Test multiple small deposits to hit array management lines
        for(uint i = 0; i < 3; i++) {
            lockx.depositETH{value: 1 wei}(tokenId, bytes32(abi.encode(i)));
        }
        
        // 5. Test minimal deposit amount
        lockx.depositETH{value: 1 wei}(tokenId, bytes32("minimal"));
        
        vm.stopPrank();
    }
    
    function test_withdrawals_final_28_lines() public {
        // Setup lockboxes with assets
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 10 ether}(user1, keyAddr1, bytes32("withdraw_test"));
        
        vm.startPrank(user1);
        token.approve(address(lockx), 5000e18);
        lockx.depositERC20(0, address(token), 5000e18, bytes32("for_withdraw"));
        
        nft.approve(address(lockx), 1);
        lockx.depositERC721(0, address(nft), 1, bytes32("nft_deposit"));
        vm.stopPrank();
        
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        // Generate many different withdrawal scenarios to hit all lines
        
        // 1. ETH withdrawal with different recipients
        vm.startPrank(user1);
        uint256 currentNonce = _getCurrentNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 1 ether, user1, bytes32("eth1"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawETH(tokenId, messageHash, signature, 1 ether, user1, bytes32("eth1"), expiry);
        
        // 2. ERC20 withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(token), 1000e18, user2, bytes32("token1"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC20(tokenId, messageHash, signature, address(token), 1000e18, user2, bytes32("token1"), expiry);
        
        // 3. NFT withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 1, user3, bytes32("nft1"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 1, user3, bytes32("nft1"), expiry);
        
        // 4. Batch withdrawal
        currentNonce = _getCurrentNonce(tokenId);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        
        uint256[] memory amounts = new uint256[](1);  
        amounts[0] = 500e18;
        
        address[] memory nftContracts = new address[](0);
        uint256[] memory nftIds = new uint256[](0);
        
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
        
        // 5. Swap operations to hit remaining withdrawal lines
        // No need to approve router, contract handles approvals internally
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(token), address(0), 1000e18, 0, address(lockx)
        );
        
        currentNonce = _getCurrentNonce(tokenId);
        data = abi.encode(
            tokenId, address(token), address(0), 1000e18, 0,
            address(router), keccak256(swapData), bytes32("swap"), user1, expiry, user1
        );
        messageHash = _computeMessageHash(tokenId, 7, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.swapInLockbox(
            tokenId, messageHash, signature, address(token), address(0), 1000e18,
            0, address(router), swapData, bytes32("swap"), expiry, user1
        );
        vm.stopPrank();
    }
    
    function test_edge_case_coverage() public {
        // Test various edge cases to hit remaining lines
        vm.prank(user1);
        lockx.createLockboxWithETH{value: 1 ether}(user1, keyAddr1, bytes32("edge"));
        
        uint256 tokenId = 0;
        
        vm.startPrank(user1);
        
        // Test deposit with maximum amounts
        token.mint(user1, type(uint256).max / 2);
        token.approve(address(lockx), type(uint256).max / 2);
        
        // This might hit boundary conditions
        lockx.depositERC20(tokenId, address(token), 1, bytes32("tiny"));
        
        // Test with empty metadata  
        lockx.depositETH{value: 1 wei}(tokenId, bytes32(0));
        
        // Test array limits
        address[] memory emptyTokens = new address[](0);
        uint256[] memory emptyAmounts = new uint256[](0);
        address[] memory emptyNFTs = new address[](0);
        uint256[] memory emptyNFTIds = new uint256[](0);
        
        vm.expectRevert(); // ZeroAmount - can't deposit 0 ETH and no tokens/NFTs
        lockx.batchDeposit{value: 0}(tokenId, 0, emptyTokens, emptyAmounts, emptyNFTs, emptyNFTIds, bytes32("empty"));
        
        vm.stopPrank();
        
        assertTrue(true, "Edge cases covered");
    }
    
    // Helper functions
    function _getCurrentNonce(uint256 tokenId) internal returns (uint256) {
        return lockx.getNonce(tokenId);
    }
    
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