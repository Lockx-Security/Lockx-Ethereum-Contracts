// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockSwapRouter} from '../../contracts/mocks/MockSwapRouter.sol';

contract LockxSwapAllowanceInvariant is Test {
    Lockx internal lockx;
    MockERC20 internal tokenA;
    MockERC20 internal tokenB;
    MockSwapRouter internal router;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xC0FFEE);
    address internal lockboxKey;

    bytes32 internal ref = bytes32('swapAllow');

    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('3'));
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

        // seed router and user
        tokenB.mint(address(router), 1e26);
        vm.deal(address(router), 500 ether);
        tokenA.mint(user, 1e24);
        vm.prank(user);
        tokenA.approve(address(lockx), type(uint256).max);

        // create lockbox with tokenA
        vm.prank(user);
        lockx.createLockboxWithERC20(user, lockboxKey, address(tokenA), 5e21, ref);

        // target this handler contract
        targetContract(address(this));
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

    // Fuzz handler: perform a swap variant and ensure it succeeds
    function doSwap(uint8 kind, uint96 raw) external {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);

        if (kind % 3 == 0) {
            // tokenA -> tokenB, credit lockbox
            uint256 amountIn = uint256(raw) % 2e21; // up to 2,000 tokenA
            if (amountIn == 0) return;
            uint256 minOut = (amountIn * 80) / 100; // safe
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
        } else if (kind % 3 == 1) {
            // tokenA -> ETH, send to recipient
            uint256 amountIn = uint256(raw) % 1e21; // up to 1,000 tokenA
            if (amountIn == 0) return;
            address recipient = address(0xCAFE);
            uint256 minOut = 0; // recipient external; contract ETH delta is 0
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
        } else {
            // ETH -> tokenB, credit lockbox
            // ensure some ETH in lockbox
            vm.prank(user);
            lockx.depositETH{value: 1 ether}(0, ref);
            uint256 amountIn = (uint256(raw) % 1 ether);
            if (amountIn == 0) return;
            uint256 minOut = 0; // router gives plenty; minOut not enforced at contract for recipient==0 path
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
        }
    }

    // Invariant: allowances to router are always zero between calls
    function invariant_allowancesCleared() public view {
        assertEq(tokenA.allowance(address(lockx), address(router)), 0, 'tokenA allowance');
        assertEq(tokenB.allowance(address(lockx), address(router)), 0, 'tokenB allowance');
    }
}


