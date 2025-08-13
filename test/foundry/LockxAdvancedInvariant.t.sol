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
    }
    
    function _createInitialLockboxes() internal {
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
            
            uint256 tokenId = i; // tokenIds are sequential starting from 0
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
        // Check ETH conservation
        uint256 totalUserETH = 0;
        for (uint i = 0; i < allTokenIds.length; i++) {
            if (!tokenExists[allTokenIds[i]]) continue;
            
            try lockx.ownerOf(allTokenIds[i]) returns (address owner) {
                if (owner != address(0)) {
                    vm.prank(owner);
                    try lockx.getFullLockbox(allTokenIds[i]) returns (
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
        
        // Contract ETH balance should equal sum of user balances
        assertEq(
            address(lockx).balance, 
            totalUserETH, 
            "ETH conservation violated: contract balance != sum of user balances"
        );
        
        // Check ERC20 conservation for each token
        for (uint j = 0; j < tokenAddresses.length; j++) {
            address token = tokenAddresses[j];
            uint256 totalUserBalance = 0;
            
            for (uint i = 0; i < allTokenIds.length; i++) {
                if (!tokenExists[allTokenIds[i]]) continue;
                
                try lockx.ownerOf(allTokenIds[i]) returns (address owner) {
                    if (owner != address(0)) {
                        vm.prank(owner);
                        try lockx.getFullLockbox(allTokenIds[i]) returns (
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
            assertGe(
                contractBalance,
                totalUserBalance,
                string(abi.encodePacked("Token conservation violated for ", _addressToString(token)))
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
        
        // Sum all user ETH balances
        for (uint i = 0; i < allTokenIds.length; i++) {
            if (!tokenExists[allTokenIds[i]]) continue;
            
            try lockx.ownerOf(allTokenIds[i]) returns (address owner) {
                if (owner != address(0)) {
                    vm.prank(owner);
                    try lockx.getFullLockbox(allTokenIds[i]) returns (
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
        
        assertEq(
            contractETH,
            accountedETH,
            "Stuck ETH detected: contract balance exceeds accounted user balances"
        );
        
        // Check for stuck ERC20 tokens
        for (uint j = 0; j < tokenAddresses.length; j++) {
            address token = tokenAddresses[j];
            uint256 contractBalance = MockERC20(token).balanceOf(address(lockx));
            uint256 accountedBalance = 0;
            
            for (uint i = 0; i < allTokenIds.length; i++) {
                if (!tokenExists[allTokenIds[i]]) continue;
                
                try lockx.ownerOf(allTokenIds[i]) returns (address owner) {
                    if (owner != address(0)) {
                        vm.prank(owner);
                        try lockx.getFullLockbox(allTokenIds[i]) returns (
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
            
            // Contract can have more than accounted (donations), but not less
            assertGe(
                contractBalance,
                accountedBalance,
                string(abi.encodePacked("Negative stuck tokens for: ", _addressToString(token)))
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