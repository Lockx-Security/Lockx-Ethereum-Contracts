// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';
import '../../contracts/Lockx.sol';
import '../../contracts/mocks/MockERC20.sol';

/**
 * @title LockxArrayInvestigation
 * @notice Investigate what happens to token arrays when balances go to 0
 */
contract LockxArrayInvestigation is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    
    address public user = makeAddr("user");
    uint256 private userKey = 0x1234;
    address public keyAddr;
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenA.initialize("Token A", "TOKA");
        
        keyAddr = vm.addr(userKey);
        
        vm.deal(user, 100 ether);
        tokenA.mint(user, 1000e18);
        
        // Create lockbox
        vm.prank(user);
        lockx.createLockboxWithETH{value: 1 ether}(user, keyAddr, bytes32("test"));
    }
    
    function test_investigateTokenArrayBehavior() public {
        uint256 tokenId = 0;
        
        vm.startPrank(user);
        
        // 1. Deposit some tokenA
        tokenA.approve(address(lockx), 100e18);
        lockx.depositERC20(tokenId, address(tokenA), 100e18, bytes32("deposit"));
        
        // Check state after deposit
        (, Lockx.erc20Balances[] memory tokens1, ) = lockx.getFullLockbox(tokenId);
        console.log("After deposit:");
        console.log("  Array length:", tokens1.length);
        if (tokens1.length > 0) {
            console.log("  Token balance:", tokens1[0].balance);
        }
        
        // 2. Withdraw ALL tokens to simulate balance going to 0
        // We'll use ERC20 transfer to move tokens out of the contract
        // This simulates what would happen after a swap or withdrawal
        
        vm.stopPrank();
        
        // Artificially set balance to 0 by having the contract transfer tokens away
        // This requires we have a way to drain the tokens
        tokenA.mint(address(lockx), 100e18); // First mint tokens to lockx
        
        vm.prank(address(lockx));
        tokenA.transfer(user, 100e18); // Transfer them away
        
        vm.prank(user);
        (, Lockx.erc20Balances[] memory tokens2, ) = lockx.getFullLockbox(tokenId);
        console.log("After manually draining contract balance:");
        console.log("  Array length:", tokens2.length);
        if (tokens2.length > 0) {
            console.log("  Token balance:", tokens2[0].balance);
        }
        
        // The key question: does the array still contain the token address
        // even though the balance is now 0?
        
        assertTrue(true, "Investigation complete");
    }
    
    function test_simpleDepositAndCheck() public {
        uint256 tokenId = 0;
        
        vm.startPrank(user);
        
        // Just deposit and check - simple case
        tokenA.approve(address(lockx), 100e18);
        lockx.depositERC20(tokenId, address(tokenA), 100e18, bytes32("deposit"));
        
        (, Lockx.erc20Balances[] memory tokens, ) = lockx.getFullLockbox(tokenId);
        
        console.log("Simple test - Array length:", tokens.length);
        assertEq(tokens.length, 1, "Should have 1 token");
        assertEq(tokens[0].balance, 100e18, "Should have correct balance");
        
        vm.stopPrank();
    }
}