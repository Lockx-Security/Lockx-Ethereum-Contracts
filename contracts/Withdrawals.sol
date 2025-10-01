// SPDX-License-Identifier: BUSL-1.1
// Copyright © 2025 Lockx. All rights reserved.
// This software is licensed under the Business Source License 1.1 (BUSL-1.1).
// You may use, modify, and distribute this code for non-commercial purposes only.
// For commercial use, you must obtain a license from Lockx.io.
// On or after January 1, 2029, this code will be made available under the MIT License.
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import './Deposits.sol';

/**
 * @title Withdrawals
 * @dev Signature-gated withdraw, swap, and view helpers.
 *      Inherits Deposits for storage & deposit helpers, and
 *      SignatureVerification for EIP-712 auth.
 */
abstract contract Withdrawals is Deposits {
    using SafeERC20 for IERC20;


    /* ───────── Enums ───────── */
    enum SwapMode {
        EXACT_IN,   // Specify exact input amount, get variable output
        EXACT_OUT   // Specify exact output amount, use variable input
    }

    /* ───────── Treasury Constants ───────── */
    uint256 public constant TREASURY_LOCKBOX_ID = 0;
    uint256 public constant SWAP_FEE_BP = 20; // 0.2% fee
    uint256 public constant SWAP_FEE_BP = 10;
    uint256 private constant FEE_DIVISOR = 10000;


    /* ───────── Events ───────── */
    event Withdrawn(uint256 indexed tokenId, bytes32 indexed referenceId);
    event SwapExecuted(uint256 indexed tokenId, bytes32 indexed referenceId);
    

    /* ───────── Errors ───────── */
    error NoETHBalance();
    error InsufficientTokenBalance();
    error NFTNotFound();
    error EthTransferFailed();
    error SignatureExpired();
    error SwapCallFailed();
    error InvalidSwap();
    error SlippageExceeded();
    error RouterOverspent();
    error InsufficientOutput();
    error DuplicateEntry();
    error UnsortedArray();
    error InvalidRecipient();
    error UnauthorizedRouter();
    error UnauthorizedSelector();


    /* ───────── Storage for O(n) duplicate detection ───────── */
    mapping(bytes32 => uint256) private _seenEpoch;
    uint256 private _currentEpoch = 1;

    /* ───────── Static router allowlist (mainnet) ───────── */
    function _isAllowedRouter(address target) private pure returns (bool) {
        return
            // Uniswap V3 SwapRouter02
            target == 0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45 ||
            // Uniswap Universal Router
            target == 0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B ||
            // 1inch Aggregation Router v6
            target == 0x111111125421cA6dc452d289314280a0f8842A65 ||
            // 0x Exchange Proxy
            target == 0xDef1C0ded9bec7F1a1670819833240f027b25EfF ||
            // Paraswap Augustus
            target == 0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57 ||
            // CowSwap GPv2 Settlement
            target == 0x9008D19f58AAbD9eD0D60971565AA8510560ab41;
    }

    /* ─────────────────── Lockbox withdrawals ───────────────────── */

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
        if (recipient == address(this)) revert InvalidRecipient();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        _verifyReferenceId(tokenId, referenceId);

        // 1) Verify
        bytes memory data = abi.encode(
            amountETH,
            recipient,
            referenceId,
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
        if (recipient == address(this)) revert InvalidRecipient();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        _verifyReferenceId(tokenId, referenceId);

        // 1) Verify
        bytes memory data = abi.encode(
            tokenAddress,
            amount,
            recipient,
            referenceId,
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
        if (recipient == address(this)) revert InvalidRecipient();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        _verifyReferenceId(tokenId, referenceId);

        // 1) Verify
        bytes memory data = abi.encode(
            nftContract,
            nftTokenId,
            recipient,
            referenceId,
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
        if (_lockboxNftData[tokenId][key].nftContract == address(0)) revert NFTNotFound();

        // 2) Effects
        delete _lockboxNftData[tokenId][key];
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
     * - `tokenAddresses` must be sorted in strictly ascending order (no duplicates).
     * - NFT pairs `(nftContract, nftTokenId)` must be sorted in strictly ascending lexicographic order
     *   by `(nftContract, nftTokenId)` (no duplicates).
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
        if (recipient == address(this)) revert InvalidRecipient();
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert MismatchedInputs();
        _verifyReferenceId(tokenId, referenceId);

        // 1) Verify
        bytes memory data = abi.encode(
            amountETH,
            tokenAddresses,
            tokenAmounts,
            nftContracts,
            nftTokenIds,
            recipient,
            referenceId,
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

        // — ERC-20s — enforce strictly increasing addresses (no duplicates)
        mapping(address => uint256) storage lockboxTokenBalances = _erc20Balances[tokenId];
        address previousTokenAddress;
        bool hasPreviousTokenAddress;
        for (uint256 i; i < tokenAddresses.length; ) {
            address tokenAddress = tokenAddresses[i];
            uint256 tokenAmount = tokenAmounts[i];

            if (hasPreviousTokenAddress) {
                if (uint256(uint160(tokenAddress)) <= uint256(uint160(previousTokenAddress))) revert UnsortedArray();
            } else {
                hasPreviousTokenAddress = true;
            }

            uint256 currentBalance = lockboxTokenBalances[tokenAddress];
            if (currentBalance < tokenAmount) revert InsufficientTokenBalance();
            unchecked {
                lockboxTokenBalances[tokenAddress] = currentBalance - tokenAmount;
            }

            if (lockboxTokenBalances[tokenAddress] == 0) {
                delete lockboxTokenBalances[tokenAddress];
                _removeERC20Token(tokenId, tokenAddress);
            }

            IERC20(tokenAddress).safeTransfer(recipient, tokenAmount);
            previousTokenAddress = tokenAddress;
            unchecked { ++i; }
        }

        // — ERC-721s — enforce strictly increasing lexicographic order by (contract, tokenId)
        address previousNftContract;
        uint256 previousNftTokenId;
        bool hasPreviousNft;
        for (uint256 i; i < nftContracts.length; ) {
            address nftContract = nftContracts[i];
            uint256 nftTokenId = nftTokenIds[i];

            if (hasPreviousNft) {
                if (nftContract < previousNftContract || (nftContract == previousNftContract && nftTokenId <= previousNftTokenId)) revert UnsortedArray();
            } else {
                hasPreviousNft = true;
            }

            bytes32 key = keccak256(abi.encodePacked(nftContract, nftTokenId));
            if (_lockboxNftData[tokenId][key].nftContract == address(0)) revert NFTNotFound();

            delete _lockboxNftData[tokenId][key];
            _removeNFTKey(tokenId, key);

            IERC721(nftContract).safeTransferFrom(address(this), recipient, nftTokenId);
            previousNftContract = nftContract;
            previousNftTokenId = nftTokenId;
            unchecked { ++i; }
        }

        emit Withdrawn(tokenId, referenceId);
    }

    /*
     * @notice Execute an asset swap within a Lockbox, authorized via EIP-712 signature.
     * @param tokenId         The ID of the Lockbox.
     * @param messageHash     The EIP-712 digest that was signed.
     * @param signature       The EIP-712 signature by the active Lockbox key.
     * @param tokenIn         The input token address (address(0) for ETH).
     * @param tokenOut        The output token address (address(0) for ETH).
     * @param swapMode        Whether this is EXACT_IN or EXACT_OUT swap.
     * @param amountSpecified For EXACT_IN: input amount. For EXACT_OUT: desired output amount.
     * @param amountLimit     For EXACT_IN: min output. For EXACT_OUT: max input allowed.
     * @param target          The router/aggregator contract address to execute swap.
     * @param data            The pre-built calldata for the swap execution.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     * @param recipient       The recipient address for swap output. Use address(0) to credit lockbox.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `block.timestamp` must be < `signatureExpiry`.
     * - For EXACT_IN: Lockbox must have ≥ amountSpecified of tokenIn.
     * - For EXACT_OUT: Lockbox must have ≥ amountLimit of tokenIn (max you're willing to spend).
     * - `target` must be an allowed router.
     * - For EXACT_IN: Must receive ≥ amountLimit of tokenOut (min acceptable output).
     * - For EXACT_OUT: Must receive ≥ amountSpecified of tokenOut and spend ≤ amountLimit of tokenIn.
     * - If `recipient` is address(0), output is credited to lockbox, otherwise sent to recipient.
     */
    function swapInLockbox(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address tokenIn,
        address tokenOut,
        SwapMode swapMode,
        uint256 amountSpecified,
        uint256 amountLimit,
        address target,
        bytes calldata data,
        bytes32 referenceId,
        uint256 signatureExpiry,
        address recipient
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        if (amountSpecified == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert InvalidSwap();

        // Validate router and calldata selector (also handles zero address)
        if (!_isAllowedRouter(target)) revert UnauthorizedRouter();
        if (!_isAllowedSelector(data)) revert UnauthorizedSelector();

        // 1) Verify signature
        bytes memory authData = abi.encode(
            tokenIn,
            tokenOut,
            uint8(swapMode),
            amountSpecified,
            amountLimit,
            target,
            keccak256(data),
            referenceId,
            signatureExpiry,
            recipient
        );
        verifySignature(
            tokenId,
            messageHash,
            signature,
            address(0),
            OperationType.SWAP_ASSETS,
            authData
        );

        // 2) For EXACT_IN, check balance sufficiency upfront
        if (swapMode == SwapMode.EXACT_IN) {
            if (tokenIn == address(0)) {
                if (_ethBalances[tokenId] < amountSpecified) revert NoETHBalance();
            } else {
                if (_erc20Balances[tokenId][tokenIn] < amountSpecified) revert InsufficientTokenBalance();
            }
        } else {
            // For EXACT_OUT, check maximum input allowed
            if (tokenIn == address(0)) {
                if (_ethBalances[tokenId] < amountLimit) revert NoETHBalance();
            } else {
                if (_erc20Balances[tokenId][tokenIn] < amountLimit) revert InsufficientTokenBalance();
            }
        }

        // 3) Measure balances before swap
        uint256 balanceInBefore;
        if (tokenIn == address(0)) {
            balanceInBefore = address(this).balance;
        } else {
            balanceInBefore = IERC20(tokenIn).balanceOf(address(this));
        }
        
        uint256 balanceOutBefore;
        if (tokenOut == address(0)) {
            balanceOutBefore = address(this).balance;
        } else {
            balanceOutBefore = IERC20(tokenOut).balanceOf(address(this));
        }

        // 4) Execute swap with approval
        uint256 approvalAmount;
        uint256 ethValue;
        
        if (swapMode == SwapMode.EXACT_IN) {
            approvalAmount = amountSpecified;
            ethValue = (tokenIn == address(0)) ? amountSpecified : 0;
        } else {
            // For EXACT_OUT, approve the maximum we're willing to spend
            approvalAmount = amountLimit;
            ethValue = (tokenIn == address(0)) ? amountLimit : 0;
        }
        
        if (tokenIn != address(0)) {
            IERC20(tokenIn).forceApprove(target, approvalAmount);
        }
        
        (bool success,) = target.call{value: ethValue}(data);
        
        // Clean up approval
        if (tokenIn != address(0)) {
            IERC20(tokenIn).approve(target, 0);
        }
        
        if (!success) revert SwapCallFailed();

        // 5) Measure actual amounts transferred
        uint256 balanceInAfter;
        if (tokenIn == address(0)) {
            balanceInAfter = address(this).balance;
        } else {
            balanceInAfter = IERC20(tokenIn).balanceOf(address(this));
        }
        
        uint256 balanceOutAfter;
        if (tokenOut == address(0)) {
            balanceOutAfter = address(this).balance;
        } else {
            balanceOutAfter = IERC20(tokenOut).balanceOf(address(this));
        }
        
        // Calculate actual amounts (handles fee-on-transfer tokens)
        uint256 actualAmountIn = balanceInBefore - balanceInAfter;
        uint256 actualAmountOut = balanceOutAfter - balanceOutBefore;

        // 6) Validate swap based on mode
        if (swapMode == SwapMode.EXACT_IN) {
            // For EXACT_IN: verify we got at least minimum output
            if (actualAmountOut < amountLimit) revert SlippageExceeded();
            // Router shouldn't take more than specified
            if (actualAmountIn > amountSpecified) revert RouterOverspent();
        } else {
            // For EXACT_OUT: verify we didn't spend more than maximum
            if (actualAmountIn > amountLimit) revert SlippageExceeded();
            // We should get at least the specified output
            if (actualAmountOut < amountSpecified) revert InsufficientOutput();
        }
        
        // 6) Calculate fee and validate slippage
        uint256 feeAmount = (actualAmountOut * SWAP_FEE_BP + FEE_DIVISOR - 1) / FEE_DIVISOR;
        uint256 userAmount = actualAmountOut - feeAmount;

        // 7) Update accounting with actual amounts (handles fee-on-transfer)
        // Deduct actual input amount
        if (tokenIn == address(0)) {
            _ethBalances[tokenId] -= actualAmountIn;
        } else {
            _erc20Balances[tokenId][tokenIn] -= actualAmountIn;
            
            // Clean up if balance is now 0
            if (_erc20Balances[tokenId][tokenIn] == 0) {
                delete _erc20Balances[tokenId][tokenIn];
                _removeERC20Token(tokenId, tokenIn);
            }
        }
        
        // Credit fee to treasury lockbox
        if (feeAmount > 0) {
            _creditToLockbox(TREASURY_LOCKBOX_ID, tokenOut, feeAmount);
        }
        
        // Credit user amount to recipient or lockbox
        if (recipient != address(0)) {
            // Send directly to external recipient
            if (tokenOut == address(0)) {
                (bool ethSuccess, ) = payable(recipient).call{value: userAmount}('');
                if (!ethSuccess) revert EthTransferFailed();
            } else {
                IERC20(tokenOut).safeTransfer(recipient, userAmount);
            }
        } else {
            // Credit to user's lockbox
            _creditToLockbox(tokenId, tokenOut, userAmount);
        }

        emit SwapExecuted(tokenId, referenceId);
    }


    /* ─────────────────── View helpers ──────────────────── */

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
            if (_lockboxNftData[tokenId][nftList[i]].nftContract != address(0)) count++;
            unchecked {
                ++i;
            }
        }
        nftContracts = new nftBalances[](count);
        uint256 idx;
        for (uint256 i; i < nftList.length; ) {
            if (_lockboxNftData[tokenId][nftList[i]].nftContract != address(0)) {
                nftContracts[idx++] = _lockboxNftData[tokenId][nftList[i]];
            }
            unchecked {
                ++i;
            }
        }
    }
    
    /**
     * @dev Internal helper to credit tokens to a lockbox.
     * @param tokenId The lockbox token ID.
     * @param token The token address (address(0) for ETH).
     * @param amount Amount to credit.
     */
    function _creditToLockbox(uint256 tokenId, address token, uint256 amount) internal {
        if (token == address(0)) {
            _ethBalances[tokenId] += amount;
        } else {
            // Register token if new
            if (_erc20Balances[tokenId][token] == 0) {
                _erc20TokenAddresses[tokenId].push(token);
                _erc20Index[tokenId][token] = _erc20TokenAddresses[tokenId].length - 1;
            }
            _erc20Balances[tokenId][token] += amount;
        }
    }

    /**
     * @dev Check if a router is in the immutable allowlist.
     * @param router The router address to check.
     * @return bool True if the router is allowed.
     */
    function _isAllowedRouter(address router) private pure returns (bool) {
        return
            // Uniswap Universal Router (standard - supports V2/V3/V4)
            router == 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD ||
            // Uniswap V4 Universal Router (V4-specific)
            router == 0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af ||
            // 1inch v6 Aggregation Router (latest)
            router == 0x111111125421cA6dc452d289314280a0f8842A65 ||
            // 0x Exchange Proxy
            router == 0xDef1C0ded9bec7F1a1670819833240f027b25EfF ||
            // Paraswap v5 Augustus Swapper
            router == 0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57 ||
            // Cowswap GPv2Settlement
            router == 0x9008D19f58AAbD9eD0D60971565AA8510560ab41;
    }

    /**
     * @dev Check if the calldata selector is allowed for swap operations.
     * Prevents arbitrary function calls by whitelisting safe swap selectors.
     * @param data The calldata to validate
     * @return bool True if the selector is allowed for swaps
     */
    function _isAllowedSelector(bytes calldata data) private pure returns (bool) {
        if (data.length < 4) return false;
        
        bytes4 selector = bytes4(data[:4]);
        
        return
            // Uniswap V3 Router
            selector == 0x04e45aaf || // exactInputSingle(address,address,uint24,address,uint256,uint256,uint160)
            selector == 0x5023b4df || // exactOutputSingle(address,address,uint24,address,uint256,uint256,uint160)  
            selector == 0xc04b8d59 || // exactInput
            selector == 0xf28c0498 || // exactOutput
            
            // Uniswap Universal Router
            selector == 0x3593564c || // execute(bytes,bytes[],uint256)
            selector == 0x24856bc3 || // execute(bytes,bytes[])
            
            // 1inch v6 (AggregationRouterV6.swap(address,(..),bytes))
            selector == 0x6b1ef56f || // swap(address,(...),bytes)
            
            // 0x Protocol (Exchange Proxy)
            selector == 0x415565b0 || // transformERC20
            selector == 0xd9627aa4 || // sellToUniswap
            
            // Paraswap Augustus
            selector == 0x54e3f31b || // simpleSwap
            selector == 0xa94e78ef || // multiSwap
            
            // CowSwap GPv2 Settlement
            selector == 0x13d79a0b;   // settle
    }

    /**
     * @notice Get list of all allowed routers (for transparency).
     * @return address[] Array of allowed router addresses.
     */
    function getAllowedRouters() external pure returns (address[] memory) {
        address[] memory routers = new address[](6);
        routers[0] = 0x3fC91A3afd70395Cd496C647d5a6CC9D4B2b7FAD; // Uniswap Universal Router
        routers[1] = 0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af; // Uniswap V4 Universal Router
        routers[2] = 0x111111125421cA6dc452d289314280a0f8842A65; // 1inch v6
        routers[3] = 0xDef1C0ded9bec7F1a1670819833240f027b25EfF; // 0x
        routers[4] = 0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57; // Paraswap
        routers[5] = 0x9008D19f58AAbD9eD0D60971565AA8510560ab41; // Cowswap
        return routers;
    }

    /**
     * @notice Check if a router is allowed (public helper).
     * @param router The router address to check.
     * @return bool True if the router is allowed.
     */
    function isAllowedRouter(address router) external pure returns (bool) {
        return _isAllowedRouter(router);
    }
}
