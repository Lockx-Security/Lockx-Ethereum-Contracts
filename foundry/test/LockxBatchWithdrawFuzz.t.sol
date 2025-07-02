// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.30;

import 'forge-std/Test.sol';

import {Lockx} from '../../contracts/Lockx.sol';
import {MockERC20} from '../../contracts/mocks/MockERC20.sol';
import {MockERC721} from '../../contracts/mocks/MockERC721.sol';

/// @notice Fuzz-tests `batchWithdraw()` covering ETH + two ERC-20s + one ERC-721 in a single call.
///         Ensures on-chain balances drop to zero and recipient receives the assets back.
///         Uses the same EIP-712 signing flow as production to keep coverage realistic.
contract LockxBatchWithdrawFuzz is Test {
    Lockx internal lockx;
    MockERC20 internal tokA;
    MockERC20 internal tokB;
    MockERC721 internal nft;

    address internal user = address(0xBEEF);
    uint256 internal lockboxPrivKey = uint256(0xA11CE);
    address internal lockboxKey;

    bytes32 internal referenceId = bytes32('bwFuzz');

    // Constants copied from SignatureVerification for digest creation
    bytes32 private constant OPERATION_TYPEHASH =
        keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256(
            'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
        );

    function setUp() public {
        lockx = new Lockx();
        tokA = new MockERC20();
        tokB = new MockERC20();
        nft = new MockERC721();
        lockboxKey = vm.addr(lockboxPrivKey);

        // give user starting balances
        vm.deal(user, 500 ether);
        tokA.mint(user, 1_000_000 ether);
        tokB.mint(user, 2_000_000 ether);

        // mint an NFT to user
        nft.mint(user, 2);
    }

    function _domainSeparator() internal view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_TYPEHASH,
                    keccak256(bytes('Lockx')),
                    keccak256(bytes('2')),
                    block.chainid,
                    address(lockx)
                )
            );
    }

    function _sign(bytes32 digest) internal returns (bytes memory) {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(lockboxPrivKey, digest);
        return abi.encodePacked(r, s, v);
    }

    /// @param rawEth Random ETH deposit value (will be reduced to ≤ 100 ether)
    /// @param rawA   Random ERC-20 A amount   (≤ 1e6 ether)
    /// @param rawB   Random ERC-20 B amount   (≤ 2e6 ether)
    function testFuzz_batchWithdraw(uint96 rawEth, uint96 rawA, uint96 rawB) public {
        // normalise fuzz inputs
        uint256 amountETH = uint256(rawEth) % 100 ether;
        uint256 amountA = uint256(rawA) % 1_000_000 ether;
        uint256 amountB = uint256(rawB) % 2_000_000 ether;

        // need at least one asset to withdraw
        vm.assume(amountETH > 0 && amountA > 0 && amountB > 0);

        // prepare approvals & deposits
        vm.startPrank(user);
        if (amountA > 0) tokA.approve(address(lockx), amountA);
        if (amountB > 0) tokB.approve(address(lockx), amountB);
        nft.approve(address(lockx), 2);

        // build arrays for batch deposit
        address[] memory tokenAddrs = new address[](2);
        uint256[] memory tokenAmts = new uint256[](2);
        tokenAddrs[0] = address(tokA);
        tokenAddrs[1] = address(tokB);
        tokenAmts[0] = amountA;
        tokenAmts[1] = amountB;

        address[] memory nftAddrs = new address[](1);
        uint256[] memory nftIds = new uint256[](1);
        nftAddrs[0] = address(nft);
        nftIds[0] = 2;

        lockx.createLockboxWithBatch{value: amountETH}(
            user,
            lockboxKey,
            amountETH,
            tokenAddrs,
            tokenAmts,
            nftAddrs,
            nftIds,
            referenceId
        );
        vm.stopPrank();

        uint256 tokenId = 0; // first minted
        uint256 nonce = 1;
        uint256 signatureExpiry = block.timestamp + 1 hours;

        // Build data packed exactly as in implementation
        bytes memory encoded = abi.encode(
            tokenId,
            amountETH,
            tokenAddrs,
            tokenAmts,
            nftAddrs,
            nftIds,
            user,
            referenceId,
            user,
            signatureExpiry
        );
        bytes32 dataHash = keccak256(encoded);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, nonce, uint8(6), dataHash)
        );
        bytes32 digest = keccak256(abi.encodePacked('\x19\x01', _domainSeparator(), structHash));
        bytes memory sig = _sign(digest);

        // check pre balances (contract holds assets)
        assertEq(address(lockx).balance, amountETH);
        if (amountA > 0) assertEq(tokA.balanceOf(address(lockx)), amountA);
        if (amountB > 0) assertEq(tokB.balanceOf(address(lockx)), amountB);
        assertEq(nft.ownerOf(2), address(lockx));

        uint256 userEthBefore = user.balance;

        // perform batch withdraw
        vm.prank(user);
        lockx.batchWithdraw(
            tokenId,
            digest,
            sig,
            amountETH,
            tokenAddrs,
            tokenAmts,
            nftAddrs,
            nftIds,
            user,
            referenceId,
            signatureExpiry
        );

        // post balances assertions
        if (amountETH > 0) {
            assertEq(address(lockx).balance, 0);
            assertGt(user.balance, userEthBefore);
        }
        if (amountA > 0) assertEq(tokA.balanceOf(address(lockx)), 0);
        if (amountB > 0) assertEq(tokB.balanceOf(address(lockx)), 0);
        assertEq(nft.ownerOf(2), user);
    }
}
