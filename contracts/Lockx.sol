// SPDX-License-Identifier: BUSL-1.1
// Copyright © 2025 Lockx. All rights reserved.
// This software is licensed under the Business Source License 1.1 (BUSL-1.1).
// You may use, modify, and distribute this code for non-commercial purposes only.
// For commercial use, you must obtain a license from Lockx.io.
// On or after January 1, 2029, this code will be made available under the MIT License.
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/utils/Strings.sol';
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
 * @dev Core soul-bound ERC-721 contract for Lockbox creation, key rotation, metadata management, and burning.
 *      Implements ERC-5192 (soulbound standard) for non-transferability.
 *      Inherits the Withdrawals smart contract which inherits Deposits and SignatureVerification contracts.
 */
contract Lockx is ERC721, Ownable, Withdrawals, IERC5192 {
    /// @dev Next token ID to mint (auto-incremented per mint).
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
    error LockboxNotEmpty();


    /* ───────────────────────── Metadata storage ────────────────────────── */
    string private _defaultMetadataURI;
    mapping(uint256 => string) private _tokenMetadataURIs;

    /// Emitted whenever a per-token metadata URI is set/updated.
    event TokenMetadataURISet(uint256 indexed tokenId, bytes32 indexed referenceId);
    event Minted(uint256 indexed tokenId, bytes32 indexed referenceId);
    event LockboxBurned(uint256 indexed tokenId, bytes32 indexed referenceId);
    event KeyRotated(uint256 indexed tokenId, bytes32 indexed referenceId);


    /* ─────────────────────────── Constructor ───────────────────────────── */

    /**
     * @dev Deploys the contract and initializes the EIP-712 domain used for
     *      signature authorization in SignatureVerification.
     */
    constructor() ERC721('Lockx.io', 'Lockbox') Ownable(msg.sender) SignatureVerification(address(this)) {}


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
        // 1) Checks
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (msg.value == 0) revert ZeroAmount();

        // 2) Effects
        uint256 tokenId = _nextId++;
        initialize(tokenId, lockboxPublicKey);
        _mint(to, tokenId);

        // 3) Interactions
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
        // 1) Checks
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        if (amount == 0) revert ZeroAmount();

        // 2) Effects
        uint256 tokenId = _nextId++;
        initialize(tokenId, lockboxPublicKey);
        _mint(to, tokenId);
        
        // 3) Interactions
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
        // 1) Checks
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (nftContract == address(0)) revert ZeroTokenAddress();

        // 2) Effects
        uint256 tokenId = _nextId++;
        initialize(tokenId, lockboxPublicKey);
        _mint(to, tokenId);
        
        // 3) Interactions
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
        // 1) Checks
        if (to != msg.sender) revert SelfMintOnly();
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert ArrayLengthMismatch();
        if (msg.value != amountETH) revert EthValueMismatch();

        // 2) Effects
        uint256 tokenId = _nextId++;
        initialize(tokenId, lockboxPublicKey);
        _mint(to, tokenId);
        
        // 3) Interactions
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
        // 1) Checks
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

        // 2) Effects
        _tokenMetadataURIs[tokenId] = newMetadataURI;
        
        // 3) Interactions (none in this case, just emit event)
        emit TokenMetadataURISet(tokenId, referenceId);
    }

    /**
     * @notice Returns the metadata URI for a Lockbox.
     * @param tokenId The ID of the token to query.
     * @return The custom URI if set; otherwise the default URI with tokenId appended.
     * @dev Reverts if neither custom nor default URI is available.
     */
    function tokenURI(uint256 tokenId) public view override(ERC721) returns (string memory) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken();
        string memory custom = _tokenMetadataURIs[tokenId];
        if (bytes(custom).length > 0) return custom;
        if (bytes(_defaultMetadataURI).length > 0) {
            return string(abi.encodePacked(_defaultMetadataURI, Strings.toString(tokenId)));
        }
        revert NoURI();
    }

    
    /* ─────────────────── Lockbox key rotation ──────────────────── */

    /*
     * @notice Rotate the off-chain authorization key for a Lockbox.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param newPublicKey    The new authorized Lockbox public key.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     */
    function rotateLockboxKey(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address newPublicKey,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        bytes memory data = abi.encode(
            tokenId,
            newPublicKey,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            newPublicKey,
            OperationType.ROTATE_KEY,
            data
        );
        emit KeyRotated(tokenId, referenceId);
    }


    /* ─────────────────── Lockbox burning ──────────────────── */

    function _burnLockboxNFT(uint256 tokenId) internal {
        _burn(tokenId);
    }

    /*
     * @notice Authenticated burn of a Lockbox, clearing all assets and burning the NFT.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     */
    function burnLockbox(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        bytes memory data = abi.encode(tokenId, referenceId, msg.sender, signatureExpiry);
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.BURN_LOCKBOX,
            data
        );

        _finalizeBurn(tokenId);
        emit LockboxBurned(tokenId, referenceId);
    }

    /**
     * @dev Internal helper called by `burnLockbox`.
     *      - Wipes all ETH / ERC20 / ERC721 bookkeeping for the Lockbox.
     *      - Delegates the actual ERC-721 burn to `_burnLockboxNFT` (implemented above).
     */
    function _finalizeBurn(uint256 tokenId) internal {
        // Check if lockbox is empty before burning
        if (_ethBalances[tokenId] > 0) revert LockboxNotEmpty();
        if (_erc20TokenAddresses[tokenId].length > 0) revert LockboxNotEmpty();
        if (_nftKeys[tokenId].length > 0) revert LockboxNotEmpty();
        
        /* ---- ETH ---- */
        delete _ethBalances[tokenId];

        /* ---- ERC-20 balances ---- */
        delete _erc20TokenAddresses[tokenId];

        /* ---- ERC-721 bookkeeping ---- */
        delete _nftKeys[tokenId];

        /* ---- finally burn the NFT itself ---- */
        _burnLockboxNFT(tokenId);
        _purgeAuth(tokenId);
    }


    /* ────────────────────── Soul-bound mechanics (ERC-5192) ────────────── */

    /**
     * @notice Always returns true for existing Lockboxes (soulbound).
     * @param tokenId The ID of the Lockbox.
     * @return Always true.
     * @dev Reverts if token does not exist.
     */
    function locked(uint256 tokenId) external view override returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert NonexistentToken();
        return true;
    }

    /// Override _update to enforce soulbound behavior (prevent transfers) and cleanup metadata on burn.
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
    
    /**
     * @notice Receive ETH from swaps and other legitimate sources.
     * @dev Empty by design - accounting handled by calling functions.
     */
    receive() external payable {
        // Accept ETH transfers - accounting handled by caller
    }
    
    fallback() external {
        revert FallbackNotAllowed();
    }
}
