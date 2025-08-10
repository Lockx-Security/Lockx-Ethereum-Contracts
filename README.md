# Lockx smart contracts v3.0.2

[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-3.0.2-green)](CHANGELOG.md)
[![openzeppelin](https://img.shields.io/badge/OpenZeppelin-v5.3.0-blue)](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.3.0)

Solidity contracts implementing soul-bound NFT lockboxes. Uses OpenZeppelin v5.3.0. Includes unit and property-based tests (Hardhat and Foundry) and EIP-712 v3 signature verification.

## Table of contents

1. [Open source & testing](#open-source--testing)
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

The Lockx smart contracts are open source and tested with two frameworks:

- **Hardhat unit tests**: 90.5% branch coverage across 46 test files with 438 passing tests
- **Foundry property testing**: 27 tests (invariants + fuzz) with ~25M randomized operations
- **Signature verification and access control**: full test coverage
- **Core contract coverage**: `Lockx.sol` 90.54% branch coverage

**Testing results:**
```
File                     |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------------|----------|----------|----------|----------|
contracts/               |    98.51 |    90.5  |      100 |    99.15 |
  Lockx.sol              |      100 |    90.54 |      100 |      100 |
  SignatureVerification  |      100 |      100 |      100 |      100 |
  Deposits.sol           |    96.36 |    84.09 |      100 |      100 |
  Withdrawals.sol        |    98.31 |    78.18 |      100 |    96.3  |
```

All tests are publicly available and replicable:
```bash
# clone and test locally
git clone [repo-url]
npm install

# unit tests with coverage (reproducible)
npm run coverage

# invariants + fuzz (reproducible)
npm run forge:test
```

---

## Testing framework
- Phase-based tests: 20 files targeting specific branches
- Hardhat: 90.5% branch coverage and 438 passing tests
- Foundry: 27 tests (invariants + fuzz) executing ~25 million operations
- Core functionality tests included for replication
- Property-based tests validate system invariants and balance consistency

## Test coverage
- **Current coverage**: ~90.5% production branch coverage
- **focus**: coverage figures refer to the production contracts only — `contracts/Lockx.sol`, `contracts/Withdrawals.sol`, `contracts/Deposits.sol`, `contracts/SignatureVerification.sol`. Aggregates that include `contracts/mocks/**` are not representative of production quality.
- **Working Test Suite**: `systematic-core-suite.spec.ts` (5 passing tests) and systematic phases
- **Foundry Invariants**: 25 million randomized operations across 7 test cases
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

**[Testing report →](reports/TESTING_REPORT.md)** | **[Swap testing →](docs/SWAP_FUNCTIONALITY_TEST_REPORT.md)** | **[Gas analysis →](reports/GAS_REPORT.md)** | **[Raw test output →](reports/TEST_OUTPUT_RAW.md)** | **[Test guide →](test/README.md)**

### Running tests

```bash
# unit testing with coverage
npm run coverage

# invariant and fuzz testing (foundry)
npm run forge:test
```

The first command runs all Hardhat tests (currently 438 passing) with coverage. The second runs Foundry property tests.


**Invariant test results (all passing):**
- Contract ETH balance matches accounting ✅ (1000 runs × 25,000 calls)
- Contract ERC20 balance matches accounting ✅ (1000 runs × 25,000 calls)
- Nonces are monotonically increasing ✅ (1000 runs × 25,000 calls)
- ERC20 token array indices are consistent ✅ (1000 runs × 25,000 calls)
- Multi-user balance consistency ✅ (1000 runs × 25,000 calls)
- Array integrity maintained ✅ (1000 runs × 25,000 calls)
- No duplicate addresses in arrays ✅ (1000 runs × 25,000 calls)

**Test execution coverage:**
- **25 million operations** executed across 7 invariant tests
- Property-based testing validating core system invariants  
- Statistical confidence in system behavior under all operation sequences
- Balance consistency, array integrity, and nonce monotonicity verified

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

Parts of the test suite (46 test files, 438 passing tests, 90.5% branch coverage) were assisted by automated tooling, including Claude, for test generation and coverage improvement.

The core smart contract logic, architecture, and security design are authored by the Lockx team.

---

## Version information

**Current version:** 3.0.2  
**OpenZeppelin:** v5.3.0  
**EIP-712 domain:** 'Lockx', version '3'  

For detailed release notes, security improvements, and breaking changes, see [CHANGELOG.md](CHANGELOG.md).

## Gas reports

Current gas consumption analysis is available at [reports/GAS_REPORT.md](reports/GAS_REPORT.md).
