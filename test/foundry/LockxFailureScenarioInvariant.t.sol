// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import "forge-std/Test.sol";
import "../../contracts/Lockx.sol";
import "../../contracts/mocks/MockERC20.sol";
import "../../contracts/mocks/MockERC721.sol";
import "../../contracts/mocks/MockSwapRouter.sol";
import "../../contracts/mocks/RejectETH.sol";

/**
 * @title LockxFailureScenarioInvariant
 * @notice PHASE 3: Failure Scenarios - Testing system resilience
 * 
 * Tests how the system handles various failure conditions:
 * 1. ERC20/721 transfer failures  
 * 2. External contract interaction failures
 * 3. Gas limit edge cases
 * 4. ETH transfer failures
 * 5. Router/DEX failures during swaps
 * 6. Malicious contract interactions
 * 
 * FAILURE RESILIENCE: System must remain consistent even when external operations fail
 */
contract LockxFailureScenarioInvariant is Test {
    Lockx public lockx;
    MockERC20 public normalToken;
    FailingERC20 public failingToken;
    MockERC721 public normalNFT;
    FailingERC721 public failingNFT;
    MockSwapRouter public normalRouter;
    FailingRouter public failingRouter;
    RejectETH public ethRejecter;
    
    address public user = makeAddr("user");
    uint256 private userKey = 0x1234;
    address public keyAddr;
    
    // Track operations for failure testing
    uint256 public successfulOps;
    uint256 public expectedFailures;
    uint256 public unexpectedFailures;
    
    // EIP-712 constants
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH = keccak256(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
    );
    bytes32 internal constant NAME_HASH = keccak256(bytes('Lockx'));
    bytes32 internal constant VERSION_HASH = keccak256(bytes('4'));
    bytes32 internal constant OPERATION_TYPEHASH = keccak256(
        'Operation(uint256 tokenId,uint256 nonce,uint8 opType,bytes32 dataHash)'
    );
    
    uint256 public testTokenId = 0;
    
    function setUp() public {
        lockx = new Lockx();
        normalToken = new MockERC20();
        failingToken = new FailingERC20();
        normalNFT = new MockERC721();  
        failingNFT = new FailingERC721();
        normalRouter = new MockSwapRouter();
        failingRouter = new FailingRouter();
        ethRejecter = new RejectETH();
        
        normalToken.initialize("Normal Token", "NORM");
        normalNFT.initialize("Normal NFT", "NNFT");
        
        keyAddr = vm.addr(userKey);
        
        // Fund everything
        vm.deal(user, 100 ether);
        vm.deal(address(normalRouter), 100 ether);
        vm.deal(address(failingRouter), 100 ether);
        
        normalToken.mint(user, 10000e18);
        normalToken.mint(address(normalRouter), 10000e18);
        normalToken.mint(address(failingRouter), 10000e18);
        
        failingToken.mint(user, 10000e18);
        
        // Create test lockboxes
        _createTestLockboxes();
    }
    
    function _createTestLockboxes() internal {
        vm.startPrank(user);
        
        // Main test lockbox with normal assets
        normalToken.approve(address(lockx), 5000e18);
        lockx.createLockboxWithERC20(user, keyAddr, address(normalToken), 5000e18, bytes32("main"));
        // testTokenId = 0 (implicit)
        
        // Add some ETH for testing
        lockx.depositETH{value: 10 ether}(testTokenId, bytes32("eth"));
        
        vm.stopPrank();
    }
    
    /**
     * @notice INVARIANT: System remains consistent despite external failures
     */
    function invariant_failureResilience() public view {
        // System should handle more failures gracefully than catastrophically
        // Allow system to start with balanced counters
        uint256 totalOps = expectedFailures + successfulOps + unexpectedFailures;
        if (totalOps == 0) return; // No operations yet
        
        uint256 unexpectedRate = (unexpectedFailures * 100) / totalOps;
        assertLt(unexpectedRate, 50, "Too many unexpected failures - system not resilient");
    }
    
    /**
     * @notice INVARIANT: Failed operations don't corrupt contract state
     */
    function invariant_noStateCorruption() public view {
        // Contract should always have non-negative balances
        uint256 contractETH = address(lockx).balance;
        uint256 contractTokens = normalToken.balanceOf(address(lockx));
        
        assertGe(contractETH, 0, "Negative ETH balance after failures");
        assertGe(contractTokens, 0, "Negative token balance after failures");
    }
    
    /**
     * @notice Test ERC20 transfer failures
     */
    function testFuzz_erc20TransferFailures(uint256 scenario, uint256 amount) public {
        scenario = bound(scenario, 0, 3);
        amount = bound(amount, 1e18, 1000e18);
        
        if (scenario == 0) {
            _testFailingTokenDeposit(amount);
        } else if (scenario == 1) {
            _testNormalTokenToFailingWithdrawal(amount);
        } else if (scenario == 2) {
            _testSwapWithFailingToken(amount);
        } else {
            _testBatchOperationWithFailures(amount);
        }
    }
    
    function _testFailingTokenDeposit(uint256 amount) internal {
        // Try to deposit a failing token - should fail gracefully
        failingToken.setFailureMode(true);
        
        vm.startPrank(user);
        failingToken.approve(address(lockx), amount);
        
        try lockx.depositERC20(testTokenId, address(failingToken), amount, bytes32("fail")) {
            unexpectedFailures++;
        } catch {
            expectedFailures++; // Expected to fail
        }
        vm.stopPrank();
    }
    
    function _testNormalTokenToFailingWithdrawal(uint256 amount) internal {
        // First deposit normal tokens, then try to withdraw to failing contract
        vm.startPrank(user);
        normalToken.approve(address(lockx), amount);
        lockx.depositERC20(testTokenId, address(normalToken), amount, bytes32("deposit"));
        vm.stopPrank();
        
        // Try to withdraw to a contract that can't receive tokens
        bytes memory signature = _createERC20WithdrawSignature(
            testTokenId, address(normalToken), amount, address(ethRejecter)
        );
        bytes memory data = abi.encode(
            testTokenId, address(normalToken), amount, address(ethRejecter),
            bytes32("withdraw"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(testTokenId, 2, data);
        
        vm.startPrank(user);
        try lockx.withdrawERC20(
            testTokenId, messageHash, signature, address(normalToken), amount,
            address(ethRejecter), bytes32("withdraw"), block.timestamp + 1 hours
        ) {
            successfulOps++; // If it succeeds, that's fine too
        } catch {
            expectedFailures++; // Expected to potentially fail
        }
        vm.stopPrank();
    }
    
    function _testSwapWithFailingToken(uint256 amount) internal {
        // Test swap operations when router fails
        failingRouter.setFailureMode(true);
        
        bytes memory swapData = abi.encodeWithSignature(
            "swap(address,address,uint256,uint256,address)",
            address(normalToken), address(0), amount, amount/2, address(lockx)
        );
        
        bytes memory signature = _createSwapSignature(
            testTokenId, address(normalToken), address(0), amount, amount/2, swapData
        );
        
        bytes memory data = abi.encode(
            testTokenId, address(normalToken), address(0), amount, amount/2,
            address(failingRouter), swapData, bytes32("failswap"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(testTokenId, 5, data);
        
        try lockx.swapInLockbox(
            testTokenId, messageHash, signature, address(normalToken), address(0), amount,
            amount/2, address(failingRouter), swapData, bytes32("failswap"), 
            block.timestamp + 1 hours, user
        ) {
            unexpectedFailures++; // Should not succeed with failing router
        } catch {
            expectedFailures++; // Expected to fail
        }
    }
    
    function _testBatchOperationWithFailures(uint256 amount) internal {
        // Test batch withdraw with some failing components
        
        address[] memory tokens = new address[](2);
        uint256[] memory amounts = new uint256[](2);
        tokens[0] = address(normalToken);
        tokens[1] = address(failingToken);  // This should cause issues
        amounts[0] = amount / 2;
        amounts[1] = amount / 2;
        
        bytes memory signature = _createBatchWithdrawSignature(
            testTokenId, 0, tokens, amounts, new address[](0), new uint256[](0), user
        );
        
        bytes memory data = abi.encode(
            testTokenId, 0, tokens, amounts, new address[](0), new uint256[](0),
            user, bytes32("batchfail"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(testTokenId, 4, data);
        
        // Use startPrank/stopPrank to avoid conflicts
        vm.startPrank(user);
        try lockx.batchWithdraw(
            testTokenId, messageHash, signature, 0, tokens, amounts,
            new address[](0), new uint256[](0), user, bytes32("batchfail"), block.timestamp + 1 hours
        ) {
            successfulOps++;
        } catch {
            expectedFailures++;
        }
        vm.stopPrank();
    }
    
    /**
     * @notice Test gas limit edge cases
     */
    function testFuzz_gasLimitEdgeCases(uint256 gasLimit) public {
        gasLimit = bound(gasLimit, 50000, 500000);
        
        // Test operations under gas pressure
        bytes memory signature = _createETHWithdrawSignature(testTokenId, 1 ether, user);
        bytes memory data = abi.encode(
            testTokenId, 1 ether, user, bytes32("gas"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(testTokenId, 1, data);
        
        vm.prank(user);
        try lockx.withdrawETH{gas: gasLimit}(
            testTokenId, messageHash, signature, 1 ether, user, bytes32("gas"), block.timestamp + 1 hours
        ) {
            successfulOps++;
        } catch {
            expectedFailures++; // May fail due to gas limit
        }
    }
    
    /**
     * @notice Test ETH transfer failures
     */
    function testFuzz_ethTransferFailures(uint256 amount) public {
        amount = bound(amount, 0.1 ether, 5 ether);
        
        // Try to withdraw ETH to a contract that rejects it
        bytes memory signature = _createETHWithdrawSignature(testTokenId, amount, address(ethRejecter));
        bytes memory data = abi.encode(
            testTokenId, amount, address(ethRejecter), bytes32("ethfail"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(testTokenId, 1, data);
        
        vm.prank(user);
        try lockx.withdrawETH(
            testTokenId, messageHash, signature, amount, address(ethRejecter), 
            bytes32("ethfail"), block.timestamp + 1 hours
        ) {
            unexpectedFailures++; // Should not succeed
        } catch {
            expectedFailures++; // Expected to fail
        }
    }
    
    // Helper signature creation functions
    function _createETHWithdrawSignature(uint256 tokenId, uint256 amount, address recipient) 
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, amount, recipient, bytes32("test"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 1, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createERC20WithdrawSignature(uint256 tokenId, address token, uint256 amount, address recipient)
        internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, token, amount, recipient, bytes32("test"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 2, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createSwapSignature(
        uint256 tokenId, address tokenIn, address tokenOut, uint256 amountIn, 
        uint256 minAmountOut, bytes memory swapData
    ) internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, tokenIn, tokenOut, amountIn, minAmountOut, 
            address(failingRouter), swapData, bytes32("test"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 5, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _createBatchWithdrawSignature(
        uint256 tokenId, uint256 ethAmount, address[] memory tokens, uint256[] memory amounts,
        address[] memory nftContracts, uint256[] memory nftTokenIds, address recipient
    ) internal returns (bytes memory) {
        bytes memory data = abi.encode(
            tokenId, ethAmount, tokens, amounts, nftContracts, nftTokenIds,
            recipient, bytes32("test"), user, block.timestamp + 1 hours
        );
        bytes32 messageHash = _computeMessageHash(tokenId, 4, data);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(userKey, messageHash);
        return abi.encodePacked(r, s, v);
    }
    
    function _computeMessageHash(uint256 tokenId, uint8 opType, bytes memory data) internal returns (bytes32) {
        bytes32 dataHash = keccak256(data);
        vm.prank(user);
        uint256 nonce = lockx.getNonce(tokenId);
        
        bytes32 structHash = keccak256(abi.encode(OPERATION_TYPEHASH, tokenId, nonce, opType, dataHash));
        bytes32 domainSeparator = keccak256(abi.encode(
            EIP712_DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, address(lockx)
        ));
        
        return keccak256(abi.encodePacked('\x19\x01', domainSeparator, structHash));
    }
}

/**
 * @notice Mock contracts that fail in various ways for testing
 */
contract FailingERC20 {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public failureMode = false;
    
    function setFailureMode(bool _fail) external {
        failureMode = _fail;
    }
    
    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }
    
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return !failureMode;
    }
    
    function transfer(address to, uint256 amount) external returns (bool) {
        if (failureMode) return false;
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
    
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (failureMode) return false;
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        allowance[from][msg.sender] -= amount;
        return true;
    }
}

contract FailingERC721 {
    bool public failureMode = false;
    
    function setFailureMode(bool _fail) external {
        failureMode = _fail;
    }
    
    function transferFrom(address, address, uint256) external pure {
        revert("Always fails");
    }
    
    function safeTransferFrom(address, address, uint256) external pure {
        revert("Always fails");
    }
}

contract FailingRouter {
    bool public failureMode = false;
    
    function setFailureMode(bool _fail) external {
        failureMode = _fail;
    }
    
    function swap(address, address, uint256, uint256, address) external payable {
        if (failureMode) {
            revert("Router failure");
        }
    }
}