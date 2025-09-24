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


    /* ───────── Treasury Constants ───────── */
    uint256 public constant TREASURY_LOCKBOX_ID = 0;
    uint256 public constant SWAP_FEE_BP = 20; // 0.2% fee


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
    error DuplicateEntry();
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
            // Uniswap Universal Router (canonical)
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
        
        // Use epoch-based O(n) duplicate detection
        uint256 epoch = ++_currentEpoch;
        
        for (uint256 i; i < tokenAddresses.length; ) {
            address tok = tokenAddresses[i];
            uint256 amt = tokenAmounts[i];
            
            // Check for duplicates in O(1) using epoch
            bytes32 tokenKey = keccak256(abi.encode(tok));
            if (_seenEpoch[tokenKey] == epoch) revert DuplicateEntry();
            _seenEpoch[tokenKey] = epoch;
            
            uint256 bal = balMap[tok];

            if (bal < amt) revert InsufficientTokenBalance();
            unchecked {
                balMap[tok] = bal - amt;
            }

            if (balMap[tok] == 0) {
                delete balMap[tok];
                _removeERC20Token(tokenId, tok);
            }

            IERC20(tok).safeTransfer(recipient, amt);
            unchecked {
                ++i;
            }
        }

        // — ERC-721s —        
        for (uint256 i; i < nftContracts.length; ) {
            bytes32 key = keccak256(abi.encodePacked(nftContracts[i], nftTokenIds[i]));
            
            // Check for duplicates in O(1) using epoch
            if (_seenEpoch[key] == epoch) revert DuplicateEntry();
            _seenEpoch[key] = epoch;
            
            if (_lockboxNftData[tokenId][key].nftContract == address(0)) revert NFTNotFound();

            delete _lockboxNftData[tokenId][key];
            _removeNFTKey(tokenId, key);

            IERC721(nftContracts[i]).safeTransferFrom(address(this), recipient, nftTokenIds[i]);
            unchecked {
                ++i;
            }
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
     * @param amountIn        The amount of input tokens to swap.
     * @param minAmountOut    Minimum amount of output tokens expected (slippage protection).
     * @param target          The router/aggregator contract address to execute swap.
     * @param data            The pre-built calldata for the swap execution.
     * @param referenceId     External reference ID for off-chain tracking.
     * @param signatureExpiry UNIX timestamp after which the signature is invalid.
     * @param recipient       The recipient address for swap output. Use address(0) to credit lockbox.
     *
     * Requirements:
     * - `tokenId` must exist and caller must be its owner.
     * - `block.timestamp` must be < `signatureExpiry`.
     * - Lockbox must have ≥ `amountIn` balance of `tokenIn`.
     * - `target` must not be the zero address.
     * - The swap must return ≥ `minAmountOut` tokens.
     * - If `recipient` is address(0), output is credited to lockbox, otherwise sent to recipient.
     */
    function swapInLockbox(
        uint256 tokenId,
        bytes32 messageHash,
        bytes memory signature,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address target,
        bytes calldata data,
        bytes32 referenceId,
        uint256 signatureExpiry,
        address recipient
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (block.timestamp > signatureExpiry) revert SignatureExpired();
        if (target == address(0)) revert ZeroAddress();
        if (amountIn == 0) revert ZeroAmount();
        if (tokenIn == tokenOut) revert InvalidSwap();

        // Validate router and calldata selector
        if (!_isAllowedRouter(target)) revert UnauthorizedRouter();
        if (!_isAllowedSelector(data)) revert UnauthorizedSelector();
        
        // 1) Verify signature
        bytes memory authData = abi.encode(
            tokenId,
            tokenIn,
            tokenOut,
            amountIn,
            minAmountOut,
            target,
            keccak256(data),
            referenceId,
            msg.sender,
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

        // 2) Check balance sufficiency (but don't deduct yet)
        if (tokenIn == address(0)) {
            if (_ethBalances[tokenId] < amountIn) revert NoETHBalance();
        } else {
            if (_erc20Balances[tokenId][tokenIn] < amountIn) revert InsufficientTokenBalance();
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

        // 4) Execute swap with USDT-safe approval pattern
        if (tokenIn != address(0)) {
            // Only reset to 0 if there's an existing approval to save gas
            uint256 currentAllowance = IERC20(tokenIn).allowance(address(this), target);
            if (currentAllowance != 0) {
                IERC20(tokenIn).forceApprove(target, 0);     // Reset first for USDT
            }
            IERC20(tokenIn).forceApprove(target, amountIn);
        }
        
        (bool success,) = target.call{value: tokenIn == address(0) ? amountIn : 0}(data);
        
        // Clean up approval
        if (tokenIn != address(0)) {
            IERC20(tokenIn).forceApprove(target, 0);
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
        uint256 amountOut = balanceOutAfter - balanceOutBefore;

        // 6) Calculate fee and validate slippage
        uint256 feeAmount = (amountOut * SWAP_FEE_BP) / 10000;
        uint256 userAmount = amountOut - feeAmount;
        
        if (userAmount < minAmountOut) revert SlippageExceeded();
        if (actualAmountIn > amountIn) revert RouterOverspent(); // Router took more than authorized

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
            if (tokenOut == address(0)) {
                _ethBalances[TREASURY_LOCKBOX_ID] += feeAmount;
            } else {
                // Register token if new for treasury
                if (_erc20Index[TREASURY_LOCKBOX_ID][tokenOut] == 0) {
                    _erc20Index[TREASURY_LOCKBOX_ID][tokenOut] = _erc20TokenAddresses[TREASURY_LOCKBOX_ID].length + 1;
                    _erc20TokenAddresses[TREASURY_LOCKBOX_ID].push(tokenOut);
                }
                _erc20Balances[TREASURY_LOCKBOX_ID][tokenOut] += feeAmount;
            }
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
            if (tokenOut == address(0)) {
                _ethBalances[tokenId] += userAmount;
            } else {
                // Register token if new for user
                if (_erc20Index[tokenId][tokenOut] == 0) {
                    _erc20Index[tokenId][tokenOut] = _erc20TokenAddresses[tokenId].length + 1;
                    _erc20TokenAddresses[tokenId].push(tokenOut);
                }
                _erc20Balances[tokenId][tokenOut] += userAmount;
            }
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
}
