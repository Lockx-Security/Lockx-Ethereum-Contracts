// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

contract LockxWithdrawalsFixed is Test {
    Lockx lockx;
    MockERC20 token;
    MockERC721 nft;
    
    address user1 = address(0x1234);
    address user2 = address(0x5678);
    uint256 key1 = 0xA11CE;
    address keyAddr1 = vm.addr(key1);
    
    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        nft = new MockERC721();
        
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        
        token.mint(user1, 50000e18);
        nft.mint(user1, 1);
        nft.mint(user1, 2);
        nft.mint(user1, 3);
        
        // Create and fund lockbox
        vm.startPrank(user1);
        lockx.createLockboxWithETH{value: 20 ether}(user1, keyAddr1, bytes32("funded"));
        
        token.approve(address(lockx), 10000e18);
        lockx.depositERC20(0, address(token), 10000e18, bytes32("setup"));
        
        nft.approve(address(lockx), 1);
        lockx.depositERC721(0, address(nft), 1, bytes32("nft1"));
        
        nft.approve(address(lockx), 2);
        lockx.depositERC721(0, address(nft), 2, bytes32("nft2"));
        vm.stopPrank();
    }
    
    function test_working_withdrawals() public {
        uint256 tokenId = 0;
        uint256 expiry = block.timestamp + 1 hours;
        
        vm.startPrank(user1);
        
        // 1. Simple ETH withdrawal
        uint256 currentNonce = lockx.getNonce(tokenId);
        bytes memory data = abi.encode(tokenId, 2 ether, user1, bytes32("eth"), user1, expiry);
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data, currentNonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key1, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawETH(tokenId, messageHash, signature, 2 ether, user1, bytes32("eth"), expiry);
        
        // 2. Simple ERC20 withdrawal
        currentNonce = lockx.getNonce(tokenId);
        data = abi.encode(tokenId, address(token), 1000e18, user2, bytes32("token"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 2, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC20(tokenId, messageHash, signature, address(token), 1000e18, user2, bytes32("token"), expiry);
        
        // 3. Simple NFT withdrawal
        currentNonce = lockx.getNonce(tokenId);
        data = abi.encode(tokenId, address(nft), 1, user1, bytes32("nft"), user1, expiry);
        messageHash = _computeMessageHash(tokenId, 3, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.withdrawERC721(tokenId, messageHash, signature, address(nft), 1, user1, bytes32("nft"), expiry);
        
        // 4. Batch withdrawal
        currentNonce = lockx.getNonce(tokenId);
        
        address[] memory tokens = new address[](1);
        tokens[0] = address(token);
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 500e18;
        
        address[] memory nftContracts = new address[](1);
        nftContracts[0] = address(nft);
        
        uint256[] memory nftIds = new uint256[](1);
        nftIds[0] = 2;
        
        data = abi.encode(
            tokenId, 1 ether, tokens, amounts, nftContracts, nftIds,
            user1, bytes32("batch"), user1, expiry
        );
        messageHash = _computeMessageHash(tokenId, 6, data, currentNonce);
        (v, r, s) = vm.sign(key1, messageHash);
        signature = abi.encodePacked(r, s, v);
        
        lockx.batchWithdraw(
            tokenId, messageHash, signature, 1 ether, tokens, amounts,
            nftContracts, nftIds, user1, bytes32("batch"), expiry
        );
        
        vm.stopPrank();
        
        assertTrue(true, "Working withdrawals completed");
    }
    
    // Helper function using the correct EIP-712 structure
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
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }
}