// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC721/IERC721.sol';
import '@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol';
import './SignatureVerification.sol';

/**
 * @title Deposits
 * @dev Internal ETH/ERC20/ERC721 deposit and bookkeeping logic.
 *      Inherits SignatureVerification for key access and ReentrancyGuard for safety.
 */
abstract contract Deposits is SignatureVerification, IERC721Receiver, ReentrancyGuard {
    using SafeERC20 for IERC20;

    /* ───────── Events ───────── */
    event Deposited(uint256 indexed tokenId, bytes32 indexed referenceId);

    /* ───────── Errors ───────── */
    error NonexistentToken();
    error ZeroAddress();
    error ZeroAmount();
    error MismatchedInputs();
    error ETHMismatch();

    /* ───────── Storage ───────── */

    // ETH
    mapping(uint256 => uint256) internal _ethBalances;

    // ERC-20 bookkeeping
    mapping(uint256 => mapping(address => uint256)) internal _erc20Balances;
    mapping(uint256 => address[]) internal _erc20TokenAddresses;
    mapping(uint256 => mapping(address => bool)) internal _erc20Known;
    mapping(uint256 => mapping(address => uint256)) internal _erc20Index;

    // ERC-721 bookkeeping
    struct nftBalances {
        address nftContract;
        uint256 nftTokenId;
    }
    mapping(uint256 => bytes32[]) internal _nftKeys;
    mapping(uint256 => mapping(bytes32 => nftBalances)) internal _lockboxNftData;
    mapping(uint256 => mapping(bytes32 => bool)) internal _nftKnown;
    mapping(uint256 => mapping(bytes32 => uint256)) internal _nftIndex;

    /* ───────── Guards ───────── */
    function _requireOwnsLockbox(uint256 tokenId) internal view {
        if (_erc721.ownerOf(tokenId) != msg.sender) revert NotOwner();
    }
    
    // OPTIMIZATION 1: Cache owner check to avoid multiple SLOADs
    function _cacheOwnerAndRequire(uint256 tokenId) internal view returns (address owner) {
        try _erc721.ownerOf(tokenId) returns (address o) {
            owner = o;
        } catch {
            revert NonexistentToken();
        }
        if (owner == address(0)) revert NonexistentToken();
        if (owner != msg.sender) revert NotOwner();
        // Returns cached owner to avoid re-reading in calling function
    }
    
    function _requireExists(uint256 tokenId) internal view {
        address owner;
        try _erc721.ownerOf(tokenId) returns (address o) {
            owner = o;
        } catch {
            revert NonexistentToken();
        }
        if (owner == address(0)) revert NonexistentToken();
    }

    /* ───────── IERC721Receiver ───────── */
    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) public pure override returns (bytes4) {
        return this.onERC721Received.selector;
    }

    /* ══════════════════  USER-FACING DEPOSIT WRAPPERS  ══════════════════ */

    /*
     * @notice Deposit ETH into a Lockbox.
     * @param tokenId     The ID of the Lockbox.
     * @param referenceId External reference ID for off-chain tracking.
     *
     * Requirements:
     * - Caller must own the Lockbox.
     * - `msg.value` must be > 0.
     */
    function depositETH(uint256 tokenId, bytes32 referenceId) external payable nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (msg.value == 0) revert ZeroAmount();

        _ethBalances[tokenId] += msg.value;
        emit Deposited(tokenId, referenceId);
    }

    /*
     * @notice Deposit ERC-20 tokens into a Lockbox.
     * @param tokenId      The ID of the Lockbox.
     * @param tokenAddress The ERC-20 token contract address.
     * @param amount       The amount of tokens to deposit.
     * @param referenceId  External reference ID for off-chain tracking.
     */
    function depositERC20(
        uint256 tokenId,
        address tokenAddress,
        uint256 amount,
        bytes32 referenceId
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (tokenAddress == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();

        _depositERC20(tokenId, tokenAddress, amount);
        emit Deposited(tokenId, referenceId);
    }

    /*
     * @notice Deposit an ERC-721 NFT into a Lockbox.
     * @param tokenId     The ID of the Lockbox.
     * @param nftContract The ERC-721 contract address to deposit.
     * @param nftTokenId  The token ID of the ERC-721 to deposit.
     * @param referenceId External reference ID for off-chain tracking.
     */
    function depositERC721(
        uint256 tokenId,
        address nftContract,
        uint256 nftTokenId,
        bytes32 referenceId
    ) external nonReentrant {
        _requireOwnsLockbox(tokenId);
        if (nftContract == address(0)) revert ZeroAddress();

        _depositERC721(tokenId, nftContract, nftTokenId);
        emit Deposited(tokenId, referenceId);
    }

    /*
     * @notice Batch-deposit ETH, multiple ERC-20s, and multiple ERC-721s.
     * @param tokenId           The ID of the Lockbox.
     * @param amountETH         ETH amount (`msg.value` must match).
     * @param tokenAddresses    ERC-20 token addresses to deposit.
     * @param tokenAmounts      Corresponding ERC-20 amounts.
     * @param nftContracts      ERC-721 contract addresses to deposit.
     * @param nftTokenIds       Corresponding ERC-721 token IDs.
     * @param referenceId       External reference ID for off-chain tracking.
     */
    function batchDeposit(
        uint256 tokenId,
        uint256 amountETH,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds,
        bytes32 referenceId
    ) external payable nonReentrant {
        if (amountETH == 0 && tokenAddresses.length == 0 && nftContracts.length == 0)
            revert ZeroAmount();

        _requireOwnsLockbox(tokenId);
        if (msg.value != amountETH) revert ETHMismatch();
        if (
            tokenAddresses.length != tokenAmounts.length ||
            nftContracts.length != nftTokenIds.length
        ) revert MismatchedInputs();

        _batchDeposit(tokenId, amountETH, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds);
        emit Deposited(tokenId, referenceId);
    }

    /* ══════════════════  INTERNAL DEPOSIT HELPERS  ══════════════════ */

    /*
     * @dev Internal helper for ETH deposits.
     */
    function _depositETH(uint256 tokenId, uint256 amountETH) internal {
        _ethBalances[tokenId] += amountETH;
    }

    /*
     * @dev Internal helper for ERC-20 deposits.
     */
    function _depositERC20(uint256 tokenId, address token, uint256 amount) internal {
        IERC20 t = IERC20(token);

        // Interaction: pull tokens first
        uint256 before = t.balanceOf(address(this));
        t.safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = t.balanceOf(address(this)) - before;
        if (received == 0) revert ZeroAmount();

        // Register new token with index
        if (!_erc20Known[tokenId][token]) {
            _erc20Known[tokenId][token] = true;
            _erc20Index[tokenId][token] = _erc20TokenAddresses[tokenId].length + 1;
            _erc20TokenAddresses[tokenId].push(token);
        }

        _erc20Balances[tokenId][token] += received;
    }

    /*
     * @dev Internal helper for ERC-721 deposits.
     */
    function _depositERC721(uint256 tokenId, address nftContract, uint256 nftTokenId) internal {
        bytes32 key = keccak256(abi.encodePacked(nftContract, nftTokenId));

        if (!_nftKnown[tokenId][key]) {
            _nftKnown[tokenId][key] = true;
            _nftIndex[tokenId][key] = _nftKeys[tokenId].length + 1;
            _nftKeys[tokenId].push(key);
        }
        _lockboxNftData[tokenId][key] = nftBalances(nftContract, nftTokenId);

        IERC721(nftContract).safeTransferFrom(msg.sender, address(this), nftTokenId);
    }

    /*
     * @dev Batch helper with cached lengths & unchecked increments.
     */
    // OPTIMIZATION 2: Unchecked arithmetic in loops (saves ~200 gas per iteration)
    function _batchDeposit(
        uint256 tokenId,
        uint256 amountETH,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds
    ) internal {
        if (amountETH > 0) _ethBalances[tokenId] += amountETH;

        // Cache array lengths to avoid repeated .length calls
        uint256 tLen = tokenAddresses.length;
        for (uint256 i; i < tLen;) {
            _depositERC20(tokenId, tokenAddresses[i], tokenAmounts[i]);
            unchecked { ++i; }
        }

        uint256 nLen = nftContracts.length;
        for (uint256 j; j < nLen;) {
            _depositERC721(tokenId, nftContracts[j], nftTokenIds[j]);
            unchecked { ++j; }
        }
    }

    /* ══════════════════  REMOVAL UTILITIES  ══════════════════ */

    /*
     * @dev Remove an ERC-20 token address from the tracking array.
     */
    function _removeERC20Token(uint256 tokenId, address token) internal {
        uint256 idx = _erc20Index[tokenId][token];
        if (idx == 0) return;

        uint256 last = _erc20TokenAddresses[tokenId].length;
        if (idx != last) {
            address lastToken = _erc20TokenAddresses[tokenId][last - 1];
            _erc20TokenAddresses[tokenId][idx - 1] = lastToken;
            _erc20Index[tokenId][lastToken] = idx;
        }
        _erc20TokenAddresses[tokenId].pop();
        delete _erc20Index[tokenId][token];
    }

    /*
     * @dev Remove an ERC-721 key from the tracking array.
     */
    function _removeNFTKey(uint256 tokenId, bytes32 key) internal {
        uint256 idx = _nftIndex[tokenId][key];
        if (idx == 0) return;

        uint256 last = _nftKeys[tokenId].length;
        if (idx != last) {
            bytes32 lastKey = _nftKeys[tokenId][last - 1];
            _nftKeys[tokenId][idx - 1] = lastKey;
            _nftIndex[tokenId][lastKey] = idx;
        }
        _nftKeys[tokenId].pop();
        delete _nftIndex[tokenId][key];
    }
}
