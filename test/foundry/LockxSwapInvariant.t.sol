// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockSwapRouter} from '../../contracts/mocks/MockSwapRouter.sol';

contract LockxSwapInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockSwapRouter internal router;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xBEEF);
    address internal lockboxKey;

    bytes32 internal ref = bytes32('swapInv');

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

        lockboxKey = vm.addr(keyPk);
        vm.deal(user, 100 ether);

        // fund router with tokenB and ETH for swaps
        tokenB.mint(address(router), 5_000_000 ether);
        vm.deal(address(router), 500 ether);

        // mint tokenA to user and approve
        tokenA.mint(user, 1_000_000 ether);
        vm.prank(user);
        tokenA.approve(address(lockx), type(uint256).max);

        // create lockbox with tokenA deposited
        vm.prank(user);
        lockx.createLockboxWithERC20(user, lockboxKey, address(tokenA), 500_000 ether, ref);
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

    function test_swap_postconditions_tokenToToken_creditLockbox() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 100_000 ether; // 100,000 tokenA
        uint256 minOut = (amountIn * 90) / 100; // safe slippage target
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            address(0)
        );

        bytes memory authData = abi.encode(
            tokenId,
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            keccak256(data),
            ref,
            user,
            block.timestamp + 3600,
            address(0)
        );

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        // pre balances
        uint256 inBefore = tokenA.balanceOf(address(lockx));
        uint256 outBefore = tokenB.balanceOf(address(lockx));

        vm.prank(user);
        lockx.swapInLockbox(
            tokenId,
            digest,
            sig,
            address(tokenA),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            address(0)
        );

        uint256 inAfter = tokenA.balanceOf(address(lockx));
        uint256 outAfter = tokenB.balanceOf(address(lockx));

        uint256 actualIn = inBefore - inAfter;
        uint256 amountOut = outAfter - outBefore;

        // Post-conditions
        assertLe(actualIn, amountIn);
        assertGe(amountOut, minOut);
        assertEq(tokenA.allowance(address(lockx), address(router)), 0, 'allowance not cleared');
    }

    function test_swap_postconditions_ethToToken_creditLockbox() public {
        // Deposit ETH into lockbox first
        vm.prank(user);
        lockx.depositETH{value: 2 ether}(0, ref);

        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 1 ether;
        uint256 minOut = amountIn * 800; // router gives 950 tokens/ETH

        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(0),
            address(tokenB),
            amountIn,
            minOut,
            address(0)
        );

        bytes memory authData = abi.encode(
            tokenId,
            address(0),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            keccak256(data),
            ref,
            user,
            block.timestamp + 3600,
            address(0)
        );

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        uint256 outBefore = tokenB.balanceOf(address(lockx));
        uint256 ethStoredBefore = address(lockx).balance;

        vm.prank(user);
        lockx.swapInLockbox(
            tokenId,
            digest,
            sig,
            address(0),
            address(tokenB),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            address(0)
        );

        uint256 outAfter = tokenB.balanceOf(address(lockx));
        uint256 ethStoredAfter = address(lockx).balance;
        // ETH reduced by amountIn, tokenB credited >= minOut
        assertEq(ethStoredBefore - ethStoredAfter, amountIn, 'eth input mismatch');
        assertGe(outAfter - outBefore, minOut, 'insufficient tokenOut');
    }

    function test_swap_postconditions_tokenToEth_sendRecipient() public {
        // Token -> ETH to external recipient; ensure allowance cleared and lockbox ETH unchanged
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 3e20; // 300 tokenA
        uint256 minOut = 0; // external recipient: contract ETH delta is 0, so require no minOut
        address recipient = address(0xCAFE);
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            recipient
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
            recipient
        );

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        uint256 ethBefore = address(lockx).balance;

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
            recipient
        );

        uint256 ethAfter = address(lockx).balance;
        assertEq(tokenA.allowance(address(lockx), address(router)), 0, 'allowance not cleared');
        assertEq(ethAfter, ethBefore, 'lockbox ETH changed unexpectedly');
    }
    function test_swap_postconditions_tokenToEth_creditLockbox() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 5e20; // 500 tokenA
        // Router pays 0.01 ETH per token -> amountOut = amountIn / 100
        uint256 minOut = amountIn / 130; // below router rate to avoid slippage
        address recipient = address(0); // credit lockbox so contract sees out-delta
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(tokenA),
            address(0),
            amountIn,
            minOut,
            recipient
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
            recipient
        );

        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(7), keccak256(authData))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        uint256 inBefore = tokenA.balanceOf(address(lockx));
        uint256 ethBefore = address(lockx).balance;

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
            recipient
        );

        uint256 inAfter = tokenA.balanceOf(address(lockx));
        uint256 ethAfter = address(lockx).balance;

        uint256 actualIn = inBefore - inAfter;
        uint256 ethIncrease = ethAfter - ethBefore;
        
        // Post-conditions
        assertLe(actualIn, amountIn);
        assertEq(tokenA.allowance(address(lockx), address(router)), 0, 'allowance not cleared');
        
        // ETH credited to lockbox after 0.2% fee
        // Expected: amountOut from router minus 0.2% fee
        uint256 expectedEthFromRouter = amountIn / 100; // Router rate: 0.01 ETH per token
        uint256 feeAmount = (expectedEthFromRouter * 20) / 10000; // 0.2% fee
        uint256 expectedUserAmount = expectedEthFromRouter - feeAmount;
        
        assertGt(ethIncrease, 0, 'no eth credited to lockbox');
        assertGe(ethIncrease, expectedUserAmount * 95 / 100, 'insufficient eth credited (allowing 5% tolerance)');
    }
}


