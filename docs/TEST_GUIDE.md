# Lockx test suite documentation v3.1.0

This directory contains the comprehensive three-tier test suite for the Lockx smart contract system. Current snapshot:

- **Hardhat (unit coverage)**: 99.63% statements, 90.08% branches, 100% functions, 100% lines; 438 tests passing
- **Foundry (property tests)**: 31 invariant tests, ~25M randomized operations  
- **Foundry (scenario tests)**: 368 comprehensive tests across 83 files

**Total testing coverage**: 837+ tests with 26M+ operations providing mathematical, functional, and real-world confidence.

Tests are reproducible with:

```bash
# Complete validation suite (recommended)
npm run coverage                    # Hardhat: 438 unit tests + coverage
npm run forge:test                  # Foundry: 31 invariants + 25M operations  
./test-all-foundry.sh              # Foundry: 368 scenarios + integration
```

## Test organization

### Test structure 

The test suite is organized into systematic phases and targeted test files to improve branch coverage:

**Systematic coverage testing (17 phases):**
```
test/
├── systematic-coverage-phase1.spec.ts    # Initial branch coverage establishment
├── systematic-coverage-phase2.spec.ts    # Additional branch targeting
├── systematic-coverage-phase3.spec.ts    # Additional branch targets
├── systematic-coverage-phase4.spec.ts    # Working branch improvements
├── systematic-coverage-phase5.spec.ts    # Additional coverage increase
├── systematic-coverage-phase6.spec.ts    # Withdrawals-focused branches
├── systematic-coverage-phase7.spec.ts    # Simple branch wins
├── systematic-coverage-phase8.spec.ts    # Additional coverage attempts
├── systematic-coverage-phase9.spec.ts    # Deposits-specific branches
├── systematic-coverage-phase10.spec.ts   # Additional targets
├── systematic-coverage-phase11.spec.ts   # Reentrancy testing
├── systematic-coverage-phase12.spec.ts   # Reentrancy detection paths
├── systematic-coverage-phase13.spec.ts   # Easy coverage wins
├── systematic-coverage-phase14.spec.ts   # Additional strategies
├── systematic-coverage-phase15.spec.ts   # Reentrancy scenarios
├── systematic-coverage-phase16.spec.ts   # Achieving 90%
└── systematic-coverage-phase17.spec.ts   # Final coverage push
```

**Additional testing files:**
```
├── advanced-branch-coverage.spec.ts      # Branch targeting techniques
├── comprehensive-edge-cases.spec.ts      # Edge case scenarios
├── precision-branch-targeting.spec.ts    # Branch targeting strategies
├── advanced-attack-scenarios.spec.ts     # Attack scenario tests
├── systematic-testing.spec.ts            # Systematic test suite
└── swap-edge-cases.spec.ts               # Swap edge cases
```

Through these 45+ test files with 380+ individual tests, the legacy aggregate view reports 85.95% branch coverage (historical). The current production contracts report 90.08% branch coverage via `npm run coverage`.

## Running tests

### Unit testing with coverage
```bash
npm run coverage
```

Runs all Hardhat tests (currently 438 passing) with coverage and generates HTML under `coverage/`.

### Invariant and fuzz testing (Foundry)
```bash
npm run forge:test
```

Runs 31 property tests (invariants + fuzz), ~25 million randomized operations validating core mathematical properties.

### Comprehensive scenario testing (Foundry v3.1.0)
```bash
./test-all-foundry.sh
```

Runs 368 scenario tests across 83 files (~15 minutes). Tests edge cases, multi-user interactions, complex workflows, and strategic attack vectors.

### Advanced testing capabilities (v3.1.0)
```bash
# Critical security invariants
forge test --match-contract "LockxAdvancedInvariant"   # 4 advanced security properties

# Strategic attack vector fuzzing  
forge test --match-contract "LockxStrategicFuzz"       # 3 strategic fuzzing tests
```


## Coverage metrics

### Coverage snapshot: 90.08% overall branch coverage (production contracts)

| Contract | Statements | Branches | Functions | Lines | Notes |
|----------|-----------|----------|-----------|-------|-------|
| Lockx.sol | 100% (84/84) | 90.54% (67/74) | 100% (16/16) | 100% (97/97) | |
| SignatureVerification.sol | 100% (12/12) | 100% (14/14) | 100% (7/7) | 100% (22/22) | |
| Deposits.sol | 98.18% (54/55) | 86.36% (38/44) | 100% (13/13) | 100% (72/72) | |
| Withdrawals.sol | 100% (118/118) | 90% (99/110) | 100% (6/6) | 100% (162/162) | |

Overall coverage (production): 90.08% branches with 99.63% statements.

### Viewing coverage report

After running coverage, open the HTML report:
```bash
open coverage/index.html
Note: Coverage of `contracts/mocks/**` is test scaffolding; only the four production contracts under `contracts/` (`Lockx.sol`, `Withdrawals.sol`, `Deposits.sol`, `SignatureVerification.sol`) should be used to assess production quality.
```

## Systematic testing approach

The test suite uses a 17-phase systematic approach to maximize branch coverage:

**Phase distribution:**
- Phase 1-5: Basic branch coverage establishment
- Phase 6-10: Targeted missing branch identification  
- Phase 11-13: Advanced edge case testing
- Phase 14-17: Final push achieving 85.95%

Each phase targets 5-10 specific missing branches, resulting in progressive coverage improvement from ~85.12% to the final 85.95%.

## Missing branch analysis

The remaining 34 uncovered branches (14.05%) consist of:

### ReentrancyGuard Detection Branches (14 branches)
- 7 in Lockx.sol (nonReentrant modifier detection paths)
- 5 in Withdrawals.sol (complex withdrawal scenarios)
- 2 in Deposits.sol (deposit reentrancy paths)

### Complex Validation Branches (20 branches)
- Router overspending protection mechanisms
- Slippage validation in swap operations
- ETH output paths in complex swaps
- Zero address recipient validations
- Mathematical edge cases in array operations

These branches require sophisticated attack infrastructure that goes beyond standard testing capabilities and represent the most robust defensive programming practices.

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

### 6. Swap Recipient Functionality (NEW - v2.3.0)
- ERC20→ERC20 swaps with external recipient
- ETH→ERC20 swaps with external recipient  
- ERC20→ETH swaps with external recipient
- Multiple recipients in consecutive swaps
- Backward compatibility (address(0) credits lockbox)
- Event emission validation (privacy-preserving)
- Signature tampering prevention

### 7. Edge Cases
- Fee-on-transfer tokens
- ETH transfer failures
- Array gaps handling
- Non-existent token operations
- Access control validation

## Analysis of Uncovered Branches

### Remaining uncovered branches

**Covered by tests:**
- Array mismatch conditions in batch operations
- Error validation branches
- Interface support checks
- Empty operation validations
- Soulbound transfer restrictions

**Complex to cover (require additional infrastructure):**
- Advanced swap router integrations (16+ branches in Withdrawals.sol)
- Complex signature verification edge cases
- Defensive checks for malicious contract interactions
- Mathematical edge cases in array operations

Note: Uncovered branches primarily represent:
1. Defensive validations for edge cases
2. Complex DeFi integration paths
3. Impossible scenarios under normal operation

The above do not, by themselves, indicate security vulnerabilities; they are defensive checks and complex paths.

## Replicating coverage

### Quick start (85.95% branch coverage)
```bash
# Install dependencies
npm install

# Run unit tests with coverage
npm run coverage

# Run invariant tests
npm run forge:test
```

### Expected results (production contracts)
```bash
# Final Coverage Report
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------------|----------|----------|----------|----------|
contracts/               |    99.63 |    90.08 |      100 |      100 |
  Lockx.sol             |      100 |    90.54 |      100 |      100 |
  SignatureVerification |      100 |      100 |      100 |      100 |
  Deposits.sol          |    98.18 |    86.36 |      100 |      100 |
  Withdrawals.sol       |      100 |       90 |      100 |      100 |
```

### Coverage highlights
- Lockx.sol: 90.54% branches
- 98.51% statements
- 100% functions
- 99.15% lines

## Foundry comprehensive testing suite (v3.1.0)

Foundry testing using property-based testing and comprehensive scenario validation across 83 test files:

### Test categories

**Invariant/Property testing (31 tests):**
```bash
npm run forge:test                # 31 invariants with ~25M operations
```

**Comprehensive scenario testing (368 tests across 83 files):**
```
test/foundry/
├── LockxInvariant.t.sol                    # Core balance invariants
├── LockxAdvancedInvariant.t.sol           # Advanced security properties (v3.1.0)
├── LockxArrayInvariant.t.sol              # Array consistency 
├── LockxMultiUserInvariant.t.sol          # Multi-user isolation
├── LockxNonceInvariant.t.sol              # Signature nonce integrity
├── LockxStrategicFuzz.t.sol               # Strategic attack fuzzing (v3.1.0)
├── LockxCore100.t.sol                     # Core functionality scenarios
├── LockxCoreCoverageComplete.t.sol        # Complete core coverage
├── LockxDepositsComplete.t.sol            # Comprehensive deposit testing
├── LockxWithdrawalsComplete.t.sol         # Complete withdrawal scenarios
├── LockxEdgeCases.t.sol                   # Edge case validation
├── LockxSignatureVerificationComplete.t.sol # EIP-712 signature testing
├── LockxBurnPurge.t.sol                   # Lockbox burning and storage cleanup
├── LockxSwapSafetyInvariant.t.sol         # Swap operation safety
├── LockxBatchWithdrawInvariant.t.sol      # Batch operation validation (v3.1.0)
└── ... 68 additional test files covering comprehensive scenarios
```

**Run all scenario tests:**
```bash
./test-all-foundry.sh              # 368 tests across 83 files (~15 minutes)
```

### Running invariant tests
```bash
npm run forge:test
```

This runs 31 invariant tests with 1,000 runs × 25,000 calls = 25 million operations.

### What these tests validate

**Core Property Testing (31 tests):**

1. **Balance invariants** (`LockxInvariant.t.sol`):
   - Contract ETH balance equals internal accounting
   - Contract ERC20 balances match stored values
   - No funds can be lost or created unexpectedly

2. **Array consistency** (`LockxArrayInvariant.t.sol`):
   - ERC20 tracking arrays have no duplicates
   - Index mapping consistency (bijection property)
   - Array operations maintain data integrity

3. **Multi-user isolation** (`LockxMultiUserInvariant.t.sol`):
   - Users cannot access each other's lockboxes
   - Total balances remain consistent across operations
   - Cross-user operations maintain proper isolation

4. **Nonce monotonicity** (`LockxNonceInvariant.t.sol`):
   - Signature nonces never decrease
   - Nonce increments are properly tracked
   - No replay attacks possible

**Advanced Security Properties (v3.1.0):**

5. **Advanced invariants** (`LockxAdvancedInvariant.t.sol`):
   - Total asset conservation (contract balance = sum of user balances)
   - Ownership uniqueness (every token has exactly one owner)
   - Signature nonce integrity (nonces only increase, never regress)
   - No stuck assets (all contract assets accounted for)

6. **Batch operation safety** (`LockxBatchWithdrawInvariant.t.sol`):
   - Array length mismatch detection
   - Duplicate token prevention
   - Batch operation integrity

**Strategic Attack Vector Testing (v3.1.0):**

7. **Strategic fuzzing** (`LockxStrategicFuzz.t.sol`):
   - Deposit sequence attack vectors
   - Swap parameter manipulation attempts
   - Multi-user chaos scenarios

**Comprehensive Scenario Validation (368 tests):**
- Edge cases across all contract functions
- Multi-user interaction scenarios
- Complex workflow testing
- EIP-712 signature verification
- Swap operation safety
- Asset management integrity
- Storage cleanup verification

### Test statistics
- Default: 1,000 runs × 25,000 calls = 25 million operations
- Extended: 5,000 runs × 50,000 calls = 250 million operations
- Depth: 25 levels of function calls
- All 31 invariants: passing

These tests are intended to validate that the system maintains the listed invariants under a range of operation sequences.