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
    error DefaultURIAlreadySet();
    error NoURI();
    error TransfersDisabled();
    error FallbackNotAllowed();
    error DirectETHTransferNotAllowed();
    error LockboxNotEmpty();
    error DuplicateKey();


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
     *      Creates the treasury lockbox (tokenId=0) and assigns it to the deployer.
     */
    constructor() ERC721('Lockx.io', 'Lockbox') Ownable(msg.sender) SignatureVerification(address(this)) {
        // Mint the treasury lockbox (tokenId = 0) to the deployer
        uint256 treasuryTokenId = _nextId++;
        _initialize(treasuryTokenId, msg.sender, bytes32(0)); // Use deployer address as initial treasury key (can be rotated later)
        _mint(msg.sender, treasuryTokenId);
        emit Locked(treasuryTokenId);
        emit Minted(treasuryTokenId, bytes32(0));
    }


    /* ───────────────────────── Minting + wrapping flows ───────────────────────── */

    /**
     * @notice Mint a new Lockbox and deposit ETH.
     * @param lockboxPublicKey The public key used for on-chain signature verification.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `lockboxPublicKey` must not be the zero address.
     * - `msg.value` > 0 to deposit ETH.
     */
    function createLockboxWithETH(
        address lockboxPublicKey,
        bytes32 referenceId
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        
        uint256 tokenId = _createLockbox(lockboxPublicKey, referenceId);
        _depositETH(tokenId, msg.value);
    }

    /**
     * @notice Mint a new Lockbox and deposit ERC20 tokens.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param tokenAddress The ERC20 token contract address to deposit.
     * @param amount The amount of ERC20 tokens to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `lockboxPublicKey` must not be the zero address.
     * - `tokenAddress` must not be the zero address.
     * - `amount` must be greater than zero.
     */
    function createLockboxWithERC20(
        address lockboxPublicKey,
        address tokenAddress,
        uint256 amount,
        bytes32 referenceId
    ) external nonReentrant {
        if (tokenAddress == address(0)) revert ZeroTokenAddress();
        if (amount == 0) revert ZeroAmount();
        
        uint256 tokenId = _createLockbox(lockboxPublicKey, referenceId);
        _depositERC20(tokenId, tokenAddress, amount);
    }

    /**
     * @notice Mint a new Lockbox and deposit a single ERC721.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param nftContract The ERC721 contract address to deposit.
     * @param externalNftTokenId The token ID of the ERC721 to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `lockboxPublicKey` and `nftContract` must not be the zero address.
     */
    function createLockboxWithERC721(
        address lockboxPublicKey,
        address nftContract,
        uint256 externalNftTokenId,
        bytes32 referenceId
    ) external nonReentrant {
        if (nftContract == address(0)) revert ZeroTokenAddress();
        
        uint256 tokenId = _createLockbox(lockboxPublicKey, referenceId);
        _depositERC721(tokenId, nftContract, externalNftTokenId);
    }

    /**
     * @notice Mint a new Lockbox and perform a batch deposit of ETH, ERC20s, and ERC721s.
     * @param lockboxPublicKey The public key used for off-chain signature verification.
     * @param tokenAddresses ERC20 token contract addresses to deposit.
     * @param tokenAmounts Corresponding amounts of each ERC20 to deposit.
     * @param nftContracts ERC721 contract addresses to deposit.
     * @param nftTokenIds Corresponding token IDs of each ERC721 to deposit.
     * @param referenceId An external reference ID for off-chain tracking.
     *
     * Requirements:
     * - `lockboxPublicKey` must not be zero address.
     * - `tokenAddresses.length == tokenAmounts.length`.
     * - `nftContracts.length == nftTokenIds.length`.
     * - ETH deposits can be included via msg.value.
     */
    function createLockboxWithBatch(
        address lockboxPublicKey,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds,
        bytes32 referenceId
    ) external payable nonReentrant {
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert ArrayLengthMismatch();
        
        // Prevent empty lockbox creation - at least one asset must be provided
        if (msg.value == 0 && tokenAddresses.length == 0 && nftContracts.length == 0) {
            revert ZeroAmount();
        }
        
        uint256 tokenId = _createLockbox(lockboxPublicKey, referenceId);
        _batchDeposit(tokenId, msg.value, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds);
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
        bytes memory signature,
        string memory newMetadataURI,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        // 1) Checks
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        _verifyReferenceId(tokenId, referenceId);

        bytes memory data = abi.encode(
            newMetadataURI,
            referenceId,
            signatureExpiry
        );
        _verifySignature(
            tokenId,
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
        bytes memory signature,
        address newPublicKey,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant onlyLockboxOwner(tokenId) {
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        _verifyReferenceId(tokenId, referenceId);
        
        // Check that the new key is different from the current key
        if (_getActiveLockboxPublicKey(tokenId) == newPublicKey) revert DuplicateKey();


        bytes memory data = abi.encode(
            newPublicKey,
            referenceId,
            signatureExpiry
        );
        _verifySignature(
            tokenId,
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
        bytes memory signature,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant onlyLockboxOwner(tokenId) {
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        _verifyReferenceId(tokenId, referenceId);

        bytes memory data = abi.encode(referenceId, signatureExpiry);
        _verifySignature(
            tokenId,
            signature,
            address(0),
            OperationType.BURN_LOCKBOX,
            data
        );

        _finalizeBurn(tokenId);
        emit LockboxBurned(tokenId, referenceId);
    }
    
    /**
     * @dev Internal helper to create a new Lockbox
     * @param lockboxPublicKey The public key used for off-chain signature verification
     * @param referenceId An external reference ID for off-chain tracking
     * @return tokenId The newly minted token ID
     */
    function _createLockbox(
        address lockboxPublicKey,
        bytes32 referenceId
    ) internal returns (uint256) {
        // 1) Checks
        if (lockboxPublicKey == address(0)) revert ZeroKey();
        
        // 2) Effects
        uint256 tokenId = _nextId++;
        _initialize(tokenId, lockboxPublicKey, referenceId);
        _mint(msg.sender, tokenId);

        emit Locked(tokenId);
        emit Minted(tokenId, referenceId);
        
        return tokenId;
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
     * @notice Receive ETH only from allowed routers.
     * @dev Prevents orphaned ETH from direct transfers.
     *      Legitimate ETH comes through deposit functions and routers.
     */
    receive() external payable {
        // Only accept ETH from allowed routers
        if (!_isAllowedRouter(msg.sender)) {
            revert DirectETHTransferNotAllowed();
        }
    }
    
    fallback() external {
        revert FallbackNotAllowed();
    }
}
