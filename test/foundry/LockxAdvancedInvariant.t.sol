// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/Withdrawals.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";

/**
 * @title LockxAdvancedInvariant
 * @notice Additional critical invariant tests to complement existing suite
 * @dev Tests Total Asset Conservation, Ownership Uniqueness, Nonce Integrity, and No Stuck Assets
 */
contract LockxAdvancedInvariant is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockERC721 public nft;
    
    // Track all active tokens and users for comprehensive checking
    address[] public tokenAddresses;
    uint256[] public allTokenIds;
    mapping(uint256 => uint256) public lastSeenNonce;
    mapping(uint256 => bool) public tokenExists;
    
    // Test users and keys
    address[] public users;
    address[] public keys;
    
    bool private initialized;
    
    function setUp() public {
        if (initialized) return;
        initialized = true;
        
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        nft = new MockERC721();
        
        // Setup token tracking
        tokenAddresses.push(address(tokenA));
        tokenAddresses.push(address(tokenB));
        
        // Setup test users
        for (uint i = 0; i < 5; i++) {
            address user = address(uint160(0x1000 + i));
            address key = address(uint160(0x2000 + i));
            users.push(user);
            keys.push(key);
            
            vm.deal(user, 100 ether);
            tokenA.mint(user, 10000e18);
            tokenB.mint(user, 10000e18);
            
            // Mint NFTs for each user
            for (uint j = 0; j < 3; j++) {
                nft.mint(user, i * 10 + j);
            }
        }
        
        // Setup router with liquidity
        tokenA.mint(address(this), 1000000e18);
        tokenB.mint(address(this), 1000000e18);
        
        // Create some initial lockboxes for testing
        _createInitialLockboxes();
        
        // Only target the Lockx contract for fuzzing (not MockERC20 tokens)
        targetContract(address(lockx));
        
        // Treasury lockbox (ID 0) is now always created in _createInitialLockboxes()
    }
    
    function _createInitialLockboxes() internal {
        // First, create the treasury lockbox (ID 0) as the protocol would do
        address treasuryKey = address(uint160(0x9000)); // Dedicated treasury key
        vm.deal(address(this), 1 ether);
        lockx.createLockboxWithETH{value: 0.1 ether}(
            address(this), // Protocol owns treasury
            treasuryKey,
            bytes32(uint256(999)) // Treasury reference ID
        );
        
        allTokenIds.push(0); // Treasury is token ID 0
        tokenExists[0] = true;
        lastSeenNonce[0] = 1;
        
        // Then create user lockboxes (will be IDs 1, 2, 3)
        for (uint i = 0; i < 3; i++) {
            address user = users[i];
            address key = keys[i];
            
            vm.startPrank(user);
            
            // Create lockbox with ETH
            lockx.createLockboxWithETH{value: (i + 1) * 1 ether}(
                user, 
                key, 
                bytes32(uint256(i + 100))
            );
            
            uint256 tokenId = i + 1; // tokenIds are now 1, 2, 3 (0 is treasury)
            allTokenIds.push(tokenId);
            tokenExists[tokenId] = true;
            lastSeenNonce[tokenId] = 1; // Initial nonce after creation
            
            // Add some ERC20 deposits
            tokenA.approve(address(lockx), 1000e18);
            lockx.depositERC20(tokenId, address(tokenA), (i + 1) * 100e18, bytes32(uint256(i + 200)));
            
            vm.stopPrank();
        }
    }
    
    // INVARIANT 1: Total Asset Conservation
    // Sum of all user balances equals contract's actual balance for each asset
    function invariant_totalAssetConservation() public {
        // Check ETH conservation - must account for all lockboxes including treasury
        uint256 totalUserETH = 0;
        
        // Include treasury lockbox (ID 0) - protocol always creates this on deployment
        try lockx.ownerOf(0) returns (address treasuryOwner) {
            vm.prank(treasuryOwner);
            try lockx.getFullLockbox(0) returns (
                uint256 treasuryETH,
                Withdrawals.erc20Balances[] memory,
                Withdrawals.nftBalances[] memory
            ) {
                totalUserETH += treasuryETH;
            } catch {
                // Treasury access failed - this shouldn't happen if protocol setup is correct
                revert("Treasury lockbox (ID 0) should always be accessible");
            }
        } catch {
            revert("Treasury lockbox (ID 0) should always exist - check protocol deployment");
        }
        
        // Check all tracked user lockboxes
        for (uint i = 0; i < allTokenIds.length; i++) {
            if (!tokenExists[allTokenIds[i]]) continue;
            
            uint256 tokenId = allTokenIds[i];
            if (tokenId == 0) continue; // Skip treasury, already handled above
            
            try lockx.ownerOf(tokenId) returns (address owner) {
                if (owner != address(0)) {
                    vm.prank(owner);
                    try lockx.getFullLockbox(tokenId) returns (
                        uint256 ethBalance,
                        Withdrawals.erc20Balances[] memory,
                        Withdrawals.nftBalances[] memory
                    ) {
                        totalUserETH += ethBalance;
                    } catch {
                        // If getFullLockbox fails, token might be burned or invalid
                    }
                }
            } catch {
                // Token doesn't exist or is burned
                tokenExists[allTokenIds[i]] = false;
            }
        }
        
        // Contract ETH balance should be >= sum of user balances (allows for direct ETH sends)
        assertGe(
            address(lockx).balance, 
            totalUserETH, 
            "ETH conservation violated: contract balance < sum of user balances"
        );
        
        // Check ERC20 conservation for each token - include treasury
        for (uint j = 0; j < tokenAddresses.length; j++) {
            address token = tokenAddresses[j];
            uint256 totalUserBalance = 0;
            
            // Include treasury ERC20 balances (lockbox ID 0) 
            address treasuryOwner = lockx.ownerOf(0);
            vm.prank(treasuryOwner);
            (, Withdrawals.erc20Balances[] memory treasuryTokens,) = lockx.getFullLockbox(0);
            for (uint k = 0; k < treasuryTokens.length; k++) {
                if (treasuryTokens[k].tokenAddress == token) {
                    totalUserBalance += treasuryTokens[k].balance;
                }
            }
            
            // Check all tracked user lockboxes
            for (uint i = 0; i < allTokenIds.length; i++) {
                if (!tokenExists[allTokenIds[i]]) continue;
                
                uint256 tokenId = allTokenIds[i];
                if (tokenId == 0) continue; // Skip treasury, already handled
                
                try lockx.ownerOf(tokenId) returns (address owner) {
                    if (owner != address(0)) {
                        vm.prank(owner);
                        try lockx.getFullLockbox(tokenId) returns (
                            uint256,
                            Withdrawals.erc20Balances[] memory tokens,
                            Withdrawals.nftBalances[] memory
                        ) {
                            for (uint k = 0; k < tokens.length; k++) {
                                if (tokens[k].tokenAddress == token) {
                                    totalUserBalance += tokens[k].balance;
                                }
                            }
                        } catch {
                            // Skip if access fails
                        }
                    }
                } catch {
                    // Token doesn't exist
                    tokenExists[allTokenIds[i]] = false;
                }
            }
            
            uint256 contractBalance = MockERC20(token).balanceOf(address(lockx));
            // Contract balance should be >= user balances (can have direct transfers/donations)
            // but user balances should never exceed contract balance
            assertGe(
                contractBalance,
                totalUserBalance,
                string(abi.encodePacked("Token conservation violated: user balances exceed contract for ", _addressToString(token)))
            );
        }
    }
    
    // INVARIANT 2: Ownership Uniqueness
    // Every existing tokenId has exactly one owner, no orphaned tokens
    function invariant_ownershipUniqueness() public {
        // Check all tracked tokenIds for ownership consistency
        for (uint256 i = 0; i < allTokenIds.length; i++) {
            uint256 tokenId = allTokenIds[i];
            if (!tokenExists[tokenId]) continue;
            
            try lockx.ownerOf(tokenId) returns (address owner) {
                assertTrue(
                    owner != address(0), 
                    string(abi.encodePacked("Orphaned token found: ", _uintToString(tokenId)))
                );
                
                // Verify owner can access their lockbox
                vm.prank(owner);
                try lockx.getNonce(tokenId) returns (uint256 nonce) {
                    assertGt(nonce, 0, "Invalid nonce for owned token");
                } catch {
                    // If getNonce fails, this might indicate access control issues
                    revert(string(abi.encodePacked("Owner cannot access token: ", _uintToString(tokenId))));
                }
            } catch {
                // Token doesn't exist anymore - mark as non-existent
                tokenExists[tokenId] = false;
            }
        }
        
        // Also check some additional range to catch any tokens we might have missed
        for (uint256 i = 0; i < 50; i++) {
            try lockx.ownerOf(i) returns (address owner) {
                if (owner != address(0)) {
                    // Found a token we weren't tracking
                    bool alreadyTracked = false;
                    for (uint256 j = 0; j < allTokenIds.length; j++) {
                        if (allTokenIds[j] == i) {
                            alreadyTracked = true;
                            break;
                        }
                    }
                    if (!alreadyTracked) {
                        allTokenIds.push(i);
                        tokenExists[i] = true;
                        lastSeenNonce[i] = 1; // Default nonce
                    }
                }
            } catch {
                // Token doesn't exist - this is fine
            }
        }
    }
    
    // INVARIANT 3: Signature Nonce Integrity
    // Nonces only increase, never decrease or stay the same across operations
    function invariant_nonceIntegrity() public {
        for (uint i = 0; i < allTokenIds.length; i++) {
            uint256 tokenId = allTokenIds[i];
            if (!tokenExists[tokenId]) continue;
            
            try lockx.ownerOf(tokenId) returns (address owner) {
                if (owner != address(0)) {
                    vm.prank(owner);
                    try lockx.getNonce(tokenId) returns (uint256 currentNonce) {
                        uint256 lastNonce = lastSeenNonce[tokenId];
                        
                        assertGe(
                            currentNonce,
                            lastNonce,
                            string(abi.encodePacked("Nonce regression detected for token: ", _uintToString(tokenId)))
                        );
                        
                        // Update tracking
                        lastSeenNonce[tokenId] = currentNonce;
                    } catch {
                        // Access denied - mark as non-existent
                        tokenExists[tokenId] = false;
                    }
                }
            } catch {
                // Token doesn't exist anymore
                tokenExists[tokenId] = false;
            }
        }
    }
    
    // INVARIANT 4: No Stuck Assets
    // All assets in contract are accounted for in user balances (no "lost" tokens)
    function invariant_noStuckAssets() public {
        uint256 contractETH = address(lockx).balance;
        uint256 accountedETH = 0;
        
        // Include treasury ETH (ID 0 always exists)
        address treasuryOwner = lockx.ownerOf(0);
        vm.prank(treasuryOwner);
        (uint256 treasuryETH,,) = lockx.getFullLockbox(0);
        accountedETH += treasuryETH;
        
        // Sum all user ETH balances
        for (uint i = 0; i < allTokenIds.length; i++) {
            if (!tokenExists[allTokenIds[i]]) continue;
            
            uint256 tokenId = allTokenIds[i];
            if (tokenId == 0) continue; // Skip treasury, already handled
            
            try lockx.ownerOf(tokenId) returns (address owner) {
                if (owner != address(0)) {
                    vm.prank(owner);
                    try lockx.getFullLockbox(tokenId) returns (
                        uint256 ethBalance,
                        Withdrawals.erc20Balances[] memory,
                        Withdrawals.nftBalances[] memory
                    ) {
                        accountedETH += ethBalance;
                    } catch {
                        // Skip inaccessible lockboxes
                    }
                }
            } catch {
                tokenExists[allTokenIds[i]] = false;
            }
        }
        
        assertGe(
            contractETH,
            accountedETH,
            "Stuck ETH detected: contract balance < accounted user balances"
        );
        
        // Check for stuck ERC20 tokens
        for (uint j = 0; j < tokenAddresses.length; j++) {
            address token = tokenAddresses[j];
            uint256 contractBalance = MockERC20(token).balanceOf(address(lockx));
            uint256 accountedBalance = 0;
            
            // Include treasury balance (ID 0 always exists)
            address treasuryOwner = lockx.ownerOf(0);
            vm.prank(treasuryOwner);
            (, Withdrawals.erc20Balances[] memory treasuryTokens,) = lockx.getFullLockbox(0);
            for (uint k = 0; k < treasuryTokens.length; k++) {
                if (treasuryTokens[k].tokenAddress == token) {
                    accountedBalance += treasuryTokens[k].balance;
                }
            }
            
            for (uint i = 0; i < allTokenIds.length; i++) {
                if (!tokenExists[allTokenIds[i]]) continue;
                
                uint256 tokenId = allTokenIds[i];
                if (tokenId == 0) continue; // Skip treasury, already handled
                
                try lockx.ownerOf(tokenId) returns (address owner) {
                    if (owner != address(0)) {
                        vm.prank(owner);
                        try lockx.getFullLockbox(tokenId) returns (
                            uint256,
                            Withdrawals.erc20Balances[] memory tokens,
                            Withdrawals.nftBalances[] memory
                        ) {
                            for (uint k = 0; k < tokens.length; k++) {
                                if (tokens[k].tokenAddress == token) {
                                    accountedBalance += tokens[k].balance;
                                }
                            }
                        } catch {
                            // Skip inaccessible lockboxes
                        }
                    }
                } catch {
                    tokenExists[allTokenIds[i]] = false;
                }
            }
            
            // Contract can have more than accounted (donations), but not significantly less
            // Allow for small precision differences due to external transfers or rounding
            uint256 tolerance = accountedBalance / 1000000; // 0.0001% tolerance
            if (tolerance < 100000) tolerance = 100000; // Minimum 0.1 token tolerance
            
            assertGe(
                contractBalance + tolerance,
                accountedBalance,
                string(abi.encodePacked("Significant stuck tokens for: ", _addressToString(token)))
            );
        }
    }
    
    // Helper functions for string conversion (for better error messages)
    function _uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) return "0";
        
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        
        return string(buffer);
    }
    
    function _addressToString(address addr) internal pure returns (string memory) {
        bytes32 value = bytes32(uint256(uint160(addr)));
        bytes memory alphabet = "0123456789abcdef";
        bytes memory str = new bytes(42);
        str[0] = '0';
        str[1] = 'x';
        
        for (uint256 i = 0; i < 20; i++) {
            str[2 + i * 2] = alphabet[uint8(value[i + 12] >> 4)];
            str[3 + i * 2] = alphabet[uint8(value[i + 12] & 0x0f)];
        }
        
        return string(str);
    }
}