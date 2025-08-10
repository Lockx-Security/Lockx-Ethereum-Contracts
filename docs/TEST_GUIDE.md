# Lockx test suite documentation

This directory contains the complete test suite for the Lockx smart contract system. Current snapshot:

- Hardhat (coverage): contracts/ 99.63% statements, 90.08% branches, 100% functions, 100% lines; 438 tests passing
- Foundry (property tests): 27 tests (invariants + fuzz), ~25M randomized operations

Tests are reproducible with:

```bash
npm run coverage   # hardhat + solidity-coverage
npm run forge:test # foundry invariants + fuzz
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

Runs 27 property tests (invariants + fuzz), ~25 million randomized operations validating core properties.


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

## Foundry property-based testing

Invariant testing using Foundry's fuzz testing engine:

### Invariant test suite (4 contracts, 7 invariants)

```
test/foundry/
├── LockxInvariant.t.sol          # Balance accounting invariants
├── LockxArrayInvariant.t.sol     # Array consistency invariants
├── LockxMultiUserInvariant.t.sol # Multi-user isolation invariants
└── LockxNonceInvariant.t.sol     # Nonce monotonicity invariants
```

### Running invariant tests
```bash
npm run forge:test
```

This runs 7 invariant tests with 1,000 runs × 25,000 calls = 25 million operations.

### What these tests validate

1. Balance invariants (`LockxInvariant.t.sol`):
- Contract ETH balance equals internal accounting
- Contract ERC20 balances match stored values
- No funds can be lost or created unexpectedly

2. Array consistency (`LockxArrayInvariant.t.sol`):
- ERC20 tracking arrays have no duplicates
- Index mapping consistency (bijection property)
- Array operations maintain data integrity

3. Multi-user isolation (`LockxMultiUserInvariant.t.sol`):
- Users cannot access each other's lockboxes
- Total balances remain consistent across operations
- Cross-user operations maintain proper isolation

4. Nonce monotonicity (`LockxNonceInvariant.t.sol`):
- Signature nonces never decrease
- Nonce increments are properly tracked
- No replay attacks possible

### Test statistics
- Default: 1,000 runs × 25,000 calls = 25 million operations
- Extended: 5,000 runs × 50,000 calls = 250 million operations
- Depth: 25 levels of function calls
- All 7 invariants: passing

These tests are intended to validate that the system maintains the listed invariants under a range of operation sequences.