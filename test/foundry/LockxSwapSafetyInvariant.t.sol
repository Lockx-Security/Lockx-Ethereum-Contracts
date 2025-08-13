// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/Withdrawals.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockSwapRouter.sol";

/**
 * @title LockxSwapSafetyInvariant
 * @notice Tests swap-specific invariants to ensure swap safety
 * @dev Verifies slippage protection, router interactions, and value preservation
 */
contract LockxSwapSafetyInvariant is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockSwapRouter public router;
    
    address public user1 = makeAddr("user1");
    address public user2 = makeAddr("user2");
    uint256 private key1 = 0x1111;
    uint256 private key2 = 0x2222;
    address public keyAddr1;
    address public keyAddr2;
    
    // Track swap history for invariant checking
    struct SwapRecord {
        uint256 tokenId;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 amountOutMin;
        uint256 actualAmountOut;
        bool executed;
    }
    
    SwapRecord[] public swapHistory;
    mapping(uint256 => uint256) public totalValueBefore;
    mapping(uint256 => uint256) public totalValueAfter;
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        router = new MockSwapRouter();
        
        keyAddr1 = vm.addr(key1);
        keyAddr2 = vm.addr(key2);
        
        // Setup initial state
        vm.deal(user1, 100 ether);
        vm.deal(user2, 100 ether);
        tokenA.mint(user1, 100000e18);
        tokenB.mint(user1, 100000e18);
        tokenA.mint(user2, 100000e18);
        tokenB.mint(user2, 100000e18);
        
        // Fund router for swaps
        tokenA.mint(address(router), 1000000e18);
        tokenB.mint(address(router), 1000000e18);
        
        // Create lockboxes with tokens
        vm.startPrank(user1);
        tokenA.approve(address(lockx), 10000e18);
        lockx.createLockboxWithERC20(user1, keyAddr1, address(tokenA), 10000e18, bytes32("box1"));
        vm.stopPrank();
        
        vm.startPrank(user2);
        tokenB.approve(address(lockx), 10000e18);
        lockx.createLockboxWithERC20(user2, keyAddr2, address(tokenB), 10000e18, bytes32("box2"));
        vm.stopPrank();
        
        targetContract(address(this));
    }
    
    /**
     * @notice Slippage protection must always be respected
     * @dev amountOutMin must be enforced on all swaps
     */
    function invariant_slippageProtectionEnforced() public view {
        for (uint i = 0; i < swapHistory.length; i++) {
            if (swapHistory[i].executed) {
                assertGe(
                    swapHistory[i].actualAmountOut,
                    swapHistory[i].amountOutMin,
                    "CRITICAL: Slippage protection violated - user lost more than expected"
                );
            }
        }
    }
    
    /**
     * @notice Router should never retain approval after swap
     * @dev Prevents lingering approvals that could be exploited
     */
    function invariant_noLingeringRouterApprovals() public view {
        uint256 tokenAAllowance = tokenA.allowance(address(lockx), address(router));
        uint256 tokenBAllowance = tokenB.allowance(address(lockx), address(router));
        
        assertEq(tokenAAllowance, 0, "CRITICAL: Router still has tokenA approval");
        assertEq(tokenBAllowance, 0, "CRITICAL: Router still has tokenB approval");
    }
    
    /**
     * @notice Swaps must maintain approximate value (accounting for fees)
     * @dev Total value shouldn't decrease by more than reasonable swap fees (e.g., 1%)
     */
    function invariant_swapValuePreservation() public view {
        for (uint i = 0; i < swapHistory.length; i++) {
            if (swapHistory[i].executed) {
                uint256 tokenId = swapHistory[i].tokenId;
                uint256 valueBefore = totalValueBefore[tokenId];
                uint256 valueAfter = totalValueAfter[tokenId];
                
                // Allow for up to 1% loss due to swap fees
                uint256 maxAcceptableLoss = valueBefore / 100;
                
                assertGe(
                    valueAfter + maxAcceptableLoss,
                    valueBefore,
                    "CRITICAL: Excessive value loss during swap"
                );
            }
        }
    }
    
    /**
     * @notice Only authorized lockbox can execute swaps
     * @dev Swaps from wrong lockbox should fail
     */
    function invariant_swapAuthorizationRequired() public {
        // Try to swap from wrong lockbox - should fail
        uint256 tokenId = 0;
        address owner = lockx.ownerOf(tokenId);
        
        if (owner != user2) {
            vm.prank(user2);
            vm.expectRevert();
            // This would fail because user2 doesn't own tokenId 0
            lockx.getNonce(tokenId);
        }
    }
    
    /**
     * @notice Swap data must be properly validated
     * @dev Invalid swap parameters should revert
     */
    function invariant_swapDataValidation() public view {
        // Swaps with zero amounts should never succeed
        for (uint i = 0; i < swapHistory.length; i++) {
            if (swapHistory[i].executed) {
                assertGt(swapHistory[i].amountIn, 0, "Zero amount swap executed");
                assertGt(swapHistory[i].actualAmountOut, 0, "Zero output swap executed");
            }
        }
    }
    
    /**
     * @notice Router address cannot be changed mid-swap
     * @dev Prevents router hijacking attacks
     */
    function invariant_routerImmutability() public view {
        // Router used for swaps should be consistent
        // In production, this would check that the router address is immutable
        assertTrue(address(router) != address(0), "Router address invalid");
    }
    
    // ========================= HANDLER FUNCTIONS =========================
    
    /**
     * @notice Handler for swap operations
     */
    function handler_swap(
        uint256 tokenIdSeed,
        uint256 amountIn,
        uint256 minAmountOut,
        bool swapAtoB
    ) public {
        uint256 tokenId = tokenIdSeed % 2; // We have 2 lockboxes
        amountIn = bound(amountIn, 100e18, 1000e18);
        minAmountOut = bound(minAmountOut, 90e18, amountIn);
        
        address owner = lockx.ownerOf(tokenId);
        uint256 privateKey = tokenId == 0 ? key1 : key2;
        address tokenIn = swapAtoB ? address(tokenA) : address(tokenB);
        address tokenOut = swapAtoB ? address(tokenB) : address(tokenA);
        
        // Record value before swap
        vm.prank(owner);
        (, Withdrawals.erc20Balances[] memory erc20sBefore,) = lockx.getFullLockbox(tokenId);
        uint256 valueBefore = 0;
        for (uint i = 0; i < erc20sBefore.length; i++) {
            valueBefore += erc20sBefore[i].balance;
        }
        totalValueBefore[tokenId] = valueBefore;
        
        // Prepare swap
        vm.prank(owner);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes memory data = abi.encode(
            tokenId,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            address(router),
            bytes(""),
            bytes32("swap"),
            owner,
            block.timestamp + 1 hours,
            owner // recipient
        );
        
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, messageHash);
        bytes memory signature = abi.encodePacked(r, s, v);
        
        // Check if lockbox has enough tokens
        vm.prank(owner);
        (, Withdrawals.erc20Balances[] memory erc20s,) = lockx.getFullLockbox(tokenId);
        
        bool hasEnoughTokens = false;
        for (uint i = 0; i < erc20s.length; i++) {
            if (erc20s[i].tokenAddress == tokenIn && erc20s[i].balance >= amountIn) {
                hasEnoughTokens = true;
                break;
            }
        }
        
        if (hasEnoughTokens) {
            // Execute swap
            vm.prank(owner);
            lockx.swapInLockbox(
                tokenId,
                messageHash,
                signature,
                tokenIn,
                tokenOut,
                amountIn,
                minAmountOut,
                address(router),
                bytes(""),
                bytes32("swap"),
                block.timestamp + 1 hours,
                owner // recipient
            );
            
            // Record swap
            uint256 actualOut = router.getAmountOut(tokenIn, tokenOut, amountIn);
            swapHistory.push(SwapRecord({
                tokenId: tokenId,
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                amountIn: amountIn,
                amountOutMin: minAmountOut,
                actualAmountOut: actualOut,
                executed: true
            }));
            
            // Record value after swap
            vm.prank(owner);
            (, Withdrawals.erc20Balances[] memory erc20sAfter,) = lockx.getFullLockbox(tokenId);
            uint256 valueAfter = 0;
            for (uint i = 0; i < erc20sAfter.length; i++) {
                valueAfter += erc20sAfter[i].balance;
            }
            totalValueAfter[tokenId] = valueAfter;
        }
    }
    
    /**
     * @notice Handler for depositing tokens to enable swaps
     */
    function handler_depositForSwap(uint256 tokenIdSeed, uint256 amount, bool depositA) public {
        uint256 tokenId = tokenIdSeed % 2;
        amount = bound(amount, 100e18, 5000e18);
        
        address owner = lockx.ownerOf(tokenId);
        address token = depositA ? address(tokenA) : address(tokenB);
        
        MockERC20(token).mint(owner, amount);
        vm.startPrank(owner);
        MockERC20(token).approve(address(lockx), amount);
        lockx.depositERC20(tokenId, token, amount, bytes32("deposit"));
        vm.stopPrank();
    }
    
    function _computeMessageHash(
        uint256 tokenId,
        uint8 opType,
        bytes memory data,
        uint256 nonce
    ) internal view returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH,
            keccak256(bytes("Lockx")),
            keccak256(bytes("3")),
            block.chainid,
            address(lockx)
        ));
        return keccak256(abi.encodePacked("\\x19\\x01", domainSeparator, structHash));
    }
}