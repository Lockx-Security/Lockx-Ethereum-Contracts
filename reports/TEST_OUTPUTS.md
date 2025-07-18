# Raw Test Output Report

**Date:** July 18, 2025  
**Test Suite:** Lockx Smart Contracts v2.1.0  
**Compiler:** Solc version 0.8.30  
**Total Execution Time:** ~5 seconds  

## Test Compilation

```
Compiled 38 Solidity files successfully (evm target: paris).
```

## Test Results Summary

**Total Tests:** 60  
**Passing:** 37  
**Failing:** 23  
**Success Rate:** 61.7%  

## Detailed Test Output

### Comprehensive Branch Coverage Tests

#### Lockx.sol Branch Coverage
```
✔ should test all creation function error branches
✔ should test createLockboxWithBatch array mismatch branches
✔ should test metadata URI branches
✔ should test transfer restriction branches
✔ should test supportsInterface branches
✔ should test fallback and receive functions
```

#### Withdrawals.sol Branch Coverage
```
✔ should test ETH withdrawal branches
✔ should test ERC20 withdrawal branches
✔ should test NFT withdrawal branches
✔ should test batch withdrawal branches
✔ should test signature expiry branches
✔ should test array removal branches
```

#### Deposits.sol Branch Coverage
```
✔ should test deposit validation branches
✔ should test batch deposit branches
✗ should test fee-on-transfer token branches
✗ should test new vs existing token branches
✗ should test NFT deposit branches
```

#### Complex Scenarios
```
✔ should test burnLockbox with complex cleanup
✗ should test getFullLockbox with complex gaps
```

### Core Functionality Tests

#### Lockbox Creation
```
✗ should create lockbox with ETH
✗ should create lockbox with ERC20
✗ should create lockbox with ERC721
✗ should create lockbox with batch assets
```

#### Deposits
```
✗ should deposit ETH
✗ should deposit ERC20
✗ should deposit ERC721
✗ should batch deposit
```

#### Withdrawals
```
✔ should withdraw ETH
✔ should withdraw ERC20
✔ should withdraw ERC721
✔ should batch withdraw
```

#### Key Rotation
```
✗ should rotate lockbox key
```

#### Burn Lockbox
```
✗ should burn lockbox
```

### Edge Cases and Error Scenarios

#### Signature and Authentication Edge Cases
```
✔ should handle signature expiry edge cases
✔ should test invalid signature scenarios
✗ should test nonce reuse scenarios
```

#### Ownership and Access Control Edge Cases
```
✗ should test non-existent token operations
✔ should test ownership validation
```

#### Array and State Management Edge Cases
```
✗ should handle single element array operations
✗ should handle maximum array operations
```

#### Fee-on-Transfer Token Edge Cases
```
✔ should handle various fee percentages
```

#### ETH Transfer Failure Scenarios
```
✔ should handle ETH transfer to contracts that reject ETH
```

#### Complex State Transitions
```
✗ should handle key rotation scenarios
```

### Mock Contracts Tests

#### MockERC20
```
✔ should test initialization branches
✗ should test minting functionality
✗ should test standard ERC20 functionality
```

#### MockERC721
```
✔ should test initialization branches
✔ should test minting functionality
✔ should test standard ERC721 functionality
✔ should test token URI functionality
```

#### MockFeeOnTransferToken
```
✔ should test initialization branches
✔ should test fee percentage functionality
✗ should test transfer with different fee percentages
✗ should test transferFrom with fees
✔ should test edge cases with very small amounts
✔ should test fee calculation precision
```

#### RejectETH Contract
```
✔ should reject ETH sent via receive function
✔ should reject ETH sent via fallback function
✔ should reject ETH with zero value calls
```

#### Mock Contract Integration
```
✔ should test interactions between mock contracts
```

## Error Analysis

### Common Error Patterns

#### NotOwner Errors (Multiple Tests)
```
Error: VM Exception while processing transaction: reverted with custom error 'NotOwner()'
at Lockx.getFullLockbox (contracts/Withdrawals.sol:510)
```
**Affected Tests:** 12 tests  
**Root Cause:** Improper test setup or access control validation  

#### InvalidMessageHash Errors (2 Tests)
```
Error: VM Exception while processing transaction: reverted with custom error 'InvalidMessageHash()'
at Lockx.verifySignature (contracts/SignatureVerification.sol:134)
```
**Affected Tests:** Key rotation scenarios  
**Root Cause:** Signature construction issues  

#### Custom Error Mismatches (2 Tests)
```
AssertionError: Expected transaction to be reverted with custom error 'NonexistentToken', 
but it reverted with custom error 'ERC721NonexistentToken'
```
**Root Cause:** OpenZeppelin v5.3.0 error naming changes  

#### Balance Assertion Errors (4 Tests)
```
AssertionError: expected 1000000000000000000000 to equal 1001000000000000000000000.
```
**Root Cause:** MockERC20 balance calculation errors in test expectations  

## Performance Metrics from Successful Tests

### Gas Usage Patterns
- **Deployment Gas:** 3,959,766 (Lockx main contract)
- **Creation Operations:** 139,638 - 472,527 gas
- **Deposit Operations:** 34,181 - 175,894 gas  
- **Withdrawal Operations:** 54,150 - 80,837 gas
- **Cleanup Operations:** 55,917 - 193,843 gas

### Test Categories by Success Rate
- **Withdrawal Tests:** 100% passing (4/4)
- **Security Tests:** 83% passing (5/6)
- **Mock Contract Core:** 75% passing (6/8)
- **Creation Tests:** 0% passing (0/4) - requires investigation
- **Deposit Tests:** 0% passing (0/4) - requires investigation

## Recommendations

1. **Fix NotOwner access control issues** in test setup
2. **Update custom error assertions** for OpenZeppelin v5.3.0 compatibility
3. **Review MockERC20 balance calculations** in test expectations  
4. **Fix signature construction** for key rotation tests
5. **Investigate deposit/creation test failures** systematically

## Test Environment
- **Network:** Hardhat Local
- **Block Limit:** 30,000,000 gas
- **Optimizer:** Enabled (200 runs)
- **EVM Target:** Paris