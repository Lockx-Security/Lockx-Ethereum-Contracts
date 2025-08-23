// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC721/ERC721.sol';
import '@openzeppelin/contracts/utils/ReentrancyGuard.sol';
import '@openzeppelin/contracts/access/Ownable.sol';
import './interfaces/ILockxZK.sol';
import './libraries/Commitments.sol';
import './libraries/MerkleTree.sol';
import './verifiers/IVerifier.sol';

/**
 * @title LockxZK
 * @dev Zero-knowledge privacy-enabled Lockbox system with soul-bound NFTs
 *      Maintains public ownership while privatizing balances and transactions
 */
contract LockxZK is ERC721, ReentrancyGuard, Ownable, ILockxZK {
    using Commitments for bytes32;
    using MerkleTree for MerkleTree.TreeData;
    
    /* ─────────────────────────── State Variables ───────────────────────────── */
    
    // NFT counter
    uint256 private _nextId;
    
    // Identity Layer (Public)
    mapping(uint256 => string) public metadataURIs;
    mapping(uint256 => bool) public isPrivateMode;
    
    // Commitment Layer (Private) 
    mapping(uint256 => bytes32) private _balanceCommitments;
    mapping(uint256 => uint256) private _nonces;
    
    // Nullifier tracking
    mapping(bytes32 => bool) public nullifiers;
    
    // Merkle trees
    MerkleTree.TreeData private _depositTree;
    MerkleTree.TreeData private _withdrawalTree;
    bytes32 public stateRoot;
    
    // Proof verifiers
    IVerifier public immutable depositVerifier;
    IVerifier public immutable withdrawVerifier;
    IVerifier public immutable transferVerifier;
    
    // Privacy pool for mixing
    mapping(bytes32 => bool) public commitmentPool;
    uint256 public poolBalance;
    
    /* ─────────────────────────── Events ───────────────────────────── */
    
    event PrivateLockboxCreated(uint256 indexed tokenId, address indexed owner, bytes32 commitment);
    event PrivateDeposit(bytes32 indexed commitment, uint256 amount);
    event WithdrawalQueued(bytes32 indexed commitment, uint256 indexed nonce);
    event WithdrawalClaimed(address indexed recipient, uint256 amount, bytes32 nullifier);
    event StateTransition(uint256[] nftIds, bytes32 newStateRoot);
    event Locked(uint256 tokenId); // ERC-5192 Soulbound
    
    /* ─────────────────────────── Errors ───────────────────────────── */
    
    error InvalidProof();
    error NullifierAlreadyUsed();
    error InsufficientPoolBalance();
    error NotOwner();
    error TransfersDisabled();
    error InvalidCommitment();
    error ZeroAmount();
    
    /* ─────────────────────────── Constructor ───────────────────────────── */
    
    constructor(
        address _depositVerifier,
        address _withdrawVerifier,
        address _transferVerifier
    ) ERC721('Lockx ZK', 'zkLOCKBOX') Ownable(msg.sender) {
        depositVerifier = IVerifier(_depositVerifier);
        withdrawVerifier = IVerifier(_withdrawVerifier);
        transferVerifier = IVerifier(_transferVerifier);
        
        // Initialize merkle trees with depth 20 (2^20 leaves)
        _depositTree.initialize(20);
        _withdrawalTree.initialize(20);
    }
    
    /* ─────────────────────────── NFT Creation ───────────────────────────── */
    
    /**
     * @notice Create a new private Lockbox NFT with hidden balance
     * @param initialCommitment Commitment hiding the initial balance
     * @return tokenId The ID of the newly minted NFT
     */
    function createPrivateLockbox(
        bytes32 initialCommitment
    ) external payable nonReentrant returns (uint256) {
        if (msg.value == 0) revert ZeroAmount();
        if (initialCommitment == bytes32(0)) revert InvalidCommitment();
        
        uint256 tokenId = _nextId++;
        _mint(msg.sender, tokenId);
        
        // Set up private balance
        _balanceCommitments[tokenId] = initialCommitment;
        isPrivateMode[tokenId] = true;
        
        // Add to deposit tree for privacy mixing
        _depositTree.insert(initialCommitment);
        
        // Track pool balance
        poolBalance += msg.value;
        
        emit PrivateLockboxCreated(tokenId, msg.sender, initialCommitment);
        emit Locked(tokenId); // Soulbound
        
        return tokenId;
    }
    
    /* ─────────────────────────── Private Deposits ───────────────────────────── */
    
    /**
     * @notice Deposit funds privately without revealing target NFT
     * @param depositCommitment New commitment after deposit
     * @param decoyCommitments Array of commitments to hide target among
     * @param proof ZK proof of valid deposit
     */
    function depositPrivate(
        bytes32 depositCommitment,
        bytes32[] calldata decoyCommitments,
        bytes calldata proof
    ) external payable nonReentrant {
        if (msg.value == 0) revert ZeroAmount();
        
        // Verify proof that sender owns one of the NFTs in decoys
        // and the deposit commitment is valid
        uint256[] memory pubSignals = new uint256[](4);
        pubSignals[0] = uint256(depositCommitment);
        pubSignals[1] = uint256(msg.value);
        pubSignals[2] = uint256(uint160(msg.sender));
        pubSignals[3] = decoyCommitments.length;
        
        if (!depositVerifier.verifyProof(proof, pubSignals)) {
            revert InvalidProof();
        }
        
        // Update global state
        _depositTree.insert(depositCommitment);
        poolBalance += msg.value;
        
        emit PrivateDeposit(depositCommitment, msg.value);
    }
    
    /* ─────────────────────────── Private Withdrawals ───────────────────────────── */
    
    /**
     * @notice Queue a withdrawal that hides the recipient
     * @param withdrawalCommitment Commitment containing withdrawal details
     * @param authProof Proof of NFT ownership and sufficient balance
     */
    function queueWithdrawal(
        bytes32 withdrawalCommitment,
        bytes calldata authProof
    ) external nonReentrant {
        // Verify the sender has authority and balance
        uint256[] memory pubSignals = new uint256[](2);
        pubSignals[0] = uint256(withdrawalCommitment);
        pubSignals[1] = uint256(_withdrawalTree.root());
        
        if (!withdrawVerifier.verifyProof(authProof, pubSignals)) {
            revert InvalidProof();
        }
        
        // Add to withdrawal queue
        _withdrawalTree.insert(withdrawalCommitment);
        
        emit WithdrawalQueued(withdrawalCommitment, _nonces[0]++);
    }
    
    /**
     * @notice Claim a queued withdrawal with ZK proof
     * @param recipient Address to receive funds
     * @param amount Amount to withdraw
     * @param nullifier Unique nullifier to prevent double-spending
     * @param zkProof Proof of valid withdrawal authorization
     */
    function claimWithdrawal(
        address recipient,
        uint256 amount,
        bytes32 nullifier,
        bytes calldata zkProof
    ) external nonReentrant {
        // Check nullifier hasn't been used
        if (nullifiers[nullifier]) revert NullifierAlreadyUsed();
        if (amount > poolBalance) revert InsufficientPoolBalance();
        
        // Verify ZK proof
        uint256[] memory pubSignals = new uint256[](4);
        pubSignals[0] = uint256(_withdrawalTree.root());
        pubSignals[1] = uint256(nullifier);
        pubSignals[2] = uint256(uint160(recipient));
        pubSignals[3] = amount;
        
        if (!withdrawVerifier.verifyProof(zkProof, pubSignals)) {
            revert InvalidProof();
        }
        
        // Mark nullifier as used
        nullifiers[nullifier] = true;
        poolBalance -= amount;
        
        // Transfer funds
        (bool success, ) = payable(recipient).call{value: amount}("");
        require(success, "Transfer failed");
        
        emit WithdrawalClaimed(recipient, amount, nullifier);
    }
    
    /* ─────────────────────────── Internal Transfers ───────────────────────────── */
    
    /**
     * @notice Private transfer between owned NFTs
     * @param nftIds Array of NFT IDs involved in transfer
     * @param newStateRoot New state root after transfer
     * @param proof Proof of valid state transition
     */
    function privateTransfer(
        uint256[] calldata nftIds,
        bytes32 newStateRoot,
        bytes calldata proof
    ) external nonReentrant {
        // Verify ownership of all NFTs
        for (uint256 i = 0; i < nftIds.length; i++) {
            if (ownerOf(nftIds[i]) != msg.sender) revert NotOwner();
        }
        
        // Verify state transition proof
        uint256[] memory pubSignals = new uint256[](3);
        pubSignals[0] = uint256(stateRoot);
        pubSignals[1] = uint256(newStateRoot);
        pubSignals[2] = nftIds.length;
        
        if (!transferVerifier.verifyProof(proof, pubSignals)) {
            revert InvalidProof();
        }
        
        // Update state
        stateRoot = newStateRoot;
        
        // Update nonces for involved NFTs
        for (uint256 i = 0; i < nftIds.length; i++) {
            _nonces[nftIds[i]]++;
        }
        
        emit StateTransition(nftIds, newStateRoot);
    }
    
    /* ─────────────────────────── View Functions ───────────────────────────── */
    
    /**
     * @notice Check if a nullifier has been used
     */
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return nullifiers[nullifier];
    }
    
    /**
     * @notice Get the current deposit tree root
     */
    function getDepositRoot() external view returns (bytes32) {
        return _depositTree.root();
    }
    
    /**
     * @notice Get the current withdrawal tree root
     */
    function getWithdrawalRoot() external view returns (bytes32) {
        return _withdrawalTree.root();
    }
    
    /**
     * @notice Get nonce for an NFT
     */
    function getNonce(uint256 tokenId) external view returns (uint256) {
        return _nonces[tokenId];
    }
    
    /* ─────────────────────────── Soulbound Implementation ───────────────────────────── */
    
    /**
     * @notice Always returns true for existing NFTs (soulbound)
     */
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }
    
    /**
     * @dev Override transfer to prevent transfers (soulbound)
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            revert TransfersDisabled();
        }
        return super._update(to, tokenId, auth);
    }
    
    /* ─────────────────────────── Metadata ───────────────────────────── */
    
    /**
     * @notice Set metadata URI for a token
     */
    function setTokenURI(uint256 tokenId, string memory uri) external {
        if (ownerOf(tokenId) != msg.sender) revert NotOwner();
        metadataURIs[tokenId] = uri;
    }
    
    /**
     * @notice Get token URI
     */
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return metadataURIs[tokenId];
    }
    
    /* ─────────────────────────── Emergency Functions ───────────────────────────── */
    
    /**
     * @notice Emergency pause (only owner)
     */
    bool public paused;
    
    modifier whenNotPaused() {
        require(!paused, "Contract paused");
        _;
    }
    
    function pause() external onlyOwner {
        paused = true;
    }
    
    function unpause() external onlyOwner {
        paused = false;
    }
}