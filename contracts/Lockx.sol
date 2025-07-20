// SPDX-License-Identifier: BUSL-1.1
// Copyright © 2025 Lockx. All Rights Reserved.
// You may use, modify, and share this code for NON-COMMERCIAL purposes only.
// Commercial use requires written permission from Lockx.
// Change Date: January 1, 2029 | Change License: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import './Withdrawals.sol';
import './SignatureVerification.sol';

/* ───────────────────────────── ERC-5192 / Soulbound standard ──────────────────────────────── */
interface IERC5192 {
    /// Emitted exactly once when a Lockbox becomes locked (non-transferable).
    event Locked(uint256 tokenId);

    /// Must always return true for every existing Lockbox.
    function locked(uint256 tokenId) external view returns (bool);
}

/**
 * @title Lockx
 * @dev Core soul-bound ERC-721 contract for Lockbox creation and wrapping flows
 *      Implements ERC-5192 (soulbound standard) for non-transferability.
 *      Inherits the Withdrawals smart contract which inherits Deposits and SignatureVerification contracts.
 */
contract Lockx is ERC721, Ownable, Withdrawals, IERC5192 {
    /// @dev Next token ID to mint (auto-incremented per mint.
    uint256 private _nextId;

    /* ─────────── Custom errors ───────── */
    error ZeroTokenAddress();
    error ArrayLengthMismatch();
    error EthValueMismatch();
    error DefaultURIAlreadySet();
    error NoURI();
    error TransfersDisabled();
    error UseDepositETH();
    error FallbackNotAllowed();
    error SelfMintOnly();

    /* ───────────────────────── Metadata storage ────────────────────────── */
    string private _defaultMetadataURI;
    mapping(uint256 => string) private _tokenMetadataURIs;

    /// Emitted whenever a per-token metadata URI is set/updated.
    event TokenMetadataURISet(uint256 indexed tokenId, bytes32 indexed referenceId);
    event Minted(uint256 indexed tokenId, bytes32 indexed referenceId);

    /* ─────────────────────────── Constructor ───────────────────────────── */

    /**
     * @dev Deploys the contract and initializes the EIP-712 domain used for
     *      signature authorization in SignatureVerification.
     */
    constructor() ERC721('Lockx.io', 'Lockbox') Ownable(msg.sender) SignatureVerification(address(this)) {}

    /* ─────────── Lockbox callback (burn underlying ERC-721) ───────────── */
    function _burnLockboxNFT(uint256 tokenId) internal override {
        _burn(tokenId);
    }

    /* ───────────────────────── Minting + wrapping flows ───────────────────────── */

    /**
     * @notice Mint a new Lockbox and deposit ETH.
     * @param to The address that will receive the newly minted Lockbox.
     * @param lockboxPublicKey The public key used for on-chain signature verification.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `to` must not be the zero address.
     * - `lockboxPublicKey` must not be the zero address.
     * - `msg.value` > 0 to deposit ETH.
     */
    function createLockboxWithETH(
        address to,
        address lockboxPublicKey,
        bytes32 referenceId
    ) external payable nonReentrant {
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (msg.value == 0) revert ZeroAmount();

        uint256 tokenId = _nextId++;
        _mint(to, tokenId);

        initialize(tokenId, lockboxPublicKey);
        _depositETH(tokenId, msg.value);

        emit Locked(tokenId);
        emit Minted(tokenId, referenceId);
    }

    /**
     * @notice Mint a new Lockbox and deposit ERC20 tokens.
     * @param to The recipient of the newly minted Lockbox.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param tokenAddress The ERC20 token contract address to deposit.
     * @param amount The amount of ERC20 tokens to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `to` and `lockboxPublicKey` must not be the zero address.
     * - `tokenAddress` must not be the zero address.
     * - `amount` must be greater than zero.
     */
    function createLockboxWithERC20(
        address to,
        address lockboxPublicKey,
        address tokenAddress,
        uint256 amount,
        bytes32 referenceId
    ) external nonReentrant {
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        if (amount == 0) revert ZeroAmount();

        uint256 tokenId = _nextId++;
        _mint(to, tokenId);

        initialize(tokenId, lockboxPublicKey);
        _depositERC20(tokenId, tokenAddress, amount);

        emit Locked(tokenId);
        emit Minted(tokenId, referenceId);
    }

    /**
     * @notice Mint a new Lockbox and deposit a single ERC721.
     * @param to The recipient of the newly minted Lockbox.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param nftContract The ERC721 contract address to deposit.
     * @param externalNftTokenId The token ID of the ERC721 to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `to`, `lockboxPublicKey`, and `nftContract` must not be the zero address.
     */
    function createLockboxWithERC721(
        address to,
        address lockboxPublicKey,
        address nftContract,
        uint256 externalNftTokenId,
        bytes32 referenceId
    ) external nonReentrant {
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (nftContract == address(0)) revert ZeroTokenAddress();

        uint256 tokenId = _nextId++;
        _mint(to, tokenId);

        initialize(tokenId, lockboxPublicKey);
        _depositERC721(tokenId, nftContract, externalNftTokenId);

        emit Locked(tokenId);
        emit Minted(tokenId, referenceId);
    }

    /**
     * @notice Mint a new Lockbox and perform a batch deposit of ETH, ERC20s, and ERC721s.
     * @param to The recipient of the newly minted Lockbox.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param amountETH The amount of ETH to deposit.
     * @param tokenAddresses ERC20 token contract addresses to deposit.
     * @param tokenAmounts Corresponding amounts of each ERC20 to deposit.
     * @param nftContracts ERC721 contract addresses to deposit.
     * @param nftTokenIds Corresponding token IDs of each ERC721 to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `to` and `lockboxPublicKey` must not be zero addresses.
     * - `tokenAddresses.length == tokenAmounts.length`.
     * - `nftContracts.length == nftTokenIds.length`.
     * - `msg.value == amountETH`.
     */
    function createLockboxWithBatch(
        address to,
        address lockboxPublicKey,
        uint256 amountETH,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds,
        bytes32 referenceId
    ) external payable nonReentrant {
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert ArrayLengthMismatch();
        if (msg.value != amountETH) revert EthValueMismatch();

        uint256 tokenId = _nextId++;
        _mint(to, tokenId);

        initialize(tokenId, lockboxPublicKey);
        _batchDeposit(tokenId, amountETH, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds);

        emit Locked(tokenId);
        emit Minted(tokenId, referenceId);
    }

    /* ──────────────────────── Default metadata management ──────────────────────── */

    /**
     * @notice Sets the default metadata URI for all Lockboxes (only once).
     * @param newDefaultURI The base metadata URI to use for tokens without custom URIs.
     * @dev Can only be called by the contract owner, and only once.
     *
     * Requirements:
     * - Default URI must not be already set.
     */
    function setDefaultMetadataURI(string memory newDefaultURI) external onlyOwner {
        if (bytes(_defaultMetadataURI).length > 0) revert DefaultURIAlreadySet();
        _defaultMetadataURI = newDefaultURI;
    }


    /* ───────────────────────── Token-gated + EIP-712 secured metadata management ────────────────────────── */

    /**
     * @notice Sets or updates a custom metadata URI for a specific Lockbox.
     * @param tokenId The ID of the Lockbox to update.
     * @param messageHash The EIP-712 digest that was signed.
     * @param signature The EIP-712 signature by the active Lockbox key.
     * @param newMetadataURI The new metadata URI to assign.
     * @param referenceId An external reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp until which the signature is valid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `signature` must be valid and unexpired.
     */
    function setTokenMetadataURI(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        string memory newMetadataURI,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken();
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        bytes memory data = abi.encode(
            tokenId,
            newMetadataURI,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.SET_TOKEN_URI,
            data
        );

        _tokenMetadataURIs[tokenId] = newMetadataURI;
        emit TokenMetadataURISet(tokenId, referenceId);
    }

    /**
     * @notice Returns the metadata URI for a Lockbox.
     * @param tokenId The ID of the token to query.
     * @return The custom URI if set; otherwise the default URI.
     * @dev Reverts if neither custom nor default URI is available.
     */
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken();
        string memory custom = _tokenMetadataURIs[tokenId];
        if (bytes(custom).length > 0) return custom;
        if (bytes(_defaultMetadataURI).length > 0) return _defaultMetadataURI;
        revert NoURI();
    }

    /* ────────────────────── Soul-bound mechanics (ERC-5192) ────────────── */

    /**
     * @notice Always returns true for existing Lockboxes (soul‐bound).
     * @param tokenId The ID of the Lockbox.
     * @return Always true.
     * @dev Reverts if token does not exist.
     */
    function locked(uint256 tokenId) external view override returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken();
        return true;
    }

    /// Disable any transfer—soul‐bound enforcement and handle metadata cleanup on burn.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        
        // Clear custom metadata on burn (when to == address(0))
        if (to == address(0)) {
            delete _tokenMetadataURIs[tokenId];
        }
        
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721) returns (bool) {
        // ERC-5192 soulbound interface
        if (interfaceId == type(IERC5192).interfaceId) return true;
        // ERC-721 Receiver interface
        if (interfaceId == type(IERC721Receiver).interfaceId) return true;
        // everything else (ERC-721, ERC-165)
        return super.supportsInterface(interfaceId);
    }

    /* ───────────────────────── Fallback handlers ───────────────────────── */
    receive() external payable {
        // Empty function allows ETH reception without re-entrancy risks
    }
    fallback() external payable {
        revert FallbackNotAllowed();
    }
}
