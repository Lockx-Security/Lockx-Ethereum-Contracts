# Lockx smart contracts v4.0.0

[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-4.0.0-green)](CHANGELOG.md)
[![openzeppelin](https://img.shields.io/badge/OpenZeppelin-v5.3.0-blue)](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.3.0)

Solidity contracts implementing soul-bound NFT lockboxes. Uses OpenZeppelin v5.3.0. Features comprehensive three-tier testing framework (Hardhat unit tests, Foundry property testing, and strategic scenario validation) with EIP-712 v4 signature verification.

## Table of contents

1. [Open source and testing](#open-source-and-testing)
2. [Testing framework](#testing-framework)
3. [Running tests](#running-tests)
4. [Test coverage](#test-coverage)
5. [Static analysis](#static-analysis)
6. [Linting & formatting](#linting--formatting)
7. [Deployment](#deployment)
8. [Contract architecture](#contract-architecture)
9. [Environment variables](#environment-variables)
10. [Development & testing acknowledgments](#development--testing-acknowledgments)
11. [Version information](#version-information)
12. [Gas reports](#gas-reports)

---

## Open source and testing

The Lockx smart contracts are open source and tested with a comprehensive three-tier testing framework:

- **Hardhat unit tests**: 90.94% branch coverage across 46 test files with 568 passing tests
- **Foundry property testing**: 79 invariant tests with >22M randomized operations
- **Foundry scenario testing**: 320 comprehensive tests across 69 files covering edge cases, multi-user interactions, and strategic attack vectors
- **Total coverage**: 967+ tests providing unit, property-based, and scenario validation

**Hardhat coverage results:**
```
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------------|----------|----------|----------|----------|
contracts/               |    99.63 |    90.94 |      100 |      100 |
  Lockx.sol              |      100 |    90.54 |      100 |      100 |
  SignatureVerification  |      100 |      100 |      100 |      100 |
  Deposits.sol           |    98.18 |    86.36 |      100 |      100 |
  Withdrawals.sol        |      100 |       90 |      100 |      100 |
```

**Foundry testing results:**
```
Test Type                | Files | Tests | Operations |
-------------------------|-------|-------|------------|
Scenario & Integration   |   69  | 320   |     N/A    |
Property & Invariants    |   22  |  79   | >22M calls |
-------------------------|-------|-------|------------|
TOTAL                    |   91  | 399   | >22M ops   |
```

All tests are publicly available and replicable:
```bash
# Clone and setup
git clone [repo-url]
npm install

# Unit tests with coverage (Hardhat)
npm run coverage                    # 568 tests, 90.94% branch coverage

# Property-based testing (Foundry invariants)  
npm run test:foundry:invariants           # 79 tests across 22 suites, >22M operations

# Comprehensive scenario testing (Foundry)
npm run test:foundry:scenarios     # 320 tests, edge cases & integrations (or npm run test:foundry for both invariants+scenarios)
```

---

## Testing framework

The Lockx smart contracts use a three-tier testing approach providing comprehensive validation:

### **Tier 1: Unit Testing (Hardhat)**
- **568 deterministic tests** across 46 files
- **90.08% branch coverage** of production contracts
- **Systematic function validation** with predetermined inputs
- **Coverage measurement** and gap analysis

### **Tier 2: Property Testing (Foundry Invariants)**
- **79 invariant tests** across 22 files  
- **>22 million randomized operations** testing mathematical properties
- **Critical security properties**: Asset conservation, nonce integrity, ownership uniqueness
- **Continuous validation** that system properties hold under chaos

### **Tier 3: Scenario Testing (Foundry Comprehensive)**
- **320 scenario tests** across 69 files  
- **Real-world workflows**: Multi-user interactions, complex swaps, edge cases
- **Strategic fuzzing**: Deposit sequences, swap parameters, attack vectors
- **Integration testing**: Complete user journeys and cross-contract interactions

### **Combined Confidence Level**
The three-tier approach provides:
- **Mathematical confidence** (property invariants)
- **Functional confidence** (unit test coverage)  
- **Real-world confidence** (scenario validation)

## Test coverage
- **Current coverage**: 90.94% production branch coverage
- **focus**: coverage figures refer to the production contracts only — `contracts/Lockx.sol`, `contracts/Withdrawals.sol`, `contracts/Deposits.sol`, `contracts/SignatureVerification.sol`. Aggregates that include `contracts/mocks/**` are not representative of production quality.
- **Working Test Suite**: `systematic-core-suite.spec.ts` (5 passing tests) and systematic phases
- **Foundry Invariants**: >22 million randomized operations across 22 test suites
- **Security Focus**: 100% coverage of signature verification and access control paths
- **Core Contract**: Lockx.sol achieves 90.54% branch coverage (exceeds 90% target)

### Test coverage by function

#### Core lockbox functions
- **createLockboxWithETH**: 8 tests (creation, validation, gas optimization)
- **createLockboxWithERC20**: 6 tests (creation, batch operations, edge cases)
- **createLockboxWithERC721**: 4 tests (NFT handling, metadata validation)
- **createLockboxWithBatch**: 5 tests (multi-asset creation, array validation)

#### Deposit functions  
- **depositETH**: 7 tests (basic deposits, validation, reentrancy)
- **depositERC20**: 12 tests (token handling, fee-on-transfer, batch operations)
- **depositERC721**: 8 tests (NFT deposits, approval patterns, metadata)
- **batchDeposit**: 6 tests (multi-asset deposits, gas optimization)

#### Withdrawal functions
- **withdrawETH**: 9 tests (basic withdrawals, access control, edge cases)
- **withdrawERC20**: 11 tests (token withdrawals, balance validation, cleanup)
- **withdrawERC721**: 7 tests (NFT withdrawals, ownership validation)
- **batchWithdraw**: 8 tests (multi-asset withdrawals, array handling)

#### Swap functions
- **swapInLockbox**: 14 tests (ERC20 swaps, slippage protection, security validation)
- **Integration tests**: 6 tests (swap + withdrawal/deposit combinations)
- **Security tests**: 8 tests (access control, signature verification, reentrancy)
- **Performance tests**: 6 tests (gas analysis, multi-hop swaps, optimization)

#### Key management
- **rotateLockboxKey**: 4 tests (key rotation, signature validation, access control)
- **Signature verification**: 12 tests (EIP-712 validation, replay protection, expiry)

#### Utility functions
- **burnLockbox**: 5 tests (cleanup, asset recovery, access control)
- **getFullLockbox**: 8 tests (data retrieval, pagination, complex scenarios)
- **Array management**: 6 tests (insertion, removal, gap handling)

**[Testing report →](docs/TESTING_REPORT.md)** | **[Swap testing →](docs/SWAP_FUNCTIONALITY_TEST_REPORT.md)** | **[Gas analysis →](docs/GAS_REPORT.md)** | **[Raw test output →](docs/TEST_OUTPUT_RAW.md)** | **[Test guide →](docs/TEST_GUIDE.md)**

### Running tests

#### **All Test Suites (Recommended)**
```bash
# Complete test validation (recommended for CI/production)
npm run coverage                    # Hardhat: 568 unit tests + coverage
npm run test:foundry:invariants     # Foundry: 79 invariants + >22M operations  
npm run test:foundry:scenarios     # Foundry: 320 scenarios + integration
```

#### **Individual Test Suites**
```bash
# Unit tests with coverage analysis
npm run coverage                    # 568 tests, ~2 minutes, 90.94% branch coverage

# Property-based testing (mathematical invariants)
npm run test:foundry:invariants     # 79 invariants, ~51 minutes, >22M random operations

# Comprehensive scenario testing  
npm run test:foundry:scenarios     # 320 tests, ~10 minutes, real-world scenarios
```

#### **Targeted Testing**
```bash
# Test specific areas
forge test --match-contract "LockxEdgeCases"           # Edge case validation
forge test --match-contract "LockxMultiUser"           # Multi-user scenarios  
forge test --match-contract "LockxAdvancedInvariant"   # Critical invariants (or use npm run test:foundry:invariants for all)
forge test --match-contract "LockxStrategicFuzz"       # Attack vector fuzzing
```

#### **Test Results Interpretation**
- **Hardhat tests**: Validate individual function behavior and measure coverage
- **Foundry invariants**: Ensure mathematical properties never break under chaos  
- **Foundry scenarios**: Validate real-world usage patterns and complex workflows


**Core invariant test results (all passing):**
- Contract ETH balance matches accounting ✅ (1000 runs × 25,000 calls)
- Contract ERC20 balance matches accounting ✅ (1000 runs × 25,000 calls)  
- Nonces are monotonically increasing ✅ (1000 runs × 25,000 calls)
- ERC20 token array indices are consistent ✅ (1000 runs × 25,000 calls)
- Multi-user balance consistency ✅ (1000 runs × 25,000 calls)
- Array integrity maintained ✅ (1000 runs × 25,000 calls)
- No duplicate addresses in arrays ✅ (1000 runs × 25,000 calls)

**Advanced invariant test results (v3.1.0):**
- Total asset conservation ✅ (256 runs × 15,000 calls)
- Ownership uniqueness ✅ (256 runs × 15,000 calls)
- Signature nonce integrity ✅ (256 runs × 15,000 calls) 
- No stuck assets ✅ (256 runs × 15,000 calls)

**Strategic fuzzing test results (v3.1.0):**
- Deposit sequence fuzzing ✅ (258 runs with random parameters)
- Swap parameter fuzzing ✅ (258 runs with edge case slippage)
- Multi-user chaos testing ✅ (258 runs with concurrent operations)

**Test execution coverage:**
- **>22 million operations** executed across 79 invariant tests
- **320 scenario validations** covering real-world usage patterns
- **Strategic attack vector testing** with randomized fuzzing
- **Mathematical confidence** in system behavior under all operation sequences

### Edge-case tests

The test suite includes comprehensive edge-case coverage including:
- Signature verification and replay attack prevention
- Balance validation and arithmetic boundary conditions
- Array manipulation and cleanup scenarios
- Fee-on-transfer token handling
- ETH transfer failure scenarios
- Multi-asset batch operation edge cases

### Testing methodology

The testing approach combines multiple methodologies:
- **Unit testing**: Validates individual functions with predetermined inputs
- **Fuzz testing**: Discovers edge cases through randomized input generation
- **Invariant testing**: Ensures system properties remain true across all state transitions
- **Property-based testing**: Validates mathematical relationships and behavioral correctness

## Static analysis

### Solidity-lint (Solhint)

```bash
npm run lint:sol            # runs solhint over contracts/
```

## Linting & formatting

Prettier (with `prettier-plugin-solidity`) is configured. Format the entire repo:

```bash
npm run format
```

## Deployment

Deploy to any configured network (see `hardhat.config.ts`). Example for Sepolia:

```bash
npx hardhat run --network sepolia scripts/deploy.ts

# verify on Etherscan (API key required in .env)
npx hardhat verify --network sepolia <DEPLOYED_ADDRESS>
```

`scripts/deploy.ts` performs a simple deployment of the `Lockx` contract.

## Contract architecture

### Immutable design

The Lockx smart contracts are designed to be **immutable** and are not intended to be upgraded once deployed. The contracts do not implement any upgradeability patterns, proxy mechanisms, or administrative upgrade functions.

**Key characteristics:**
- **No proxy contracts**: Direct deployment without upgradeability proxies
- **No admin functions**: No administrative controls for contract modification
- **Immutable logic**: Contract code cannot be changed after deployment
- **Permanent deployment**: Once deployed, the contract behavior is fixed

This design is intended to provide predictable behavior after deployment.

### Gas analysis

Gas consumption analysis is available for all contract operations:

```bash
npm run gas:report  # generates detailed gas consumption report
```

## Environment variables

Create a `.env` file (based on `.env.example`) in the project root:

```
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/yourKey
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/yourKey
PRIVATE_KEY=0xabc123...
ETHERSCAN_API_KEY=YourEtherscanKey
```

`PRIVATE_KEY` should correspond to the deployer account – **keep it safe**.

---

## Development and testing acknowledgments

Parts of the test suite (46 test files, 568 passing tests, 90.94% branch coverage) were assisted by automated tooling, including Claude, for test generation and coverage improvement.

The core smart contract logic, architecture, and security design are authored by the Lockx team.

---

## Version information

**Current version:** 4.0.0  
**OpenZeppelin:** v5.3.0  
**EIP-712 domain:** 'Lockx', version '4'  

### **v4.0.0 Release Highlights:**
- **Expanded Foundry test suite**: 320 scenario tests
- **Advanced invariant testing**: 4 new critical security properties  
- **Strategic fuzzing**: 3 new attack vector tests
- **Comprehensive documentation**: Updated test commands and replication guides
- **Zero breaking changes**: All existing functionality preserved

For detailed release notes, security improvements, and breaking changes, see [CHANGELOG.md](CHANGELOG.md).

## Gas reports

Current gas consumption analysis is available at [docs/GAS_REPORT.md](docs/GAS_REPORT.md).
