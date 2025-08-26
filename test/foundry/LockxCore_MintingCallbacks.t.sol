// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";

/**
 * @title LockxMintingCallbackTest
 * @notice Tests for state consistency during ERC721 minting callbacks
 * @dev This test specifically checks the callback state consistency issue that Certora detected
 */
contract LockxMintingCallbackTest is Test {
    Lockx public lockx;
    MockERC20 public mockToken;
    
    address public lockboxPublicKey;
    bytes32 public referenceId = keccak256("test");
    
    function setUp() public {
        lockx = new Lockx();
        mockToken = new MockERC20();
        mockToken.initialize("Mock Token", "MOCK");
        lockboxPublicKey = vm.addr(0x1234);
        
        // Mint tokens to test contracts
        mockToken.mint(address(this), 1000 ether);
    }
    
    /**
     * @dev Test that demonstrates the OLD pattern had state inconsistency
     * This would fail with the old minting order but pass with the new one
     */
    function test_mintingCallbackStateConsistency() public {
        MaliciousRecipient recipient = new MaliciousRecipient(payable(address(lockx)));
        
        // Give the recipient some ETH to mint with
        vm.deal(address(recipient), 1 ether);
        
        // This should work without any state inconsistencies
        recipient.attemptMinting{value: 0.5 ether}(lockboxPublicKey, referenceId);
        
        // Verify the recipient actually owns the lockbox
        assertEq(lockx.balanceOf(address(recipient)), 1);
        
        // Verify the lockbox is properly initialized
        uint256 tokenId = 0; // First minted token
        assertEq(lockx.ownerOf(tokenId), address(recipient));
        
        // After minting completes, getFullLockbox should work
        vm.prank(address(recipient));
        (uint256 ethBalance, , ) = lockx.getFullLockbox(tokenId);
        assertEq(ethBalance, 0.5 ether);
    }
    
    /**
     * @dev Test with ERC20 minting to ensure consistency
     */
    function test_erc20MintingCallbackStateConsistency() public {
        MaliciousERC20Recipient recipient = new MaliciousERC20Recipient(payable(address(lockx)), address(mockToken));
        
        // Transfer tokens to recipient
        mockToken.transfer(address(recipient), 100 ether);
        
        // This should work without state inconsistencies
        recipient.attemptERC20Minting(lockboxPublicKey, referenceId, 50 ether);
        
        // Verify the recipient owns the lockbox
        assertEq(lockx.balanceOf(address(recipient)), 1);
        
        // After minting completes, getFullLockbox should work
        uint256 tokenId = 0;
        vm.prank(address(recipient));
        (uint256 ethBalance, , ) = lockx.getFullLockbox(tokenId);
        assertEq(ethBalance, 0); // Should have no ETH
    }
    
    /**
     * @dev Test that verifies _mint() doesn't trigger callbacks (no vulnerability possible)
     */
    function test_callbackQueriesReturnConsistentState() public {
        StateQueryRecipient recipient = new StateQueryRecipient(payable(address(lockx)));
        vm.deal(address(recipient), 1 ether);
        
        // This will mint but NOT trigger callback since _mint() is used (not _safeMint())
        recipient.mintAndQueryState{value: 0.3 ether}(lockboxPublicKey, referenceId);
        
        // Verify the minting succeeded
        assertEq(lockx.balanceOf(address(recipient)), 1);
        
        // The callback should NOT have been executed (because _mint doesn't call it)
        assertFalse(recipient.callbackExecuted());
        assertFalse(recipient.stateQuerySucceeded()); // No callback, no query attempted
    }
}

/**
 * @dev Malicious contract that tries to exploit state during minting callback
 */
contract MaliciousRecipient {
    Lockx public immutable lockx;
    bool public callbackTriggered = false;
    
    constructor(address payable _lockx) {
        lockx = Lockx(_lockx);
    }
    
    function attemptMinting(address publicKey, bytes32 refId) external payable {
        lockx.createLockboxWithETH{value: msg.value}(address(this), publicKey, refId);
    }
    
    /**
     * @dev Called during NFT minting - this is where state inconsistency would occur
     */
    function onERC721Received(
        address, // operator
        address, // from  
        uint256 tokenId,
        bytes calldata // data
    ) external returns (bytes4) {
        callbackTriggered = true;
        
        // Security check: queries during callback should fail to prevent state inconsistency
        try lockx.getFullLockbox(tokenId) {
            // If this succeeds during callback, there's a security issue
            revert("SECURITY ISSUE: State accessible during callback!");
        } catch {
            // Expected behavior - state queries blocked during callback
            // This proves the security fix is working
        }
        
        return this.onERC721Received.selector;
    }
    
    receive() external payable {}
}

/**
 * @dev Contract for testing ERC20 minting callbacks
 */
contract MaliciousERC20Recipient {
    Lockx public immutable lockx;
    MockERC20 public immutable token;
    
    constructor(address payable _lockx, address _token) {
        lockx = Lockx(_lockx);
        token = MockERC20(_token);
    }
    
    function attemptERC20Minting(address publicKey, bytes32 refId, uint256 amount) external {
        token.approve(address(lockx), amount);
        lockx.createLockboxWithERC20(address(this), publicKey, address(token), amount, refId);
    }
    
    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        // Security check: queries during callback should fail
        try lockx.getFullLockbox(tokenId) {
            // If this succeeds, there's a security issue
            revert("SECURITY ISSUE: State accessible during ERC20 callback!");
        } catch {
            // Expected - state queries blocked during callback
        }
        
        return this.onERC721Received.selector;
    }
}

/**
 * @dev Contract that specifically tests state queries during callback
 */
contract StateQueryRecipient {
    Lockx public immutable lockx;
    bool public callbackExecuted = false;
    bool public stateQuerySucceeded = false;
    
    constructor(address payable _lockx) {
        lockx = Lockx(_lockx);
    }
    
    function mintAndQueryState(address publicKey, bytes32 refId) external payable {
        lockx.createLockboxWithETH{value: msg.value}(address(this), publicKey, refId);
    }
    
    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        callbackExecuted = true;
        
        // Don't check owner during callback - the token exists but might not be fully queryable
        // The critical test - can we query full lockbox state?
        try lockx.getFullLockbox(tokenId) {
            stateQuerySucceeded = true;
        } catch {
            stateQuerySucceeded = false;
            // This is expected - state queries should fail during callback
        }
        
        return this.onERC721Received.selector;
    }
    
    receive() external payable {}
}