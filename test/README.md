# Lockx Test Suite Documentation

This directory contains the complete test suite for the Lockx smart contract system, achieving 89.36% branch coverage.

## Test Organization

### Test Files (3 total)

1. **consolidated-coverage.spec.ts** (52KB, 3000+ lines) - Complete test suite achieving 89.36% coverage
   - Contains all branch coverage tests
   - Organized by contract (Lockx, Deposits, Withdrawals, SignatureVerification)
   - Includes all edge cases and special scenarios
   - **Use this file to replicate our coverage results**

2. **core-functionality.spec.ts** (15KB) - Basic functionality tests
   - Lockbox creation
   - Asset deposits and withdrawals
   - Key rotation and burning

3. **mock-contracts.spec.ts** (15KB) - Mock contract tests
   - MockERC20 tests
   - MockERC721 tests
   - MockFeeOnTransferToken tests
   - RejectETH tests

## Running Tests

### Run All Tests
```bash
npx hardhat test
```

### Run Consolidated Coverage Test
```bash
npx hardhat test test/consolidated-coverage.spec.ts
```

### Run Tests with Coverage Report
```bash
npx hardhat coverage
```

### Run Specific Test File
```bash
npx hardhat test test/[filename].spec.ts
```

### Run Tests with Detailed Output
```bash
npx hardhat test --verbose
```

## Coverage Metrics

### Current Coverage: 89.36%

| Contract | Branch Coverage | Statement Coverage |
|----------|-----------------|-------------------|
| Deposits.sol | 84.09% (37/44) | 89.2% |
| Lockx.sol | 92.42% (61/66) | 94.1% |
| SignatureVerification.sol | 100% (14/14) | 100% |
| Withdrawals.sol | 87.5% (56/64) | 90.3% |

### Viewing Coverage Report

After running coverage, open the HTML report:
```bash
open coverage/index.html
```

## Test Structure

Each test file follows this structure:
```typescript
describe('Contract/Feature Name', () => {
  // Setup
  beforeEach(async () => {
    // Deploy contracts
    // Mint tokens
    // Set approvals
  });

  describe('Specific Feature', () => {
    it('should test success case', async () => {
      // Test implementation
    });

    it('should revert on error case', async () => {
      // Test implementation
    });
  });
});
```

## Key Test Scenarios

### 1. Lockbox Creation
- ETH lockboxes
- ERC20 lockboxes
- ERC721 lockboxes
- Batch creation
- Zero address validation
- Insufficient ETH validation

### 2. Asset Deposits
- ETH deposits
- ERC20 deposits (including fee-on-transfer)
- ERC721 deposits (direct and via safeTransferFrom)
- Batch deposits
- Array management

### 3. Asset Withdrawals
- ETH withdrawals
- ERC20 withdrawals
- ERC721 withdrawals
- Batch withdrawals
- Balance validation
- Array cleanup

### 4. Signature Verification
- EIP-712 signature validation
- Nonce management
- Expiry validation
- Signature reuse prevention
- Invalid signer rejection

### 5. Special Operations
- Key rotation
- Lockbox burning
- Metadata management
- Interface support

### 6. Edge Cases
- Fee-on-transfer tokens
- ETH transfer failures
- Array gaps handling
- Non-existent token operations
- Access control validation

## Remaining Uncovered Branches

The following branches remain uncovered (10.64%):

### Deposits.sol
- `owner == address(0)` check - Requires malicious ERC721
- NFT contract zero checks - Defensive validations
- Array index zero checks - Mathematical edge cases

### Lockx.sol  
- Creation modifier edge cases
- Rare interface ID combinations

### Withdrawals.sol
- Complex NFT state combinations
- Defensive validation checks

These branches represent defensive checks for impossible scenarios and do not indicate security vulnerabilities.

## Replicating Coverage

To replicate our 89.36% coverage:

1. Install dependencies:
```bash
npm install
```

2. Run the consolidated test:
```bash
npx hardhat test test/consolidated-coverage.spec.ts
```

3. Generate coverage report:
```bash
npx hardhat coverage --testfiles "test/consolidated-coverage.spec.ts"
```

4. View results:
```bash
cat coverage/lcov.info | grep "BRF\|BRH"
```

Expected output:
- BRF: 188 (total branches)
- BRH: 168 (branches hit)
- Coverage: 168/188 = 89.36%

## Foundry Tests

Additional invariant tests are available in the `test/foundry` directory:
```bash
forge test --match-contract Invariant
```

These tests perform 26,880 randomized operations to validate system invariants.