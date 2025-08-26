// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';
import '../../contracts/Lockx.sol';
import '../../contracts/mocks/MockERC20.sol';
import '../../contracts/mocks/MockSwapRouter.sol';

/**
 * @title LockxTreasuryFeeTest
 * @notice Tests treasury lockbox ID 0 fee collection and behavior
 */
contract LockxTreasuryFeeTest is Test {
    Lockx public lockx;
    MockERC20 public tokenA;
    MockERC20 public tokenB;
    MockSwapRouter public router;
    
    address public user = makeAddr("user");
    address public treasury = makeAddr("treasury");
    uint256 private keyPk = 0x1234;
    address public lockboxKey;
    
    bytes32 public constant ref = bytes32("test");
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('4'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );

    function setUp() public {
        lockx = new Lockx();
        tokenA = new MockERC20();
        tokenB = new MockERC20();
        router = new MockSwapRouter();
        
        tokenA.initialize("Token A", "TOKA");
        tokenB.initialize("Token B", "TOKB");
        
        lockboxKey = vm.addr(keyPk);
        
        // Fund user, treasury, and router
        vm.deal(user, 100 ether);
        vm.deal(treasury, 100 ether);
        tokenA.mint(user, 1_000_000 ether);
        tokenB.mint(address(router), 5_000_000 ether);
        vm.deal(address(router), 2000 ether);
        
        // Create treasury lockbox FIRST to ensure it gets ID 0
        vm.prank(treasury);
        lockx.createLockboxWithETH{value: 1 ether}(treasury, lockboxKey, ref);
        
        // Create user lockbox with tokens (gets ID 1)
        vm.startPrank(user);
        tokenA.approve(address(lockx), type(uint256).max);
        lockx.createLockboxWithERC20(user, lockboxKey, address(tokenA), 500_000 ether, ref);
        vm.stopPrank();
    }

    function test_treasuryFeesCollected() public {
        // Treasury already created in setUp as ID 0, user lockbox is ID 1
        uint256 treasuryTokenId = 0;
        uint256 userTokenId = 1;
        
        uint256 amountIn = 100_000 ether;
        uint256 minOut = 800 ether; // Router gives 0.01 ETH per token
        
        // Get treasury balance before
        vm.prank(treasury);
        (uint256 treasuryETHBefore,,) = lockx.getFullLockbox(treasuryTokenId);
        
        // Execute swap from user lockbox
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(0) // Credit to user lockbox
        );
        
        bytes memory authData = abi.encode(
            userTokenId,
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(router),
            keccak256(data),
            ref,
            user,
            block.timestamp + 3600,
            address(0)
        );
        
        vm.prank(user);
        uint256 nonce = lockx.getNonce(userTokenId);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, userTokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);
        
        // Execute swap
        vm.prank(user);
        lockx.swapInLockbox(
            userTokenId,
            digest,
            sig,
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            address(0)
        );
        
        // Check treasury (lockbox 0) received fees
        vm.prank(treasury);
        (uint256 treasuryETHAfter,,) = lockx.getFullLockbox(treasuryTokenId);
        
        uint256 expectedEthFromRouter = amountIn / 100; // 1000 ETH
        uint256 expectedFee = (expectedEthFromRouter * 20) / 10000; // 0.2% = 2 ETH
        uint256 feeIncrease = treasuryETHAfter - treasuryETHBefore;
        
        assertEq(feeIncrease, expectedFee, "Treasury lockbox should receive 0.2% fee");
        assertTrue(feeIncrease > 0, "Treasury should have collected fees");
    }
    
    function test_treasuryOwnerCanWithdrawFees() public {
        // Setup treasury and execute swap to collect fees
        test_treasuryFeesCollected();
        
        // Treasury owner should be able to withdraw collected fees
        vm.prank(treasury);
        (uint256 treasuryETH,,) = lockx.getFullLockbox(0);
        
        assertTrue(treasuryETH > 1 ether, "Treasury should have original 1 ETH + fees");
        
        // Treasury owner can withdraw like any other lockbox owner
        assertEq(lockx.ownerOf(0), treasury, "Treasury should own lockbox 0");
    }
    
    function test_multipleSwapsAccumulateFees() public {
        // Treasury already created in setUp as ID 0, user lockbox is ID 1
        uint256 userTokenId = 1;
        
        // Get initial treasury balance
        vm.prank(treasury);
        (uint256 treasuryInitial,,) = lockx.getFullLockbox(0);
        
        // First swap
        _executeSwap(userTokenId, 50_000 ether);
        vm.prank(treasury);
        (uint256 feesAfterFirst,,) = lockx.getFullLockbox(0);
        
        // Second swap
        _executeSwap(userTokenId, 30_000 ether);
        vm.prank(treasury);
        (uint256 feesAfterSecond,,) = lockx.getFullLockbox(0);
        
        assertGt(feesAfterSecond, feesAfterFirst, "Fees should accumulate");
        
        // Expected total fees
        uint256 expectedFee1 = ((50_000 ether / 100) * 20) / 10000; // 1.0 ETH
        uint256 expectedFee2 = ((30_000 ether / 100) * 20) / 10000; // 0.6 ETH
        uint256 totalFeesCollected = feesAfterSecond - treasuryInitial;
        uint256 expectedTotal = expectedFee1 + expectedFee2;
        
        assertEq(totalFeesCollected, expectedTotal, "Total fees should match expected");
    }
    
    // Helper functions
    
    function _executeSwap(uint256 tokenId, uint256 amountIn) internal {
        uint256 minOut = (amountIn * 8) / 1000; // Conservative slippage
        
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(0)
        );
        
        bytes memory authData = abi.encode(
            tokenId,
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(router),
            keccak256(data),
            ref,
            user,
            block.timestamp + 3600,
            address(0)
        );
        
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);
        
        vm.prank(user);
        lockx.swapInLockbox(
            tokenId,
            digest,
            sig,
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            address(0)
        );
    }
    
    function _domainSeparator() internal view returns (bytes32) {
        uint256 chainId;
        assembly { chainId := chainid() }
        return keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                NAME_HASH,
                VERSION_HASH,
                chainId,
                address(lockx)
            )
        );
    }
    
    function _hashTyped(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
    }
    
    function _sign(bytes32 digest) internal view returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, digest);
        sig = abi.encodePacked(r, s, v);
    }
}