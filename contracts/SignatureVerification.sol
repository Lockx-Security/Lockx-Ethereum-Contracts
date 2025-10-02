// SPDX-License-Identifier: BUSL-1.1
// Copyright © 2025 Lockx. All rights reserved.
// This software is licensed under the Business Source License 1.1 (BUSL-1.1).
// You may use, modify, and distribute this code for non-commercial purposes only.
// For commercial use, you must obtain a license from Lockx.io.
// On or after January 1, 2029, this code will be made available under the MIT License.
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/EIP712.sol';

/**
 * @title SignatureVerification
 * @notice Provides signature-based authorization for contract operations using EIP‑712.
 * @dev Each Lockbox references an active Lockbox public key that must sign operations.
 *      The contract stores a nonce to prevent replay attacks.
 */
contract SignatureVerification is EIP712 {
    using ECDSA for bytes32;

    /// @notice Enumerates the possible operations that require Lockbox key authorization.
    enum OperationType {
        ROTATE_KEY,
        WITHDRAW_ETH,
        WITHDRAW_ERC20,
        WITHDRAW_NFT,
        BURN_LOCKBOX,
        SET_TOKEN_URI,
        BATCH_WITHDRAW,
        SWAP_ASSETS
    }

    /// @dev Gas-cheap pointer to the Lockbox ERC-721 (set once in constructor).
    ERC721 immutable _erc721;

    /**
     * @dev Stores authorization data for each Lockbox.
     * @param nonce Monotonically increasing value to prevent signature replay.
     * @param activeLockboxPublicKey The public key currently authorized to sign operations for this Lockbox.
     */
    struct TokenAuth {
        address activeLockboxPublicKey;
        uint96 nonce;
        bytes32 referenceId;
    }

    /// @dev Mapping from Lockbox token ID to its TokenAuth.
    mapping(uint256 => TokenAuth) private _tokenAuth;


    /* ─────────────────── Errors ────────────────────── */
    error NotOwner();
    error InvalidMessageHash();
    error InvalidSignature();
    error AlreadyInitialized();
    error ZeroKey();
    error InvalidReferenceId();


    /* ─────────────────── EIP-712 setup ───────────────────── */

    /**
     * @dev Typehash for the operation, including tokenId, nonce, opType (as uint8),
     *      and a bytes32 hash of the data.
     */
    bytes32 private constant OPERATION_TYPEHASH =
        keccak256('Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)');

    /**
     * @notice Constructor that sets the reference to the ERC721 contract for Lockbox ownership checks.
     * @param erc721Address The address of the ERC721 contract that mints/owns the Lockboxs.
     */
    constructor(address erc721Address) EIP712('Lockx', '5') {
        _erc721 = ERC721(erc721Address);
    }

    /**
     * @notice Initializes the Lockbox data with a public key, nonce, and referenceId.
     * @dev Intended to be called once upon minting a new Lockbox.
     * @param tokenId The ID of the Lockbox being initialized.
     * @param lockboxPublicKey The public key that will sign operations for this Lockbox.
     * @param referenceId The off-chain tracking identifier for this Lockbox.
     */
    function _initialize(uint256 tokenId, address lockboxPublicKey) internal {

        if (_tokenAuth[tokenId].activeLockboxPublicKey != address(0)) {
            revert AlreadyInitialized();
        }

        _tokenAuth[tokenId].activeLockboxPublicKey = lockboxPublicKey;
        _tokenAuth[tokenId].nonce = 0;

    }

    /**
     * @notice Modifier that checks the caller is the owner of the specified token.
     * @param tokenId The ID of the Lockbox to check ownership against.
     */
    modifier onlyTokenOwner(uint256 tokenId) {
        if (_erc721.ownerOf(tokenId) != msg.sender) revert NotOwner();
        _;
    }

    /**
     * @notice Verifies an EIP‑712 signature for a specific operation.
     * @param tokenId The ID of the Lockbox.
     * @param messageHash The EIP‑712 digest that was signed.
     * @param signature The Lockbox private key signature to verify.
     * @param newLockboxPublicKey The new Lockbox public key (if rotating the key).
     * @param opType The operation being authorized.
     * @param data Encoded parameters for the specific operation.
     *
     * Requirements:
     * - The EIP-712 message digest must match `messageHash`.
     * - The signature must be valid for the current, active Lockbox public key.
     * - On successful verification, the nonce increments.
     * - If `opType` is `ROTATE_KEY`, the Lockbox public key is updated to `newLockboxPublicKey`.
     */
    function _verifySignature(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address newLockboxPublicKey,
        OperationType opType,
        bytes memory data
    ) internal {
        TokenAuth storage tokenAuth = _tokenAuth[tokenId];

        // Compute the hash of the operation data.
        bytes32 dataHash = keccak256(data);
        bytes32 structHash = keccak256(
            abi.encode(OPERATION_TYPEHASH, tokenId, tokenAuth.nonce, uint8(opType), dataHash)
        );
        bytes32 expectedHash = _hashTypedDataV4(structHash);

        if (messageHash != expectedHash) {
            revert InvalidMessageHash();
        }

        address signer = expectedHash.recover(signature);
        if (signer != tokenAuth.activeLockboxPublicKey) {
            revert InvalidSignature();
        }

        // Increment nonce after successful verification.
        tokenAuth.nonce++;

        // If rotating the key, update the active Lockbox public key.
        if (opType == OperationType.ROTATE_KEY && newLockboxPublicKey != address(0)) {
            tokenAuth.activeLockboxPublicKey = newLockboxPublicKey;
        }
    }

    function _purgeAuth(uint256 tokenId) internal {
        delete _tokenAuth[tokenId];
    }


    /* ─────────────────── Token-gated view functions ────────────────────── */

    /**
     * @notice Retrieves the current Lockbox public key for the given Lockbox.
     * @param tokenId The ID of the Lockbox.
     * @return The currently active Lockbox public key.
     *
     * Requirements:
     * - Caller must be the owner of `tokenId`.
     */
    function getActiveLockboxPublicKeyForToken(
        uint256 tokenId
    ) external view onlyTokenOwner(tokenId) returns (address) {
        return _tokenAuth[tokenId].activeLockboxPublicKey;
    }

    /**
     * @notice Retrieves the current nonce for the given Lockbox.
     * @param tokenId The ID of the Lockbox.
     * @return The current nonce used for signature verification.
     *
     * Requirements:
     * - Caller must be the owner of `tokenId`.
     */
    function getNonce(uint256 tokenId) external view onlyTokenOwner(tokenId) returns (uint256) {
        return uint256(_tokenAuth[tokenId].nonce);
    }
    
    /**
     * @dev Internal function to verify that the provided referenceId matches the stored one.
     * @param tokenId The ID of the Lockbox.
     * @param referenceId The referenceId to verify.
     */
    function _verifyReferenceId(uint256 tokenId, bytes32 referenceId) internal view {
        if (_tokenAuth[tokenId].referenceId != referenceId) {
            revert InvalidReferenceId();
        }
    }
    
    /**
     * @dev Internal function to get the stored referenceId for a Lockbox.
     * @param tokenId The ID of the Lockbox.
     * @return The stored referenceId.
     */
    function _getReferenceId(uint256 tokenId) internal view returns (bytes32) {
        return _tokenAuth[tokenId].referenceId;

     * @dev Internal function to get the current active key for a Lockbox.
     * @param tokenId The ID of the Lockbox.
     * @return The currently active Lockbox public key.
     */
    function _getActiveLockboxPublicKey(uint256 tokenId) internal view returns (address) {
        return _tokenAuth[tokenId].activeLockboxPublicKey;

    }
}
