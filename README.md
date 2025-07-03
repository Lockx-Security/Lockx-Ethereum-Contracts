# Lockx Smart Contracts v2.0.0

[![license](https://img.shields.io/badge/license-BUSL--1.1-blue)](LICENSE)
[![version](https://img.shields.io/badge/version-2.0.0-green)](CHANGELOG.md)
[![openzeppelin](https://img.shields.io/badge/OpenZeppelin-v5.3.0-blue)](https://github.com/OpenZeppelin/openzeppelin-contracts/releases/tag/v5.3.0)

Professional Solidity smart-contract suite implementing soul-bound NFT lockboxes with OpenZeppelin v5.3.0 security standards. Features comprehensive testing (215M+ test executions), dual framework support (Hardhat + Foundry), and EIP-712 v2 signature verification.

## Table of contents

1. [Version 2.0.0 highlights](#version-200-highlights)
2. [Prerequisites](#prerequisites)
3. [Quick start](#quick-start)
4. [Testing](#testing)
5. [Coverage](#coverage)
6. [Static analysis](#static-analysis)
7. [Linting & formatting](#linting--formatting)
8. [Deployment](#deployment)
9. [Continuous integration](#continuous-integration)
10. [Environment variables](#environment-variables)

---

## Version 2.0.0 highlights

🔐 **Security upgrades**
- Upgraded to OpenZeppelin v5.3.0 with enhanced access control
- EIP-712 domain version upgraded to '2' for improved signature security
- Modern soul-bound NFT implementation using secure `_update()` patterns
- Zero vulnerabilities in production dependencies

🧪 **Comprehensive testing**
- **215+ million test executions** across Hardhat and Foundry
- 12 Hardhat unit/integration tests
- 15 Foundry test suites with extensive fuzz and invariant testing
- Full coverage of edge cases and error conditions

📊 **Dual framework support**
- Hardhat for development, deployment, and TypeScript testing
- Foundry for advanced fuzzing, invariant testing, and gas optimization
- Cross-framework compatibility ensuring robust validation

See [CHANGELOG.md](CHANGELOG.md) for complete v2.0.0 release notes.

---

## Prerequisites

• Node.js ≥ 18 (tested on 20).  
• npm (ships with Node).  
• Python 3.10+ (required for Slither).  
• `pipx` **or** `pip` able to install Python packages globally (Slither).

> Hardhat shows a warning on Node 23 – use an LTS version for production.

## Quick start

```bash
# install dependencies
npm install

# copy env template and fill in RPC URL / private key / etherscan key
cp .env.example .env

# compile contracts
npx hardhat compile
```

## Testing

The project features comprehensive testing across two frameworks:

### Hardhat testing (TypeScript/Chai)
```bash
npm test         # runs all 12 unit & integration tests
```

**Test suites:**
- `deposits.spec.ts` - deposit functionality and validation
- `lockx.spec.ts` - core lockbox operations
- `withdrawals.spec.ts` - withdrawal mechanics  
- `withdrawals.reverts.spec.ts` - signature/balance/recipient error paths

### Foundry testing (Solidity)
```bash
forge test       # runs all 15 Foundry test suites
forge test -v    # verbose output with gas usage
```

**Advanced testing features:**
- **Fuzz testing**: 8 functions × 256-260 runs = 2,072 executions
- **Invariant testing**: 7 invariants with 215M+ calls total
- **Property-based testing**: Validates contract behavior across input ranges
- **Gas optimization**: Detailed gas consumption analysis

### Edge-case tests

Both frameworks include comprehensive edge-case coverage for signature verification, balance validation, and error conditions.

## Coverage

```bash
npm run coverage            # outputs coverage summary in terminal
open coverage/index.html    # full HTML coverage report
```

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
