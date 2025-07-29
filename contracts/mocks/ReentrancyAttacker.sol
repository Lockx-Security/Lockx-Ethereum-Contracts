// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ILockx {
    function createLockboxWithETH(address to, address lockboxPublicKey, bytes32 referenceId) external payable;
    function createLockboxWithBatch(
        address to,
        address lockboxPublicKey,
        uint256 amountETH,
        address[] calldata tokenAddresses,
        uint256[] calldata tokenAmounts,
        address[] calldata nftContracts,
        uint256[] calldata nftTokenIds,
        bytes32 referenceId
    ) external payable;
}

/**
 * @title ReentrancyAttacker
 * @dev Malicious contract designed to test reentrancy protection
 */
contract ReentrancyAttacker {
    ILockx public immutable lockx;
    address public immutable publicKey;
    bool public hasAttacked = false;
    uint256 public attackType = 0; // 0 = none, 1 = createLockboxWithETH, 2 = createLockboxWithBatch
    
    constructor(address _lockx, address _publicKey) {
        lockx = ILockx(_lockx);
        publicKey = _publicKey;
    }
    
    function setAttackType(uint256 _attackType) external {
        attackType = _attackType;
        hasAttacked = false;
    }
    
    /**
     * @dev Initiates the reentrancy attack on createLockboxWithETH
     */
    function attackCreateLockboxWithETH() external payable {
        attackType = 1;
        hasAttacked = false;
        
        // This call should succeed initially
        lockx.createLockboxWithETH{value: msg.value}(address(this), publicKey, bytes32(0));
    }
    
    /**
     * @dev Initiates the reentrancy attack on createLockboxWithBatch
     */
    function attackCreateLockboxWithBatch() external payable {
        attackType = 2;
        hasAttacked = false;
        
        address[] memory tokens = new address[](0);
        uint256[] memory amounts = new uint256[](0);
        address[] memory nfts = new address[](0);
        uint256[] memory nftIds = new uint256[](0);
        
        // This call should succeed initially
        lockx.createLockboxWithBatch{value: msg.value}(
            address(this), 
            publicKey, 
            msg.value, 
            tokens, 
            amounts, 
            nfts, 
            nftIds, 
            bytes32(0)
        );
    }
    
    /**
     * @dev This function will be called when the contract receives ETH
     * It attempts to reenter the Lockx contract, which should trigger the ReentrancyGuard
     */
    receive() external payable {
        if (!hasAttacked && msg.value > 0) {
            hasAttacked = true;
            
            if (attackType == 1) {
                // Attempt reentrancy on createLockboxWithETH
                // This should revert with ReentrancyGuardReentrantCall
                lockx.createLockboxWithETH{value: address(this).balance}(
                    address(this), 
                    publicKey, 
                    bytes32(0)
                );
            } else if (attackType == 2) {
                // Attempt reentrancy on createLockboxWithBatch
                address[] memory tokens = new address[](0);
                uint256[] memory amounts = new uint256[](0);
                address[] memory nfts = new address[](0);
                uint256[] memory nftIds = new uint256[](0);
                
                lockx.createLockboxWithBatch{value: address(this).balance}(
                    address(this), 
                    publicKey, 
                    address(this).balance, 
                    tokens, 
                    amounts, 
                    nfts, 
                    nftIds, 
                    bytes32(0)
                );
            }
        }
    }
    
    /**
     * @dev Fallback function to handle any other calls
     */
    fallback() external payable {
        // Do nothing
    }
}