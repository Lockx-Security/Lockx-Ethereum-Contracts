// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface ILockx {
    function createLockboxWithETH(address to, address lockboxPublicKey, bytes32 referenceId) external payable;
    function createLockboxWithERC20(address to, address lockboxPublicKey, address tokenAddress, uint256 amount, bytes32 referenceId) external;
    function depositETH(uint256 tokenId, bytes32 referenceId) external payable;
}

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title AdvancedReentrancyAttacker
 * @dev A more sophisticated contract to trigger ReentrancyGuard detection branches
 */
contract AdvancedReentrancyAttacker {
    ILockx public immutable lockx;
    address public immutable publicKey;
    IERC20 public token;
    
    bool public attacking = false;
    uint256 public attackCount = 0;
    uint256 public maxAttacks = 1;
    
    event AttackAttempted(uint256 count);
    event ReentrancyDetected(string message);
    
    constructor(address _lockx, address _publicKey) {
        lockx = ILockx(_lockx);
        publicKey = _publicKey;
    }
    
    function setToken(address _token) external {
        token = IERC20(_token);
    }
    
    /**
     * @dev Trigger reentrancy during ETH lockbox creation
     */
    function triggerEthReentrancy() external payable {
        attacking = true;
        attackCount = 0;
        
        try lockx.createLockboxWithETH{value: msg.value}(address(this), publicKey, bytes32(0)) {
            // If this succeeds, reentrancy wasn't detected
        } catch Error(string memory reason) {
            emit ReentrancyDetected(reason);
        } catch (bytes memory) {
            emit ReentrancyDetected("ReentrancyGuard triggered");
        }
        
        attacking = false;
    }
    
    /**
     * @dev This will be called when the contract receives ETH
     */
    receive() external payable {
        if (attacking && attackCount < maxAttacks) {
            attackCount++;
            emit AttackAttempted(attackCount);
            
            // Attempt reentrancy - this should trigger ReentrancyGuard
            try lockx.createLockboxWithETH{value: address(this).balance / 2}(address(this), publicKey, bytes32(0)) {
                // Reentrancy succeeded (shouldn't happen)
            } catch Error(string memory reason) {
                emit ReentrancyDetected(reason);
            } catch (bytes memory) {
                emit ReentrancyDetected("Reentrancy blocked");
            }
        }
    }
    
    /**
     * @dev Alternative approach - try to trigger reentrancy through ERC20 deposit
     */
    function triggerErc20Reentrancy(uint256 amount) external {
        attacking = true;
        attackCount = 0;
        
        // Approve the lockx contract
        token.transfer(address(this), amount);
        
        try lockx.createLockboxWithERC20(address(this), publicKey, address(token), amount, bytes32(0)) {
            // Success
        } catch Error(string memory reason) {
            emit ReentrancyDetected(reason);
        } catch (bytes memory) {
            emit ReentrancyDetected("ERC20 reentrancy blocked");
        }
        
        attacking = false;
    }
    
    /**
     * @dev Manual reentrancy trigger for testing
     */
    function manualReentrancy() external {
        if (attacking) {
            emit AttackAttempted(++attackCount);
            // This should fail due to reentrancy guard
            lockx.createLockboxWithETH{value: 0.1 ether}(address(this), publicKey, bytes32(0));
        }
    }
    
    /**
     * @dev Fallback to handle any unexpected calls
     */
    fallback() external payable {
        if (attacking && msg.data.length > 0) {
            emit AttackAttempted(++attackCount);
            // Try reentrancy through fallback
            try lockx.createLockboxWithETH{value: 0.01 ether}(address(this), publicKey, bytes32(0)) {
                // Shouldn't succeed
            } catch {
                emit ReentrancyDetected("Fallback reentrancy blocked");
            }
        }
    }
    
    // Allow contract to receive ETH
    function deposit() external payable {}
    
    // Emergency withdrawal
    function withdraw() external {
        payable(msg.sender).transfer(address(this).balance);
    }
}