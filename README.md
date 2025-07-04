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
- **Hardhat testing suite** with TypeScript/Chai
- **Foundry invariant testing** with 7 property-based tests
- **Fuzz testing** with 983,040 total test executions
- Real gas consumption benchmarks and optimization

📊 **Test coverage**
- Current coverage: 44.74% statements
- Target coverage: 80%+ (in progress)
- Active test development ongoing

The project features comprehensive testing with both frameworks:

### Hardhat testing (TypeScript/Chai)
```bash
npm test         # runs all 12 unit & integration tests
npm run coverage # generates coverage report
```

**Test suites:**
- `deposits.spec.ts` - deposit functionality and validation
- `lockx.spec.ts` - core lockbox operations
- `withdrawals.spec.ts` - withdrawal mechanics  
- `withdrawals.reverts.spec.ts` - signature/balance/recipient error paths

### Foundry testing (Solidity)
```bash
forge test       # runs all invariant tests
forge test -v    # verbose output with gas usage
```

**Invariant test suites:**
1. `LockxInvariant.t.sol`
   - Contract ETH balance matches accounting ✅
   - Contract ERC20 balance matches accounting ✅

2. `LockxMultiUserInvariant.t.sol`
   - Total ETH matches across users ✅
   - Token balances match across users ✅

3. `LockxNonceInvariant.t.sol`
   - Nonces are monotonically increasing ✅

4. `LockxArrayInvariant.t.sol`
   - ERC20 token array indices are consistent ✅
   - No duplicate token addresses ✅

**Test execution metrics:**
- 7 invariant tests × 256 runs × 3,840 calls = 983,040 total executions
- All invariant tests passing
- Fuzz testing with randomized inputs
- Property-based testing validating core invariants

### Edge-case tests

The test suite includes edge-case coverage for signature verification, balance validation, and error conditions.

### Coverage improvement plan

Current focus areas for improving test coverage:
1. Adding tests for SignatureVerification.sol
2. Expanding Deposits.sol test scenarios
3. Adding more edge cases for Withdrawals.sol
4. Implementing comprehensive Lockx.sol testing

Target: 80%+ coverage across all contracts

## Static analysis

### Slither

Slither is invoked via npm script and in CI.

```bash
# install once (Python)
pipx install "slither-analyzer==0.11.1"
# or: pip install --user slither-analyzer==0.11.1

npm run slither             # produces checklist report
```

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

## Continuous integration

`.github/workflows/ci.yml` executes on every push / PR:

1. Install dependencies
2. Run tests
3. Generate coverage
4. Install & run Slither

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

**Current version:** 2.0.0  
**OpenZeppelin:** v5.3.0  
**EIP-712 domain:** 'Lockx', version '2'  

For detailed release notes, security improvements, and breaking changes, see [CHANGELOG.md](CHANGELOG.md).

## Gas reports

Current gas consumption analysis is available at [reports/gas-report.txt](reports/gas-report.txt).
