// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockSwapRouter} from '../../contracts/mocks/MockSwapRouter.sol';
import {FeeOnTransferToken} from '../../contracts/mocks/FeeOnTransferToken.sol';

contract LockxFeeOnTransferSwap is Test {
    Lockx internal lockx;
    FeeOnTransferToken internal feeTok;
    FeeOnTransferToken internal outTok;
    MockSwapRouter internal router;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xFEE);
    address internal key;
    bytes32 internal ref = bytes32('feeSwap');

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
        feeTok = new FeeOnTransferToken();
        outTok = new FeeOnTransferToken();
        router = new MockSwapRouter();
        key = vm.addr(keyPk);
        vm.deal(user, 10 ether);
        feeTok.transfer(user, 1e24);
        vm.prank(user);
        feeTok.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        lockx.createLockboxWithERC20(user, key, address(feeTok), 5e21, ref);
        // fund router with output token (within initial supply)
        outTok.transfer(address(router), 1e22);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return keccak256(
            abi.encode(EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx))
        );
    }
    function _hashTyped(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
    }
    function _sign(bytes32 digest) internal view returns (bytes memory sig) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(keyPk, digest);
        sig = abi.encodePacked(r, s, v);
    }

    function test_feeOnTransfer_actualIn_lte_amountIn_and_outCredited() public {
        uint256 tokenId = 0;
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        uint256 amountIn = 1e21; // 1,000 fee token
        uint256 minOut = (amountIn * 80) / 100; // router 95% nominal, fee reduces actual in
        bytes memory data = abi.encodeWithSignature(
            'swap(address,address,uint256,uint256,address)',
            address(feeTok),
            address(outTok),
            amountIn,
            minOut,
            address(0)
        );
        bytes memory authData = abi.encode(
            tokenId,
            address(feeTok),
            address(outTok),
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

        uint256 inBefore = feeTok.balanceOf(address(lockx));
        uint256 outBefore = outTok.balanceOf(address(lockx));

        vm.prank(user);
        lockx.swapInLockbox(
            tokenId,
            digest,
            sig,
            address(feeTok),
            address(outTok),
            amountIn,
            minOut,
            address(router),
            data,
            ref,
            block.timestamp + 3600,
            address(0)
        );

        uint256 inAfter = feeTok.balanceOf(address(lockx));
        uint256 outAfter = outTok.balanceOf(address(lockx));
        uint256 actualIn = inBefore - inAfter; // should be <= amountIn due to fee
        uint256 outCredited = outAfter - outBefore;

        assertLe(actualIn, amountIn);
        assertGe(outCredited, minOut);
    }
}


