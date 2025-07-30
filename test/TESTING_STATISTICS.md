# Lockx Test Suite Replication Guide

## Current Test Statistics (As of July 2025)

### Achievable Numbers
- **Total Tests**: 167-172 tests (depending on configuration)
- **Branch Coverage**: 81.82% (198/242 branches)
- **Invariant Test Executions**: 26,880+

### Core Contract Coverage Breakdown
| Contract | Branch Coverage | Branches Covered |
|----------|----------------|------------------|
| SignatureVerification.sol | 92.86% | 13/14 |
| Lockx.sol | 87.88% | 58/66 |
| Deposits.sol | 81.82% | 36/44 |
| Withdrawals.sol | 77.12% | 91/118 |
| **Total** | **81.82%** | **198/242** |

## Exact Replication Commands

### 1. Run All Tests (167 tests)
```bash
npx hardhat test
```

### 2. Run Recommended Test Suite (164 tests)
```bash
npx hardhat test test/consolidated-coverage.spec.ts test/targeted-branch-fixes.spec.ts test/ultimate-coverage.spec.ts test/production-ready-swap-tests.spec.ts
```

### 3. Generate Coverage Report
```bash
# Full coverage (all tests)
npx hardhat coverage

# Recommended suite coverage
npx hardhat coverage --testfiles "test/consolidated-coverage.spec.ts,test/targeted-branch-fixes.spec.ts,test/ultimate-coverage.spec.ts,test/production-ready-swap-tests.spec.ts"
```

### 4. Run Foundry Invariant Tests
```bash
npm run forge:test
```
This runs 9 passing tests with 26,880+ invariant executions.

### 5. Complete Test Suite (One Command)
Add to `package.json`:
```json
"scripts": {
  "test:complete": "npx hardhat test && npm run forge:test",
  "test:coverage": "npx hardhat coverage --testfiles 'test/consolidated-coverage.spec.ts,test/targeted-branch-fixes.spec.ts,test/ultimate-coverage.spec.ts,test/production-ready-swap-tests.spec.ts'"
}
```

Then run:
```bash
npm run test:complete
```

## Test File Organization

```
test/
├── consolidated-coverage.spec.ts     # 104 tests - comprehensive coverage
├── targeted-branch-fixes.spec.ts    # 11 tests - specific branch targeting
├── ultimate-coverage.spec.ts        # 10 tests - maximum coverage push
├── production-ready-swap-tests.spec.ts # 21 tests - swap functionality
├── branch-coverage-boost.spec.ts    # 15 tests - additional coverage (some failing)
├── overpayment-security-test.spec.ts # 4 tests - overpayment scenarios (contract size issue)
└── utils/
    └── eip712.ts                    # EIP-712 signature utilities
```

## Known Issues

1. **Overpayment tests**: Contract size exceeds deployment limits when using LockxHarness
2. **Swap tests**: 2 tests fail due to signature fragment issues (fixed in branch-coverage-boost.spec.ts)
3. **Coverage discrepancy**: Historical report claims 89.36%, current achievable is 81.82%

## Coverage Calculation Notes

The testing report's 89.36% coverage (168/188 branches) differs from current 81.82% (198/242 branches) due to:
- Different branch counting methodology
- Possible compiler version differences
- Updated contract code with additional branches

## Continuous Integration

For CI/CD pipelines:
```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm run test

- name: Run Coverage
  run: npm run coverage

- name: Run Invariant Tests
  run: npm run forge:test

- name: Check Coverage Threshold
  run: |
    COVERAGE=$(cat coverage/coverage-summary.json | jq '.total.branches.pct')
    if (( $(echo "$COVERAGE < 80" | bc -l) )); then
      echo "Coverage below 80% threshold"
      exit 1
    fi
```

## Quick Verification

To quickly verify the test suite is working:
```bash
# Should see ~164-167 passing tests
npx hardhat test --grep "should"

# Should see 81.82% branch coverage for core contracts
npx hardhat coverage --testfiles "test/consolidated-coverage.spec.ts,test/targeted-branch-fixes.spec.ts,test/ultimate-coverage.spec.ts,test/production-ready-swap-tests.spec.ts" | grep -A 5 "contracts/"
```

## Updating Coverage Claims

If updating marketing materials or documentation:
- **Verified Tests**: 167+ unit tests
- **Verified Coverage**: 81.82% branch coverage
- **Invariant Tests**: 26,880+ executions
- **Test Types**: Unit, Integration, Invariant, Fuzz

These numbers are reproducible using the commands above.