# Testing Documentation

## Table of Contents
- [Coverage Summary](#coverage-summary)
- [Test Results](#test-results)
- [Contract-Specific Coverage](#contract-specific-coverage)
- [Test Examples with Code](#test-examples-with-code)
- [Testing Frameworks](#testing-frameworks)
- [Running Tests](#running-tests)
- [Invariant Testing](#invariant-testing)

## Coverage Summary

**Achieved with Hardhat Coverage + Foundry Property Testing:**

| Contract | Statements | Lines | Functions | Status |
|----------|------------|-------|-----------|---------|
| **Lockx.sol** | 100% | 100% | 100% | ✅ Complete |
| **Withdrawals.sol** | 100% | 100% | 100% | ✅ Complete |
| **Deposits.sol** | 96.36% | 100% | 100% | ✅ Near-complete |
| **SignatureVerification.sol** | 100% | 95.45% | 100% | ✅ Near-complete |

**Overall Project Coverage:**
- **Statement Coverage:** 99.08%
- **Line Coverage:** 99.66%  
- **Function Coverage:** 100%
- **Branch Coverage:** 74.47%

*Total Tests: 83 (Hardhat) + 7 (Foundry) = 90 tests*

## Test Results

```bash
$ npx hardhat test
83 passing (3s)

$ forge test
7 passing (983,040+ property test executions)
```

## Contract-Specific Coverage

### Lockx.sol (Core Contract) - 100% Complete

**Example Test:**
```typescript
// Test: createLockboxWithETH function
it('should create lockbox with ETH deposit', async function () {
  await lockx.createLockboxWithETH(
    owner.address,
    lockboxKey.address,
    ethers.encodeBytes32String('test-ref'),
    { value: ethers.parseEther('2') }
  );
  
  expect(await lockx.ownerOf(0)).to.equal(owner.address);
  expect(await lockx.locked(0)).to.be.true;
});
```

**Lines Tested:**
```solidity
// contracts/Lockx.sol:142-156 - createLockboxWithETH function
uint256 tokenId = _nextId++;           // Line 149 ✅ Covered
_mint(to, tokenId);                    // Line 150 ✅ Covered
initialize(tokenId, lockboxPublicKey); // Line 152 ✅ Covered
_depositETH(tokenId, msg.value);       // Line 153 ✅ Covered
emit Locked(tokenId);                  // Line 155 ✅ Covered
```

### Withdrawals.sol - 100% Complete

**Example Test:**
```typescript
// Test: batchWithdraw with complete token removal (hits lines 319-321)
it('should remove ERC20 tokens when balance becomes zero', async function () {
  // Setup: Create lockbox with tokens
  await lockx.createLockboxWithBatch(
    owner.address, lockboxKey.address,
    ethers.parseEther('1'),
    [mockToken.address], [ethers.parseEther('100')],
    [], [], ethers.encodeBytes32String('test')
  );

  // Withdraw ALL tokens to trigger removal
  await lockx.batchWithdraw(
    tokenId, messageHash, signature,
    0, [mockToken.address], [ethers.parseEther('100')],
    [], [], recipient.address, refId, expiry
  );
  
  // Verify complete removal
  const data = await lockx.getFullLockbox(tokenId);
  expect(data.erc20Tokens.length).to.equal(0);
});
```

**Critical Lines Covered:**
```solidity
// contracts/Withdrawals.sol:319-321 - ERC20 removal logic
delete balMap[tok];                 // Line 319 ✅ Covered
_removeERC20Token(tokenId, tok);    // Line 320 ✅ Covered  
delete _erc20Known[tokenId][tok];   // Line 321 ✅ Covered
```

### Deposits.sol - 96.36% Statements, 100% Lines

**Example Test:**
```typescript
// Test: Fee-on-transfer token handling
it('should handle fee-on-transfer tokens correctly', async function () {
  await feeToken.setFeePercentage(50); // 50% fee
  await feeToken.approve(lockx.address, ethers.parseEther('100'));
  
  await lockx.depositERC20(
    tokenId, feeToken.address, 
    ethers.parseEther('100'),
    ethers.encodeBytes32String('fee-test')
  );
  
  // Only 50 tokens received due to 50% fee
  const data = await lockx.getFullLockbox(tokenId);
  expect(data.erc20Tokens[0].balance).to.equal(ethers.parseEther('50'));
});
```

**Core Function Coverage:**
```solidity
// contracts/Deposits.sol:187-200 - _depositERC20 internal function
uint256 before = t.balanceOf(address(this));  // ✅ Covered
t.safeTransferFrom(msg.sender, address(this), amount); // ✅ Covered
uint256 received = t.balanceOf(address(this)) - before; // ✅ Covered
if (received == 0) revert ZeroAmount(); // ✅ Covered (fee-token test)
```

### SignatureVerification.sol - 100% Statements

**Example Test:**
```typescript
// Test: Key rotation with signature verification
it('should rotate lockbox key with valid signature', async function () {
  const nonce = await lockx.getNonce(tokenId);
  const rotationData = ethers.AbiCoder.defaultAbiCoder().encode(
    ['uint256', 'address', 'bytes32', 'address', 'uint256'],
    [tokenId, newKey.address, referenceId, owner.address, expiry]
  );
  
  const signature = await lockboxKey.signTypedData(domain, types, opStruct);
  
  await lockx.rotateLockboxKey(
    tokenId, messageHash, signature, 
    newKey.address, referenceId, expiry
  );
  
  const activeKey = await lockx.getActiveLockboxPublicKeyForToken(tokenId);
  expect(activeKey).to.equal(newKey.address);
});
```

**EIP-712 Verification Logic:**
```solidity
// contracts/SignatureVerification.sol:127-133 - Signature verification
address signer = expectedHash.recover(signature); // ✅ Covered
if (signer != tokenAuth.activeLockboxPublicKey) {  // ✅ Covered
  revert InvalidSignature();                       // ✅ Covered
}
tokenAuth.nonce++;                                 // ✅ Covered
```

## Test Examples with Code

### 1. Edge Case Testing

**Zero Amount Validation:**
```typescript
// contracts/Deposits.sol:93 - Zero received amount check
it('should revert on zero amount received', async function () {
  await feeToken.setFeePercentage(100); // 100% fee = 0 received
  
  await expect(
    lockx.depositERC20(tokenId, feeToken.address, ethers.parseEther('100'), ref)
  ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
});
```

**Array Boundary Testing:**
```typescript
// contracts/Withdrawals.sol:459-461 - NFT counting with gaps
it('should handle NFT array gaps correctly', async function () {
  // Deposit 3 NFTs
  await depositNFTs([10, 11, 12]);
  
  // Withdraw middle NFT (creates gap)
  await withdrawNFT(11);
  
  // getFullLockbox should count only remaining NFTs
  const data = await lockx.getFullLockbox(tokenId);
  expect(data.nftContracts.length).to.equal(2); // 10 and 12 remain
});
```

### 2. Signature Security Testing

**Expiry Validation:**
```typescript
it('should reject expired signatures', async function () {
  const expiredTimestamp = 1000; // Old timestamp
  
  await expect(
    lockx.withdrawETH(tokenId, hash, signature, amount, recipient, ref, expiredTimestamp)
  ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
});
```

**Invalid Signer Detection:**
```typescript
it('should reject signatures from wrong key', async function () {
  const wrongSigner = await ethers.getSigners()[3];
  const invalidSignature = await wrongSigner.signTypedData(domain, types, opStruct);
  
  await expect(
    lockx.withdrawETH(tokenId, hash, invalidSignature, amount, recipient, ref, expiry)
  ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
});
```

### 3. Complex Integration Testing

**Batch Operations:**
```typescript
it('should handle complex batch operations', async function () {
  // Create lockbox with mixed assets
  await lockx.createLockboxWithBatch(
    owner.address, lockboxKey.address,
    ethers.parseEther('3'),                                    // ETH
    [token1.address, token2.address],                          // ERC20s
    [ethers.parseEther('100'), ethers.parseEther('50')],      // Amounts
    [nft.address, nft.address],                               // NFTs
    [10, 11],                                                 // Token IDs
    ethers.encodeBytes32String('batch-test'),
    { value: ethers.parseEther('3') }
  );
  
  // Verify all assets deposited
  const data = await lockx.getFullLockbox(tokenId);
  expect(data.lockboxETH).to.equal(ethers.parseEther('3'));
  expect(data.erc20Tokens.length).to.equal(2);
  expect(data.nftContracts.length).to.equal(2);
});
```

## Testing Frameworks

### Hardhat Tests (83 tests)
- **Unit Tests:** Individual function testing
- **Integration Tests:** Multi-contract interactions  
- **Edge Case Tests:** Boundary conditions and error states
- **Security Tests:** Signature validation and access control

### Foundry Property Tests (7 invariants)
```solidity
// Example: Balance consistency invariant
function invariant_ETH_balance_consistency() external {
    uint256 contractBalance = address(lockx).balance;
    uint256 accountedBalance = 0;
    
    for (uint256 i = 0; i < totalLockboxes; i++) {
        accountedBalance += lockx.getEthBal(i);
    }
    
    assertEq(contractBalance, accountedBalance);
}
```

**Property Test Results:**
- **256 runs** × **3,840 calls per run** = **983,040 total executions**
- **All 7 invariants maintained** across all test runs
- **Zero failed scenarios** in mathematical property validation

## Running Tests

```bash
# Run all Hardhat tests
npx hardhat test

# Run with coverage
npx hardhat coverage

# Run specific test file
npx hardhat test test/withdrawals.spec.ts

# Run Foundry property tests
forge test

# Run with detailed output
forge test -vvv

# Generate coverage report
npx hardhat coverage | grep "contracts/"
```

## Invariant Testing

**Mathematical Properties Verified:**

1. **ETH Balance Consistency** (983,040 executions)
   ```solidity
   contract_ETH_balance == sum(all_lockbox_ETH_balances)
   ```

2. **ERC20 Balance Accuracy** (983,040 executions)
   ```solidity
   contract_token_balance >= sum(all_lockbox_token_balances)
   ```

3. **Nonce Monotonicity** (983,040 executions)
   ```solidity
   nonce[t+1] > nonce[t] for all operations
   ```

4. **Array Index Consistency** (983,040 executions)
   ```solidity
   token_array_length == count(unique_tokens_per_lockbox)
   ```

5. **NFT Ownership Tracking** (983,040 executions)
   ```solidity
   NFT_in_lockbox => contract_owns_NFT
   ```

6. **No Duplicate Tokens** (983,040 executions)
   ```solidity
   unique(token_addresses_per_lockbox) == token_addresses_per_lockbox
   ```

7. **Multi-User Balance Isolation** (983,040 executions)
   ```solidity
   user_A_operations do_not_affect user_B_balances
   ```

**Key Insights from Property Testing:**
- **Zero mathematical inconsistencies** detected
- **Perfect nonce progression** maintained  
- **No cross-user contamination** in 983,040+ multi-user scenarios
- **Array integrity preserved** across all operations
- **Balance accounting accuracy** maintained under all conditions

This comprehensive testing approach provides high confidence in contract security and mathematical correctness through both targeted unit tests and exhaustive property verification. 