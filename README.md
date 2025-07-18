# Lockx Smart Contracts v2.1.1

[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-2.1.1-green)](CHANGELOG.md)
[![openzeppelin](https://img.shields.io/badge/OpenZeppelin-v5.3.0-blue)](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.3.0)

Professional Solidity smart-contract suite implementing soul-bound NFT lockboxes with OpenZeppelin v5.3.0 security standards. Features comprehensive testing with dual framework support (Hardhat + Foundry), fuzz testing, and EIP-712 v2 signature verification.

## Table of contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Testing](#testing)
5. [Coverage](#coverage)
6. [Static analysis](#static-analysis)
7. [Linting & formatting](#linting--formatting)
8. [Deployment](#deployment)
9. [Continuous integration](#continuous-integration)
10. [Environment variables](#environment-variables)

---

🧪 **Testing framework**
- **Hardhat testing suite** with 95+ unit tests achieving 89.36% branch coverage
- **Foundry testing** with 7 invariant tests executing 26,880 operations
- **Comprehensive swap testing** with 14 production-ready test scenarios
- **Security validation** of dual-key architecture and attack resistance
- **Complete test consolidation** in single file for easy replication

📊 **Test coverage**
- **Branch coverage**: 89.36% (168/188 branches)
- **Total tests**: 116+ tests (95 Hardhat + 7 Foundry + 14 Swap)
- **Key achievement**: 100% coverage of signature verification
- **Test execution**: ~26 seconds for full suite

### Test Coverage by Function

#### Core Lockbox Functions
- **createLockboxWithETH**: 8 tests (creation, validation, gas optimization)
- **createLockboxWithERC20**: 6 tests (creation, batch operations, edge cases)
- **createLockboxWithERC721**: 4 tests (NFT handling, metadata validation)
- **createLockboxWithBatch**: 5 tests (multi-asset creation, array validation)

#### Deposit Functions  
- **depositETH**: 7 tests (basic deposits, validation, reentrancy)
- **depositERC20**: 12 tests (token handling, fee-on-transfer, batch operations)
- **depositERC721**: 8 tests (NFT deposits, approval patterns, metadata)
- **batchDeposit**: 6 tests (multi-asset deposits, gas optimization)

#### Withdrawal Functions
- **withdrawETH**: 9 tests (basic withdrawals, access control, edge cases)
- **withdrawERC20**: 11 tests (token withdrawals, balance validation, cleanup)
- **withdrawERC721**: 7 tests (NFT withdrawals, ownership validation)
- **batchWithdraw**: 8 tests (multi-asset withdrawals, array handling)

#### Swap Functions
- **swapInLockbox**: 14 tests (ERC20 swaps, slippage protection, security validation)
- **Integration tests**: 6 tests (swap + withdrawal/deposit combinations)
- **Security tests**: 8 tests (access control, signature verification, reentrancy)
- **Performance tests**: 6 tests (gas analysis, multi-hop swaps, optimization)

#### Key Management
- **rotateLockboxKey**: 4 tests (key rotation, signature validation, access control)
- **Signature verification**: 12 tests (EIP-712 validation, replay protection, expiry)

#### Utility Functions
- **burnLockbox**: 5 tests (cleanup, asset recovery, access control)
- **getFullLockbox**: 8 tests (data retrieval, pagination, complex scenarios)
- **Array management**: 6 tests (insertion, removal, gap handling)

📋 **[Testing Report →](reports/TESTING_REPORT.md)** | **[Swap Testing →](docs/SWAP_FUNCTIONALITY_TEST_REPORT.md)** | **[Gas Analysis →](reports/gas-report.md)** | **[Raw Test Output →](reports/raw-test-output.md)** | **[Test Guide →](test/README.md)**

### Running tests

```bash
# Run all tests (base + swap functionality)
npm test

# Run base functionality tests only
npx hardhat test test/consolidated-coverage.spec.ts

# Run swap functionality tests only
npx hardhat test test/production-ready-swap-tests.spec.ts

# Run coverage analysis (89.36% branch coverage)
npx hardhat coverage --testfiles "test/consolidated-coverage.spec.ts"

# View coverage report
open coverage/index.html
```

**Test files:**
- `consolidated-coverage.spec.ts` - Complete test suite achieving 89.36% coverage
- `production-ready-swap-tests.spec.ts` - Comprehensive swap functionality tests
- `swap-functionality.spec.ts` - Basic swap functionality tests
- `core-functionality.spec.ts` - Basic functionality tests
- `mock-contracts.spec.ts` - Mock contract tests

### Foundry testing (Solidity)
```bash
forge test       # runs all invariant tests
forge test -v    # verbose output with gas usage
```

**Invariant test suites:**
- Contract ETH balance matches accounting ✅
- Contract ERC20 balance matches accounting ✅
- Nonces are monotonically increasing ✅
- ERC20 token array indices are consistent ✅
- Multi-user balance consistency ✅

**Test execution coverage:**
- Fuzz testing with randomized inputs for edge case discovery
- Property-based testing validating core system invariants
- Comprehensive coverage of batch operations and multi-asset scenarios

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

## Contract Architecture

### Immutable Design

The Lockx smart contracts are designed to be **immutable** and are not intended to be upgraded once deployed. The contracts do not implement any upgradeability patterns, proxy mechanisms, or administrative upgrade functions.

**Key characteristics:**
- **No proxy contracts**: Direct deployment without upgradeability proxies
- **No admin functions**: No administrative controls for contract modification
- **Immutable logic**: Contract code cannot be changed after deployment
- **Permanent deployment**: Once deployed, the contract behavior is fixed

This design ensures maximum security and predictability, as users can be certain that the contract logic will never change after deployment.

### Gas Optimization

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

## Version information

**Current version:** 2.1.1  
**OpenZeppelin:** v5.3.0  
**EIP-712 domain:** 'Lockx', version '2'  

For detailed release notes, security improvements, and breaking changes, see [CHANGELOG.md](CHANGELOG.md).

## Gas reports

Current gas consumption analysis is available at [reports/gas-report.md](reports/gas-report.md).
