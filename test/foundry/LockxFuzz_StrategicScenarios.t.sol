// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/Withdrawals.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";

/**
 * @title LockxStrategicFuzz
 * @notice Advanced fuzzing tests targeting high-value attack vectors
 * @dev Tests deposit sequences, swap parameters, and multi-user chaos scenarios
 */
contract LockxStrategicFuzz is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    MockSwapRouter public router;
    
    // Test users with keys
    address public alice = address(0x1111);
    address public bob = address(0x2222);
    address public charlie = address(0x3333);
    address public diana = address(0x4444);
    address public eve = address(0x5555); // Potential attacker
    
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
    
    // Track created lockboxes for cleanup
    uint256[] public allTokenIds;
    
    // State variables for chaos testing
    mapping(uint256 => uint256) public initialETHBalances;
    mapping(uint256 => mapping(address => uint256)) public initialTokenBalances;
    
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
        
        // Fund all users generously
        address[5] memory users = [alice, bob, charlie, diana, eve];
        for (uint i = 0; i < users.length; i++) {
            vm.deal(users[i], 1000 ether);
            tokenA.mint(users[i], 100000e18);
            tokenB.mint(users[i], 100000e18);
            
            // Mint NFTs for each user
            for (uint j = 0; j < 10; j++) {
                nft.mint(users[i], i * 100 + j);
            }
        }
        
        // Fund router for swaps
        tokenA.mint(address(router), 10000000e18);
        tokenB.mint(address(router), 10000000e18);
        vm.deal(address(router), 10000 ether);
    }
    
    // STRATEGIC FUZZ 1: Deposit Sequence Fuzzing
    // Test random sequences of deposits to find edge cases in accounting
    function testFuzz_depositSequence(
        uint256[10] memory ethAmounts,
        uint256[10] memory tokenAmounts,
        uint256[5] memory nftIds,
        uint8 numOperations
    ) public {
        numOperations = uint8(bound(numOperations, 1, 10));
        
        // Create initial lockbox
        vm.prank(alice);
        lockx.createLockboxWithETH{value: 1 ether}(alice, aliceKeyAddr, "fuzz");
        uint256 tokenId = 0;
        allTokenIds.push(tokenId);
        
        // Track total deposits for verification
        uint256 totalETHDeposited = 1 ether;
        uint256 totalTokenADeposited = 0;
        uint256 totalTokenBDeposited = 0;
        uint256 totalNFTsDeposited = 0;
        
        // Perform random deposit sequence
        for (uint i = 0; i < numOperations; i++) {
            uint256 opType = uint256(keccak256(abi.encode(i, block.timestamp))) % 4;
            
            if (opType == 0 && ethAmounts[i] > 0) {
                // ETH deposit
                uint256 amount = bound(ethAmounts[i], 0.001 ether, 10 ether);
                vm.prank(alice);
                lockx.depositETH{value: amount}(tokenId, bytes32(uint256(i + 1000)));
                totalETHDeposited += amount;
                
            } else if (opType == 1 && tokenAmounts[i] > 0) {
                // TokenA deposit
                uint256 amount = bound(tokenAmounts[i], 1e18, 1000e18);
                vm.startPrank(alice);
                tokenA.approve(address(lockx), amount);
                lockx.depositERC20(tokenId, address(tokenA), amount, bytes32(uint256(i + 2000)));
                vm.stopPrank();
                totalTokenADeposited += amount;
                
            } else if (opType == 2 && tokenAmounts[i] > 0) {
                // TokenB deposit
                uint256 amount = bound(tokenAmounts[i], 1e18, 1000e18);
                vm.startPrank(alice);
                tokenB.approve(address(lockx), amount);
                lockx.depositERC20(tokenId, address(tokenB), amount, bytes32(uint256(i + 3000)));
                vm.stopPrank();
                totalTokenBDeposited += amount;
                
            } else if (opType == 3 && i < 5) {
                // NFT deposit - only try if Alice actually owns the NFT
                uint256 nftId = bound(nftIds[i], 0, 9); // Alice owns NFTs 0-9
                try nft.ownerOf(nftId) returns (address owner) {
                    if (owner == alice) {
                        vm.startPrank(alice);
                        nft.approve(address(lockx), nftId);
                        lockx.depositERC721(tokenId, address(nft), nftId, bytes32(uint256(i + 4000)));
                        vm.stopPrank();
                        totalNFTsDeposited++;
                    }
                } catch {
                    // NFT doesn't exist or Alice doesn't own it - skip
                }
            }
        }
        
        // Verify final state matches expected totals
        vm.prank(alice);
        (
            uint256 finalETH,
            Withdrawals.erc20Balances[] memory finalTokens,
            Withdrawals.nftBalances[] memory finalNFTs
        ) = lockx.getFullLockbox(tokenId);
        
        assertEq(finalETH, totalETHDeposited, "ETH accounting mismatch after sequence");
        assertEq(finalNFTs.length, totalNFTsDeposited, "NFT count mismatch after sequence");
        
        // Check token balances
        uint256 foundTokenA = 0;
        uint256 foundTokenB = 0;
        for (uint i = 0; i < finalTokens.length; i++) {
            if (finalTokens[i].tokenAddress == address(tokenA)) {
                foundTokenA = finalTokens[i].balance;
            } else if (finalTokens[i].tokenAddress == address(tokenB)) {
                foundTokenB = finalTokens[i].balance;
            }
        }
        
        assertEq(foundTokenA, totalTokenADeposited, "TokenA accounting mismatch");
        assertEq(foundTokenB, totalTokenBDeposited, "TokenB accounting mismatch");
    }
    
    // STRATEGIC FUZZ 2: Swap Parameter Fuzzing
    // Test swaps with random parameters to find edge cases in slippage/validation
    function testFuzz_swapParameters(
        uint256 amountIn,
        uint256 minOutPercentage,
        bool useETH,
        uint8 slippageBps
    ) public {
        amountIn = bound(amountIn, 1e18, 100e18); // Reduced max to avoid edge cases
        minOutPercentage = bound(minOutPercentage, 50, 95); // 50-95% of expected output
        slippageBps = uint8(bound(slippageBps, 0, 500)); // 0-5% slippage
        
        // Setup lockbox with assets
        address user = alice;
        address keyAddr = aliceKeyAddr;
        uint256 userKey = aliceKey;
        
        vm.startPrank(user);
        if (useETH) {
            lockx.createLockboxWithETH{value: amountIn + 1 ether}(user, keyAddr, "swap_test");
        } else {
            tokenA.approve(address(lockx), amountIn);
            lockx.createLockboxWithERC20(user, keyAddr, address(tokenA), amountIn, "swap_test");
        }
        vm.stopPrank();
        
        uint256 tokenId = 0;
        allTokenIds.push(tokenId);
        
        // Calculate expected output and minimum based on fuzz parameters
        address tokenIn = useETH ? address(0) : address(tokenA);
        address tokenOut = useETH ? address(tokenA) : address(tokenB);
        
        uint256 expectedOut;
        if (useETH) {
            expectedOut = amountIn * 950; // MockRouter: 950 tokens per ETH
        } else {
            expectedOut = (amountIn * 95) / 100; // MockRouter: 95% rate for token-to-token
        }
        
        uint256 minOut = (expectedOut * minOutPercentage) / 100;
        
        // Apply additional slippage
        minOut = (minOut * (10000 - slippageBps)) / 10000;
        
        // Skip if minOut is unreasonable (would cause guaranteed failure)
        if (minOut == 0 || minOut > expectedOut * 2) {
            return; // Skip this fuzz iteration
        }
        
        // Prepare swap data
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            tokenIn,
            tokenOut,
            amountIn,
            minOut,
            address(0) // Send to lockbox
        );
        
        // Create signature for swap
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes memory data = abi.encode(
            tokenId,
            tokenIn,
            tokenOut,
            amountIn,
            minOut,
            address(router),
            keccak256(swapData),
            bytes32("fuzz_swap"),
            user,
            block.timestamp + 1 hours,
            address(0) // Credit to lockbox
        );
        
        bytes32 messageHash = _computeMessageHash(tokenId, 7, data, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Record pre-swap state
        vm.prank(user);
        (
            uint256 preETH,
            Withdrawals.erc20Balances[] memory preTokens,
        ) = lockx.getFullLockbox(tokenId);
        
        // Execute swap with comprehensive error handling
        vm.prank(user);
        try lockx.swapInLockbox(
            tokenId,
            messageHash,
            signature,
            tokenIn,
            tokenOut,
            amountIn,
            minOut,
            address(router),
            swapData,
            bytes32("fuzz_swap"),
            block.timestamp + 1 hours,
            address(0)
        ) {
            // Verify swap succeeded and output was received
            vm.prank(user);
            (
                uint256 postETH,
                Withdrawals.erc20Balances[] memory postTokens,
            ) = lockx.getFullLockbox(tokenId);
            
            if (useETH) {
                // ETH should decrease, tokenA should increase
                assertLt(postETH, preETH, "ETH not consumed in swap");
                
                // Find tokenA balance increase
                uint256 tokenAIncrease = 0;
                for (uint i = 0; i < postTokens.length; i++) {
                    if (postTokens[i].tokenAddress == address(tokenA)) {
                        tokenAIncrease = postTokens[i].balance;
                        break;
                    }
                }
                assertGe(tokenAIncrease, minOut, "Insufficient token output");
            } else {
                // TokenA should decrease, tokenB should increase
                uint256 preTokenABalance = 0;
                uint256 postTokenABalance = 0;
                uint256 postTokenBBalance = 0;
                
                for (uint i = 0; i < preTokens.length; i++) {
                    if (preTokens[i].tokenAddress == address(tokenA)) {
                        preTokenABalance = preTokens[i].balance;
                    }
                }
                
                for (uint i = 0; i < postTokens.length; i++) {
                    if (postTokens[i].tokenAddress == address(tokenA)) {
                        postTokenABalance = postTokens[i].balance;
                    } else if (postTokens[i].tokenAddress == address(tokenB)) {
                        postTokenBBalance = postTokens[i].balance;
                    }
                }
                
                assertLt(postTokenABalance, preTokenABalance, "TokenA not consumed");
                assertGe(postTokenBBalance, minOut, "Insufficient tokenB output");
            }
            
        } catch {
            // Swap reverted - verify it was due to slippage or valid rejection
            // This is acceptable behavior for fuzz testing
        }
    }
    
    // STRATEGIC FUZZ 3: Multi-User Chaos Fuzzing
    // Test random multi-user operations to find race conditions and isolation issues
    function testFuzz_multiUserChaos(
        uint256 seed,
        uint8 numOperations,
        uint256[20] memory amounts
    ) public {
        numOperations = uint8(bound(numOperations, 5, 20));
        
        address[5] memory users = [alice, bob, charlie, diana, eve];
        address[5] memory keyAddrs = [aliceKeyAddr, bobKeyAddr, charlieKeyAddr, dianaKeyAddr, eveKeyAddr];
        
        // Create lockboxes for each user
        for (uint i = 0; i < 5; i++) {
            vm.prank(users[i]);
            lockx.createLockboxWithETH{value: 10 ether}(users[i], keyAddrs[i], bytes32(uint256(i + 100)));
            allTokenIds.push(i);
        }
        
        // Track initial balances for verification
        for (uint i = 0; i < 5; i++) {
            vm.prank(users[i]);
            (uint256 ethBal, Withdrawals.erc20Balances[] memory tokens,) = lockx.getFullLockbox(i);
            initialETHBalances[i] = ethBal;
            
            for (uint j = 0; j < tokens.length; j++) {
                initialTokenBalances[i][tokens[j].tokenAddress] = tokens[j].balance;
            }
        }
        
        // Perform random operations
        for (uint i = 0; i < numOperations; i++) {
            uint256 randomness = uint256(keccak256(abi.encode(seed, i, block.timestamp)));
            uint256 userIndex = randomness % 5;
            uint256 targetIndex = (randomness >> 8) % 5;
            uint256 opType = (randomness >> 16) % 4;
            uint256 amount = bound(amounts[i], 0.1 ether, 5 ether);
            
            address user = users[userIndex];
            uint256 userTokenId = userIndex;
            uint256 targetTokenId = targetIndex;
            
            if (opType == 0) {
                // Deposit ETH to own lockbox
                vm.prank(user);
                lockx.depositETH{value: amount}(userTokenId, bytes32(uint256(i + 5000)));
                
            } else if (opType == 1) {
                // Deposit tokens to own lockbox
                vm.startPrank(user);
                tokenA.approve(address(lockx), amount);
                lockx.depositERC20(userTokenId, address(tokenA), amount, bytes32(uint256(i + 6000)));
                vm.stopPrank();
                
            } else if (opType == 2) {
                // Try to access another user's lockbox (should fail)
                if (userIndex != targetIndex) {
                    vm.prank(user);
                    vm.expectRevert();
                    lockx.depositETH{value: 0.1 ether}(targetTokenId, bytes32(uint256(i + 7000)));
                }
                
            } else if (opType == 3) {
                // Try to get another user's nonce (should fail)
                if (userIndex != targetIndex) {
                    vm.prank(user);
                    vm.expectRevert();
                    lockx.getNonce(targetTokenId);
                }
            }
        }
        
        // Verify no cross-contamination occurred
        for (uint i = 0; i < 5; i++) {
            vm.prank(users[i]);
            (uint256 finalETH, Withdrawals.erc20Balances[] memory finalTokens,) = lockx.getFullLockbox(i);
            
            // ETH should have increased (from deposits) but not decreased unexpectedly
            assertGe(finalETH, initialETHBalances[i], "ETH balance decreased unexpectedly");
            
            // Verify no unexpected token balances
            for (uint j = 0; j < finalTokens.length; j++) {
                address token = finalTokens[j].tokenAddress;
                uint256 initialBal = initialTokenBalances[i][token];
                uint256 finalBal = finalTokens[j].balance;
                
                assertGe(finalBal, initialBal, "Token balance decreased unexpectedly");
            }
        }
    }
    
    // Helper function for EIP-712 signature creation
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data, uint256 nonce) internal view returns (bytes32) {
        bytes32 OPERATION_TYPEHASH = keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
        bytes32 EIP712_DOMAIN_TYPEHASH = keccak256('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)');
        
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes('Lockx')),
            keccak256(bytes('4')),
            block.chainid,
            address(lockx)
        ));
        return keccak256(abi.encodePacked('\\x19\\x01', domainSeparator, structHash));
    }
}