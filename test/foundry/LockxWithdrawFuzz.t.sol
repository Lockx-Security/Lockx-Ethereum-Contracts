// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import {Test} from 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

contract LockxWithdrawFuzz is Test {
    Lockx internal lockx;
    MockERC20 internal token;

    address internal user = address(0xA11CE);
    uint256 internal keyPk = uint256(0xDEAD);
    address internal key;
    bytes32 internal ref = bytes32('fuzz');

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
        token = new MockERC20();
        key = vm.addr(keyPk);
        vm.deal(user, 10 ether);
        token.mint(user, 1e24);
        vm.prank(user);
        token.approve(address(lockx), type(uint256).max);
        vm.prank(user);
        lockx.createLockboxWithETH{value: 5 ether}(user, key, ref);
        vm.prank(user);
        lockx.depositERC20(0, address(token), 5e21, ref);
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

    function testFuzz_withdrawETH(uint96 raw) public {
        uint256 tokenId = 0;
        uint256 bal = address(lockx).balance; // equals stored lockbox ETH in setup
        uint256 amount = uint256(raw) % (bal + 1);
        vm.assume(amount > 0 && amount <= bal);

        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);

        bytes memory data = abi.encode(tokenId, amount, user, ref, user, block.timestamp + 3600);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(1), keccak256(data))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        uint256 beforeUser = user.balance;
        uint256 beforeContract = address(lockx).balance;

        vm.prank(user);
        lockx.withdrawETH(tokenId, digest, sig, amount, user, ref, block.timestamp + 3600);

        assertEq(address(lockx).balance, beforeContract - amount);
        assertEq(user.balance, beforeUser + amount);
    }

    function testFuzz_withdrawERC20(uint96 raw) public {
        uint256 tokenId = 0;
        uint256 bal = token.balanceOf(address(lockx));
        uint256 amount = uint256(raw) % (bal + 1);
        vm.assume(amount > 0 && amount <= bal);

        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);

        bytes memory data = abi.encode(tokenId, address(token), amount, user, ref, user, block.timestamp + 3600);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(2), keccak256(data))
        );
        bytes32 digest = _hashTyped(structHash);
        bytes memory sig = _sign(digest);

        uint256 beforeUser = token.balanceOf(user);
        uint256 beforeContract = token.balanceOf(address(lockx));

        vm.prank(user);
        lockx.withdrawERC20(tokenId, digest, sig, address(token), amount, user, ref, block.timestamp + 3600);

        assertEq(token.balanceOf(address(lockx)), beforeContract - amount);
        assertEq(token.balanceOf(user), beforeUser + amount);
    }
}


