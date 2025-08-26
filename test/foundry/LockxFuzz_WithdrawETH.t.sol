// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';

contract LockxWithdrawETHFuzz is Test {
    Lockx internal lockx;

    // Owner and lockbox key
    address internal user = address(0xFEED);
    uint256 internal lockboxPrivKey = uint256(0xA11CE);
    address internal lockboxKey;

    bytes32 internal referenceId = bytes32('withdrawfuzz');

    bytes32 private constant OPERATION_TYPEHASH =
        keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    function setUp() public {
        lockx = new Lockx();
        lockboxKey = vm.addr(lockboxPrivKey);
        vm.deal(user, 100 ether);
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

    function testFuzz_withdrawEth(uint96 rawAmount) public {
        uint256 amount = uint256(rawAmount) % 10 ether;
        vm.assume(amount > 0);

        // 1. Create lockbox and deposit ETH
        vm.prank(user);
        lockx.createLockboxWithETH{value: amount}(user, lockboxKey, referenceId);

        uint256 tokenId = 0; // first minted token ID
        uint256 nonce = 1; // starts at 1 after initialize
        uint256 signatureExpiry = block.timestamp + 1 hours;

        // Build data hash
        bytes32 dataHash = keccak256(
            abi.encode(tokenId, amount, user, referenceId, user, signatureExpiry)
        );

        // opType 1 = WITHDRAW_ETH
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(1), dataHash)
        );
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
        bytes memory sig = _sign(digest);

        // 2. Withdraw ETH back to user
        vm.prank(user);
        lockx.withdrawETH(tokenId, digest, sig, amount, user, referenceId, signatureExpiry);

        // 3. Assert balance
        assertEq(address(user).balance, 100 ether);
    }
}
