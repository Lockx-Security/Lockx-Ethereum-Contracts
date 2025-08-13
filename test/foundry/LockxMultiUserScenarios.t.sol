// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/Withdrawals.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";

/**
 * @title LockxMultiUserScenarios
 * @notice Tests complex multi-user interaction scenarios
 * @dev Ensures proper isolation and no cross-contamination between users
 */
contract LockxMultiUserScenarios is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    MockSwapRouter public router;
    
    // 5 users with different roles
    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public diana = makeAddr("diana");
    address public eve = makeAddr("eve"); // Potential attacker
    
    // Keys for each user
    uint256 private aliceKey = 0x1111;
    uint256 private bobKey = 0x2222;
    uint256 private charlieKey = 0x3333;
    uint256 private dianaKey = 0x4444;
    uint256 private eveKey = 0x5555;
    
    address public aliceKeyAddr;
    address public bobKeyAddr;
    address public charlieKeyAddr;
    address public dianaKeyAddr;
    address public eveKeyAddr;
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        router = new MockSwapRouter();
        
        // Setup key addresses
        aliceKeyAddr = vm.addr(aliceKey);
        bobKeyAddr = vm.addr(bobKey);
        charlieKeyAddr = vm.addr(charlieKey);
        dianaKeyAddr = vm.addr(dianaKey);
        eveKeyAddr = vm.addr(eveKey);
        
        // Fund all users
        address[5] memory users = [alice, bob, charlie, diana, eve];
        for (uint i = 0; i < users.length; i++) {
            vm.deal(users[i], 100 ether);
            tokenA.mint(users[i], 10000e18);
            tokenB.mint(users[i], 10000e18);
            
            // Mint NFTs
            for (uint j = 0; j < 5; j++) {
                nft.mint(users[i], i * 10 + j);
            }
        }
        
        // Fund router for swaps
        tokenA.mint(address(router), 1000000e18);
        tokenB.mint(address(router), 1000000e18);
    }
    
    function test_multiUser_isolatedLockboxes() public {
        // Each user creates their own lockbox
        vm.prank(alice);
        lockx.createLockboxWithETH{value: 10 ether}(alice, aliceKeyAddr, bytes32("alice"));
        
        vm.prank(bob);
        lockx.createLockboxWithETH{value: 15 ether}(bob, bobKeyAddr, bytes32("bob"));
        
        vm.prank(charlie);
        lockx.createLockboxWithETH{value: 20 ether}(charlie, charlieKeyAddr, bytes32("charlie"));
        
        // Verify ownership
        assertEq(lockx.ownerOf(0), alice);
        assertEq(lockx.ownerOf(1), bob);
        assertEq(lockx.ownerOf(2), charlie);
        
        // Alice tries to access Bob's lockbox - should fail
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.getNonce(1);
        
        // Bob tries to deposit to Alice's lockbox - should fail
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.depositETH{value: 1 ether}(0, bytes32("hack"));
        
        // Charlie tries to deposit to Bob's lockbox - should fail
        vm.prank(charlie);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.depositETH{value: 0.1 ether}(1, bytes32("steal"));
    }
    
    function test_multiUser_simultaneousOperations() public {
        // All users create lockboxes at the same time
        vm.prank(alice);
        lockx.createLockboxWithETH{value: 5 ether}(alice, aliceKeyAddr, bytes32("alice"));
        
        vm.prank(bob);
        lockx.createLockboxWithETH{value: 5 ether}(bob, bobKeyAddr, bytes32("bob"));
        
        vm.prank(charlie);
        lockx.createLockboxWithETH{value: 5 ether}(charlie, charlieKeyAddr, bytes32("charlie"));
        
        // All users deposit simultaneously
        vm.prank(alice);
        lockx.depositETH{value: 2 ether}(0, bytes32("deposit_alice"));
        
        vm.prank(bob);
        lockx.depositETH{value: 3 ether}(1, bytes32("deposit_bob"));
        
        vm.prank(charlie);
        lockx.depositETH{value: 4 ether}(2, bytes32("deposit_charlie"));
        
        // Verify balances are correct and isolated
        vm.prank(alice);
        (uint256 aliceETH, , ) = lockx.getFullLockbox(0);
        assertEq(aliceETH, 7 ether, "Alice balance wrong");
        
        vm.prank(bob);
        (uint256 bobETH, , ) = lockx.getFullLockbox(1);
        assertEq(bobETH, 8 ether, "Bob balance wrong");
        
        vm.prank(charlie);
        (uint256 charlieETH, , ) = lockx.getFullLockbox(2);
        assertEq(charlieETH, 9 ether, "Charlie balance wrong");
    }
    
    function test_multiUser_competingForSameNFT() public {
        // Alice owns an NFT
        uint256 nftId = 0;
        assertEq(nft.ownerOf(nftId), alice);
        
        // Alice creates lockbox and deposits NFT
        vm.startPrank(alice);
        lockx.createLockboxWithETH{value: 0.01 ether}(alice, aliceKeyAddr, bytes32("alice_nft"));
        nft.approve(address(lockx), nftId);
        lockx.depositERC721(0, address(nft), nftId, bytes32("nft"));
        vm.stopPrank();
        
        // Bob tries to deposit the same NFT (he doesn't own it)
        vm.startPrank(bob);
        lockx.createLockboxWithETH{value: 0.01 ether}(bob, bobKeyAddr, bytes32("bob_nft"));
        vm.expectRevert(); // Will fail because Bob doesn't own the NFT
        lockx.depositERC721(1, address(nft), nftId, bytes32("steal_nft"));
        vm.stopPrank();
        
        // Verify NFT is in lockx contract
        assertEq(nft.ownerOf(nftId), address(lockx));
    }
    
    function test_multiUser_crossContamination() public {
        // Setup: Users create lockboxes with different assets
        vm.startPrank(alice);
        lockx.createLockboxWithETH{value: 10 ether}(alice, aliceKeyAddr, bytes32("alice"));
        tokenA.approve(address(lockx), 1000e18);
        lockx.depositERC20(0, address(tokenA), 1000e18, bytes32("alice_tokenA"));
        vm.stopPrank();
        
        vm.startPrank(bob);
        lockx.createLockboxWithETH{value: 0.01 ether}(bob, bobKeyAddr, bytes32("bob"));
        tokenB.approve(address(lockx), 2000e18);
        lockx.depositERC20(1, address(tokenB), 2000e18, bytes32("bob_tokenB"));
        vm.stopPrank();
        
        // Check no cross-contamination
        vm.prank(alice);
        (, Withdrawals.erc20Balances[] memory aliceTokens,) = lockx.getFullLockbox(0);
        
        // Alice should only have tokenA, not tokenB
        for (uint i = 0; i < aliceTokens.length; i++) {
            if (aliceTokens[i].tokenAddress == address(tokenA)) {
                assertEq(aliceTokens[i].balance, 1000e18, "Alice tokenA wrong");
            } else if (aliceTokens[i].tokenAddress == address(tokenB)) {
                assertEq(aliceTokens[i].balance, 0, "Alice shouldn't have tokenB");
            }
        }
        
        vm.prank(bob);
        (, Withdrawals.erc20Balances[] memory bobTokens,) = lockx.getFullLockbox(1);
        
        // Bob should only have tokenB, not tokenA
        for (uint i = 0; i < bobTokens.length; i++) {
            if (bobTokens[i].tokenAddress == address(tokenB)) {
                assertEq(bobTokens[i].balance, 2000e18, "Bob tokenB wrong");
            } else if (bobTokens[i].tokenAddress == address(tokenA)) {
                assertEq(bobTokens[i].balance, 0, "Bob shouldn't have tokenA");
            }
        }
    }
    
    function test_multiUser_attackScenarios() public {
        // Alice creates a valuable lockbox
        vm.startPrank(alice);
        lockx.createLockboxWithETH{value: 50 ether}(alice, aliceKeyAddr, bytes32("alice_valuable"));
        tokenA.approve(address(lockx), 5000e18);
        lockx.depositERC20(0, address(tokenA), 5000e18, bytes32("alice_tokens"));
        vm.stopPrank();
        
        // Eve (attacker) tries various attack vectors
        
        // 1. Try to access Alice's lockbox
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.depositETH{value: 0.1 ether}(0, bytes32("attack_deposit"));
        
        // 3. Try to get Alice's nonce (this should actually work as it's view)
        vm.prank(eve);
        vm.expectRevert(abi.encodeWithSignature("NotOwner()"));
        lockx.getNonce(0);
        
        // 4. Try to deposit negative value (not possible with uint)
        vm.prank(eve);
        vm.expectRevert();
        lockx.depositETH{value: 0}(0, bytes32("zero_deposit"));
        
        // Verify Alice's lockbox is intact
        vm.prank(alice);
        (uint256 ethBal, , ) = lockx.getFullLockbox(0);
        assertEq(ethBal, 50 ether, "Alice's ETH should be safe");
    }
    
    function test_multiUser_complexSwapScenario() public {
        // Multiple users create lockboxes and perform swaps
        
        // Alice sets up for tokenA -> tokenB swap
        vm.startPrank(alice);
        tokenA.approve(address(lockx), 3000e18);
        lockx.createLockboxWithERC20(alice, aliceKeyAddr, address(tokenA), 3000e18, bytes32("alice"));
        vm.stopPrank();
        
        // Bob sets up for tokenB -> tokenA swap (but router needs tokenB to give back to Alice)
        vm.startPrank(bob);
        tokenB.approve(address(lockx), 3000e18);
        lockx.createLockboxWithERC20(bob, bobKeyAddr, address(tokenB), 3000e18, bytes32("bob"));
        // Also approve router to have tokenB for swaps
        tokenB.approve(address(router), 1000000e18);
        vm.stopPrank();
        
        // Both perform swaps simultaneously
        _performSwap(0, alice, aliceKey, address(tokenA), address(tokenB), 1000e18);
        _performSwap(1, bob, bobKey, address(tokenB), address(tokenA), 1000e18);
        
        // Verify swaps completed correctly
        vm.prank(alice);
        (, Withdrawals.erc20Balances[] memory aliceTokens,) = lockx.getFullLockbox(0);
        
        uint256 aliceTokenB = 0;
        for (uint i = 0; i < aliceTokens.length; i++) {
            if (aliceTokens[i].tokenAddress == address(tokenB)) {
                aliceTokenB = aliceTokens[i].balance;
            }
        }
        assertGt(aliceTokenB, 0, "Alice should have tokenB after swap");
        
        vm.prank(bob);
        (, Withdrawals.erc20Balances[] memory bobTokens,) = lockx.getFullLockbox(1);
        
        uint256 bobTokenA = 0;
        for (uint i = 0; i < bobTokens.length; i++) {
            if (bobTokens[i].tokenAddress == address(tokenA)) {
                bobTokenA = bobTokens[i].balance;
            }
        }
        assertGt(bobTokenA, 0, "Bob should have tokenA after swap");
    }
    
    function test_multiUser_raceConditions() public {
        // Test potential race conditions with rapid operations
        
        // All users create lockboxes in same block
        vm.prank(alice);
        lockx.createLockboxWithETH{value: 1 ether}(alice, aliceKeyAddr, bytes32("race1"));
        
        vm.prank(bob);
        lockx.createLockboxWithETH{value: 1 ether}(bob, bobKeyAddr, bytes32("race2"));
        
        vm.prank(charlie);
        lockx.createLockboxWithETH{value: 1 ether}(charlie, charlieKeyAddr, bytes32("race3"));
        
        // Rapid deposits from all users
        for (uint i = 0; i < 10; i++) {
            vm.prank(alice);
            lockx.depositETH{value: 0.1 ether}(0, bytes32(uint256(i)));
            
            vm.prank(bob);
            lockx.depositETH{value: 0.1 ether}(1, bytes32(uint256(i)));
            
            vm.prank(charlie);
            lockx.depositETH{value: 0.1 ether}(2, bytes32(uint256(i)));
        }
        
        // Verify all deposits recorded correctly
        vm.prank(alice);
        (uint256 aliceTotal, , ) = lockx.getFullLockbox(0);
        assertEq(aliceTotal, 2 ether, "Alice total wrong");
        
        vm.prank(bob);
        (uint256 bobTotal, , ) = lockx.getFullLockbox(1);
        assertEq(bobTotal, 2 ether, "Bob total wrong");
        
        vm.prank(charlie);
        (uint256 charlieTotal, , ) = lockx.getFullLockbox(2);
        assertEq(charlieTotal, 2 ether, "Charlie total wrong");
    }
    
    function test_multiUser_differentAssetTypes() public {
        // Users with different asset preferences
        
        // Alice prefers ETH
        vm.prank(alice);
        lockx.createLockboxWithETH{value: 30 ether}(alice, aliceKeyAddr, bytes32("eth_user"));
        
        // Bob prefers ERC20 tokens
        vm.startPrank(bob);
        tokenA.approve(address(lockx), 5000e18);
        lockx.createLockboxWithERC20(bob, bobKeyAddr, address(tokenA), 5000e18, bytes32("token_user"));
        tokenB.approve(address(lockx), 3000e18);
        lockx.depositERC20(1, address(tokenB), 3000e18, bytes32("more_tokens"));
        vm.stopPrank();
        
        // Charlie prefers NFTs
        vm.startPrank(charlie);
        lockx.createLockboxWithETH{value: 0.01 ether}(charlie, charlieKeyAddr, bytes32("nft_user"));
        for (uint i = 20; i < 25; i++) {
            nft.approve(address(lockx), i);
            lockx.depositERC721(2, address(nft), i, bytes32(uint256(i)));
        }
        vm.stopPrank();
        
        // Diana uses mixed assets
        vm.startPrank(diana);
        lockx.createLockboxWithETH{value: 10 ether}(diana, dianaKeyAddr, bytes32("mixed_user"));
        tokenA.approve(address(lockx), 1000e18);
        lockx.depositERC20(3, address(tokenA), 1000e18, bytes32("tokens"));
        nft.approve(address(lockx), 30);
        lockx.depositERC721(3, address(nft), 30, bytes32("nft"));
        vm.stopPrank();
        
        // Verify each user's assets are properly isolated
        vm.prank(alice);
        (uint256 aliceETH, , ) = lockx.getFullLockbox(0);
        assertEq(aliceETH, 30 ether, "Alice ETH wrong");
        
        vm.prank(charlie);
        (, , Withdrawals.nftBalances[] memory charlieNFTs) = lockx.getFullLockbox(2);
        assertEq(charlieNFTs.length, 5, "Charlie should have 5 NFTs");
    }
    
    // Helper function for swaps
    function _performSwap(
        uint256 tokenId,
        address user,
        uint256 privateKey,
        address tokenIn,
        address tokenOut,
        uint256 amount
    ) internal {
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        uint256 minOut = amount * 9 / 10; // 10% slippage
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            tokenIn,
            tokenOut,
            amount,
            minOut,
            address(0) // Use address(0) for recipient to send to lockbox
        );
        
        bytes memory data = abi.encode(
            tokenId,
            tokenIn,
            tokenOut,
            amount,
            minOut,
            address(router),
            keccak256(swapData),
            bytes32("swap"),
            user,
            block.timestamp + 1 hours,
            address(0) // Credit output to lockbox, not to user
        );
        
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        vm.prank(user);
        lockx.swapInLockbox(
            tokenId,
            messageHash,
            signature,
            tokenIn,
            tokenOut,
            amount,
            minOut,
            address(router),
            swapData,
            bytes32("swap"),
            block.timestamp + 1 hours,
            address(0) // Credit output to lockbox, not to user
        );
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) internal view returns (bytes32) {
        bytes32 OPERATION_TYPEHASH = keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
        bytes32 EIP712_DOMAIN_TYPEHASH = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
        
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes('Lockx')),
            keccak256(bytes('3')),
            block.chainid,
            address(lockx)
        ));
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}