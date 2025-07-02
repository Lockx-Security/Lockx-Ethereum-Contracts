// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './Deposits.sol';

/**
 * @title Withdrawals
 * @dev Signature-gated withdraw, burn, key-rotation, plus view helpers.
 *      Inherits Deposits for storage & deposit helpers, and
 *      SignatureVerification for EIP-712 auth.
 */
abstract contract Withdrawals is Deposits {
    using SafeERC20 for IERC20;

    /* ───────── Events ───────── */
    event Withdrawn(uint256 indexed tokenId, bytes32 indexed referenceId);
    event LockboxBurned(uint256 indexed tokenId, bytes32 indexed referenceId);
    event KeyRotated(uint256 indexed tokenId, bytes32 indexed referenceId);

    /* ───────── Errors ───────── */
    error NoETHBalance();
    error InsufficientTokenBalance();
    error NFTNotFound();
    error EthTransferFailed();
    error SignatureExpired();

    /* ══════════════════  USER-FACING WITHDRAWAL METHODS  ══════════════════ */

    /*
     * @notice Withdraw ETH from a Lockbox, authorized via EIP-712 signature.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param amountETH       The amount of ETH to withdraw.
     * @param recipient       The address receiving the ETH.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `recipient` must not be the zero address.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     * - Lockbox must have ≥ `amountETH` ETH
     */
    function withdrawETH(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        uint256 amountETH,
        address recipient,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        // 1) Verify
        bytes memory data = abi.encode(
            tokenId,
            amountETH,
            recipient,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.WITHDRAW_ETH,
            data
        );

        // 2) Effects
        uint256 currentBal = _ethBalances[tokenId];
        if (currentBal < amountETH) revert NoETHBalance();
        _ethBalances[tokenId] = currentBal - amountETH;

        // 3) Interaction
        (bool success, ) = payable(recipient).call{value: amountETH}('');
        if (!success) revert EthTransferFailed();

        emit Withdrawn(tokenId, referenceId);
    }

    /*
     * @notice Withdraw an ERC-20 token from a Lockbox, authorized via EIP-712 signature.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param tokenAddress    The ERC-20 token address to withdraw.
     * @param amount          The amount of tokens to withdraw.
     * @param recipient       The address receiving the tokens.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `recipient` must not be the zero address.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     * - Lockbox must have ≥ `amount` balance of `tokenAddress`.
     */
    function withdrawERC20(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address tokenAddress,
        uint256 amount,
        address recipient,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        // 1) Verify
        bytes memory data = abi.encode(
            tokenId,
            tokenAddress,
            amount,
            recipient,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.WITHDRAW_ERC20,
            data
        );

        // 2) Effects
        mapping(address => uint256) storage balMap = _erc20Balances[tokenId];
        uint256 bal = balMap[tokenAddress];

        if (bal < amount) revert InsufficientTokenBalance();
        unchecked {
            balMap[tokenAddress] = bal - amount;
        }

        if (balMap[tokenAddress] == 0) {
            // Full storage refund for setting slot from non-zero → zero
            delete balMap[tokenAddress];
            _removeERC20Token(tokenId, tokenAddress);
            delete _erc20Known[tokenId][tokenAddress];
        }

        // 3) Interaction
        IERC20(tokenAddress).safeTransfer(recipient, amount);

        emit Withdrawn(tokenId, referenceId);
    }

    /*
     * @notice Withdraw an ERC-721 token from a Lockbox, authorized via EIP-712 signature.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param nftContract     The ERC-721 contract address to withdraw.
     * @param nftTokenId      The token ID of the ERC-721 to withdraw.
     * @param recipient       The address receiving the NFT.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `recipient` must not be the zero address.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     * - The specified NFT must be deposited in this Lockbox.
     */
    function withdrawERC721(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address nftContract,
        uint256 nftTokenId,
        address recipient,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();

        // 1) Verify
        bytes memory data = abi.encode(
            tokenId,
            nftContract,
            nftTokenId,
            recipient,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.WITHDRAW_NFT,
            data
        );

        bytes32 key = keccak256(abi.encodePacked(nftContract, nftTokenId));
        if (!_nftKnown[tokenId][key]) revert NFTNotFound();

        // 2) Effects
        delete _lockboxNftData[tokenId][key];
        _nftKnown[tokenId][key] = false;
        _removeNFTKey(tokenId, key);

        // 3) Interaction
        IERC721(nftContract).safeTransferFrom(address(this), recipient, nftTokenId);

        emit Withdrawn(tokenId, referenceId);
    }

    /*
     * @notice Batch withdrawal of ETH, ERC-20s, and ERC-721s with a single signature.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param amountETH       The amount of ETH to withdraw.
     * @param tokenAddresses  The list of ERC-20 token addresses to withdraw.
     * @param tokenAmounts    The corresponding amounts of each ERC-20 to withdraw.
     * @param nftContracts    The list of ERC-721 contract addresses to withdraw.
     * @param nftTokenIds     The corresponding ERC-721 token IDs to withdraw.
     * @param recipient       The address receiving all assets.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `recipient` must not be the zero address.
     * - `block.timestamp` must be ≤ `signatureExpiry`.
     * - `tokenAddresses.length` must equal `tokenAmounts.length`.
     * - `nftContracts.length` must equal `nftTokenIds.length`.
     * - Lockbox must have ≥ `amountETH` ETH and sufficient balances for each asset.
     */
    function batchWithdraw(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        uint256 amountETH,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds,
        address recipient,
        bytes32 referenceId,
        uint256 signatureExpiry
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (recipient == address(0)) revert ZeroAddress();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert MismatchedInputs();

        // 1) Verify
        bytes memory data = abi.encode(
            tokenId,
            amountETH,
            tokenAddresses,
            tokenAmounts,
            nftContracts,
            nftTokenIds,
            recipient,
            referenceId,
            msg.sender,
            signatureExpiry
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.BATCH_WITHDRAW,
            data
        );

        // 2/3) Effects + Interactions for each asset type
        if (amountETH > 0) {
            uint256 currentBal = _ethBalances[tokenId];
            if (currentBal < amountETH) revert NoETHBalance();
            _ethBalances[tokenId] = currentBal - amountETH;
            (bool success, ) = payable(recipient).call{value: amountETH}('');
            if (!success) revert EthTransferFailed();
        }

        // — ERC-20s —
        mapping(address => uint256) storage balMap = _erc20Balances[tokenId];
        for (uint256 i; i < tokenAddresses.length; ) {
            address tok = tokenAddresses[i];
            uint256 amt = tokenAmounts[i];
            uint256 bal = balMap[tok];

            if (bal < amt) revert InsufficientTokenBalance();
            unchecked {
                balMap[tok] = bal - amt;
            }

            if (balMap[tok] == 0) {
                delete balMap[tok];
                _removeERC20Token(tokenId, tok);
                delete _erc20Known[tokenId][tok];
            }

            IERC20(tok).safeTransfer(recipient, amt);
            unchecked {
                ++i;
            }
        }

        // — ERC-721s —
        for (uint256 i; i < nftContracts.length; ) {
            bytes32 key = keccak256(abi.encodePacked(nftContracts[i], nftTokenIds[i]));
            if (!_nftKnown[tokenId][key]) revert NFTNotFound();

            delete _lockboxNftData[tokenId][key];
            _nftKnown[tokenId][key] = false;
            _removeNFTKey(tokenId, key);

            IERC721(nftContracts[i]).safeTransferFrom(address(this), recipient, nftTokenIds[i]);
            unchecked {
                ++i;
            }
        }

        emit Withdrawn(tokenId, referenceId);
    }

    /* ══════════════════  Key-rotation  ══════════════════ */

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

    /* ══════════════════  Burn  ══════════════════ */

    /* abstract hook for Lockbox to burn its own ERC-721 */
    function _burnLockboxNFT(uint256 id) internal virtual;

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
     *      - Delegates the actual ERC-721 burn to `_burnLockboxNFT` (implemented in Lockbox).
     */
    function _finalizeBurn(uint256 tokenId) internal {
        /* ---- ETH ---- */
        delete _ethBalances[tokenId];

        /* ---- ERC-20 balances ---- */
        address[] storage toks = _erc20TokenAddresses[tokenId];
        for (uint256 i; i < toks.length; ) {
            address t = toks[i];
            delete _erc20Balances[tokenId][t];
            delete _erc20Known[tokenId][t];
            unchecked {
                ++i;
            }
        }
        delete _erc20TokenAddresses[tokenId];

        /* ---- ERC-721 bookkeeping ---- */
        bytes32[] storage keys = _nftKeys[tokenId];
        for (uint256 i; i < keys.length; ) {
            bytes32 k = keys[i];
            delete _lockboxNftData[tokenId][k];
            delete _nftKnown[tokenId][k];
            unchecked {
                ++i;
            }
        }
        delete _nftKeys[tokenId];

        /* ---- finally burn the NFT itself ---- */
        _burnLockboxNFT(tokenId);
        _purgeAuth(tokenId);
    }

    /* ══════════════════  View helper  ══════════════════ */

    /*
     * @notice Returns the full contents of a Lockbox: ETH, ERC-20 balances, and ERC-721s.
     * @param tokenId The ID of the Lockbox.
     * @return ethBalances      The ETH amount held.
     * @return erc20Tokens Array of (tokenAddress, balance) for each ERC-20.
     * @return nfts        Array of nftBalances structs representing each ERC-721.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     */
    struct erc20Balances {
        address tokenAddress;
        uint256 balance;
    }

    function getFullLockbox(
        uint256 tokenId
    )
        external
        view
        returns (
            uint256 lockboxETH,
            erc20Balances[] memory erc20Tokens,
            nftBalances[] memory nftContracts
        )
    {
        _requireExists(tokenId);
        if (_erc721.ownerOf(tokenId) != msg.sender) revert NotOwner();

        lockboxETH = _ethBalances[tokenId];

        // ERC-20s
        address[] storage tokenAddresses = _erc20TokenAddresses[tokenId];
        erc20Tokens = new erc20Balances[](tokenAddresses.length);
        for (uint256 i; i < tokenAddresses.length; ) {
            erc20Tokens[i] = erc20Balances({
                tokenAddress: tokenAddresses[i],
                balance: _erc20Balances[tokenId][tokenAddresses[i]]
            });
            unchecked {
                ++i;
            }
        }

        // ERC-721s
        bytes32[] storage nftList = _nftKeys[tokenId];
        uint256 count;
        for (uint256 i; i < nftList.length; ) {
            if (_nftKnown[tokenId][nftList[i]]) count++;
            unchecked {
                ++i;
            }
        }
        nftContracts = new nftBalances[](count);
        uint256 idx;
        for (uint256 i; i < nftList.length; ) {
            if (_nftKnown[tokenId][nftList[i]]) {
                nftContracts[idx++] = _lockboxNftData[tokenId][nftList[i]];
            }
            unchecked {
                ++i;
            }
        }
    }
}
