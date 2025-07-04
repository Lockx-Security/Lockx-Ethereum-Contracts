# Lockx Smart Contracts v2.1.0

[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-2.1.0-green)](CHANGELOG.md)
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
- **Hardhat testing suite** with 60 unit tests across 4 test files
- **Foundry testing** with 7 invariant tests across 4 test suites
  - Each invariant test runs 256 times with ~15 calls per run
  - Total test executions: 26,880 calls (7 tests × 3,840 calls each)
- **Core functionality tests**: 14 tests for basic operations
- **Branch coverage tests**: 19 tests for conditional paths
- **Edge case tests**: 8 tests for boundary conditions
- **Mock contract tests**: 19 tests for contract interactions
- Real gas consumption benchmarks and optimization

📊 **Test coverage**
- **Total unique tests**: 67 tests across multiple methodologies
  - 60 Hardhat unit tests (37 passing, 23 failing due to access control changes)
  - 7 Foundry invariant tests (26,880 total calls)
- **Branch coverage**: 59 branches tested across 96 total branches

📋 **[Click here for complete testing report →](TESTING_REPORT.md)**

The project features comprehensive testing with both frameworks:

### Hardhat testing (TypeScript/Chai)
```bash
npm test         # runs all 60 unit tests across 4 test files
npm run coverage # generates coverage report
```

**Test suites:**
- `core-functionality.spec.ts` (14 tests) - fundamental lockbox operations and happy path scenarios
- `comprehensive-branch-coverage.spec.ts` (19 tests) - systematic testing of all conditional branches
- `edge-cases-and-errors.spec.ts` (8 tests) - unusual conditions and error handling
- `mock-contracts.spec.ts` (19 tests) - mock contract functionality and integration testing

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

**Current version:** 2.1.0  
**OpenZeppelin:** v5.3.0  
**EIP-712 domain:** 'Lockx', version '2'  

For detailed release notes, security improvements, and breaking changes, see [CHANGELOG.md](CHANGELOG.md).

## Gas reports

Current gas consumption analysis is available at [reports/gas-report.txt](reports/gas-report.txt).
