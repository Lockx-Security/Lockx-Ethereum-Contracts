// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';

contract LockxWithdrawERC20Fuzz is Test {
    Lockx internal lockx;
    MockERC20 internal token;

    address internal user = address(0xDEAD);
    uint256 internal lockboxPrivKey = uint256(0xB0B0);
    address internal lockboxKey;

    bytes32 internal referenceId = bytes32('w20fuzz');

    bytes32 private constant OPERATION_TYPEHASH =
        keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    function setUp() public {
        lockx = new Lockx();
        token = new MockERC20();
        token.mint(user, 1_000_000 ether);
        lockboxKey = vm.addr(lockboxPrivKey);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes('Lockx')),
                    keccak256(bytes('4')),
                    block.chainid,
                    address(lockx)
                )
            );
    }

    function _sign(bytes32 digest) internal view returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(lockboxPrivKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function testFuzz_withdrawERC20(uint96 rawAmount) public {
        uint256 depositAmount = uint256(rawAmount) % 1_000_000 ether;
        vm.assume(depositAmount > 0);

        // 1. Create lockbox with ERC20 deposit
        vm.startPrank(user);
        token.approve(address(lockx), depositAmount);
        lockx.createLockboxWithERC20(user, lockboxKey, address(token), depositAmount, referenceId);
        vm.stopPrank();

        uint256 tokenId = 0; // first minted ID
        uint256 nonce = 1;
        uint256 signatureExpiry = block.timestamp + 1 hours;

        // Data hash matches contract encoding
        bytes32 dataHash = keccak256(
            abi.encode(
                tokenId,
                address(token),
                depositAmount,
                user,
                referenceId,
                user,
                signatureExpiry
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(2), dataHash)
        );
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
        bytes memory sig = _sign(digest);

        // 2. Withdraw tokens back to user
        vm.prank(user);
        lockx.withdrawERC20(
            tokenId,
            digest,
            sig,
            address(token),
            depositAmount,
            user,
            referenceId,
            signatureExpiry
        );

        // 3. Assert balances
        assertEq(token.balanceOf(user), 1_000_000 ether);
        assertEq(token.balanceOf(address(lockx)), 0);
    }
}
