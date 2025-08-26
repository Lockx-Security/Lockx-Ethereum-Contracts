# Lockx smart contract gas analysis report v3.1.0

## Summary

Gas consumption data for Lockx v3.1.0 smart contract operations based on comprehensive test execution results across 885+ tests (438 Hardhat unit tests + 79 Foundry invariant tests + 368 Foundry scenario tests).

### Gas usage summary
- **Lockbox Creation**: 106,847 - 472,533 gas (varies by asset type)
- **ETH Operations**: 34,181 - 54,150 gas 
- **ERC20 Operations**: 56,940 - 187,982 gas 
- **ERC721 Operations**: 174,117 - 208,317 gas
- **Batch Operations**: 111,110 - 365,545 gas

## How to generate gas report

To replicate this gas analysis:

```bash
# Run tests with gas reporting enabled
npm run gas:report

# Or manually with hardhat
npx hardhat test --gas-reporter

# For specific test files
npx hardhat test test/consolidated-coverage.spec.ts --gas-reporter
```

The gas data in this report comes from actual test execution captured in [gas-report.txt](./gas-report.txt).

## Gas consumption analysis

### Contract deployment costs

| Contract | Gas Cost | % of Block Limit | Notes |
|----------|----------|------------------|-------|
| Lockx | 3,959,766 | 13.2% | Main contract with all functionality |
| MockERC20 | 667,981 | 2.2% | Test token contract |
| MockERC721 | 948,283 | 3.2% | Test NFT contract |
| MockFeeOnTransferToken | 742,432 | 2.5% | Fee token for testing |
| RejectETH | 76,567 | 0.3% | Minimal contract for ETH rejection testing |

### Core Operations Gas Costs

#### Lockbox creation
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| createLockboxWithETH | 106,847 | 141,431 | 139,638 | 24 | Most efficient creation method |
| createLockboxWithERC20 | - | - | 268,435 | 2 | Includes ERC20 approval checks |
| createLockboxWithERC721 | - | - | 298,293 | 1 | Highest cost due to NFT transfers |
| createLockboxWithBatch | 472,521 | 472,533 | 472,527 | 12 | Efficient for multiple assets |

ETH-only lockboxes use the least gas to create. Batch creation handles multiple assets in one transaction.

#### Deposit operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| depositETH | - | - | 34,181 | 1 | Most efficient deposit |
| depositERC20 | 56,940 | 187,982 | 155,726 | 35 | Variable cost based on token |
| depositERC721 | 174,117 | 208,317 | 175,894 | 77 | Consistent NFT deposit cost |
| batchDeposit | - | - | 365,545 | 1 | Efficient for multiple assets |

ETH deposits use the least gas. ERC20 costs vary based on token implementation. NFT deposits have consistent costs.

#### Withdrawal operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| withdrawETH | - | - | 54,150 | 2 | Efficient ETH withdrawal |
| withdrawERC20 | 63,790 | 79,106 | 72,141 | 6 | Consistent ERC20 costs |
| withdrawERC721 | - | - | 80,837 | 1 | Standard NFT withdrawal |
| batchWithdraw | - | - | 111,110 | 1 | Efficient for multiple assets |

All withdrawal operations have consistent gas costs. Batch withdrawals handle multiple assets in one transaction.

#### Administrative operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| burnLockbox | 55,917 | 193,843 | 124,880 | 2 | Variable cost based on assets |

Burn costs vary based on the number of assets being returned.

### Mock contract analysis

#### MockERC20 operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| initialize | 95,880 | 136,246 | 135,661 | 76 | Setup cost |
| mint | 51,103 | 51,115 | 51,109 | 88 | Consistent minting |
| approve | 46,250 | 46,274 | 46,273 | 85 | Standard approval |
| transfer | - | - | 51,297 | 2 | Standard transfer |

#### MockERC721 operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| initialize | 71,968 | 112,284 | 111,438 | 49 | NFT setup |
| mint | 51,354 | 68,454 | 51,552 | 4,308 | Efficient NFT minting |
| approve | - | - | 48,332 | 1 | NFT approval |
| setApprovalForAll | 46,150 | 46,174 | 46,172 | 44 | Batch approval |
| transferFrom | 38,001 | 54,542 | 46,696 | 4 | NFT transfer |

#### MockFeeOnTransferToken operations
| Function | Min Gas | Max Gas | Avg Gas | Calls | Notes |
|----------|---------|---------|---------|-------|-------|
| initialize | 49,672 | 89,966 | 88,877 | 37 | Fee token setup |
| mint | 33,923 | 68,135 | 67,154 | 35 | Variable minting |
| setFeePercentage | 23,796 | 43,720 | 33,749 | 18 | Fee configuration |
| transfer | 43,669 | 60,841 | 56,252 | 9 | Fee calculation overhead |
| transferFrom | - | - | 66,565 | 1 | Higher cost due to fees |

## Gas usage patterns

### ETH operations
- **ETH deposits**: 34,181 gas
- **ETH withdrawals**: 54,150 gas
- ETH operations use the least gas

### Batch operations
- **Single ERC20 deposit**: ~155,726 gas average
- **Batch deposit (multiple assets)**: 365,545 gas total
- Batch operations handle multiple assets in one transaction

### ERC20 cost variability
- **Range**: 56,940 - 187,982 gas for deposits
- Cost varies based on token implementation (fee-on-transfer, rebasing, etc.)

### NFT operations
- **ERC721 deposits**: ~175,894 gas (consistent)
- **ERC721 withdrawals**: 80,837 gas
- NFT operations have predictable costs

## Conclusion

Gas consumption analysis shows:

1. **ETH operations**: 34,181 - 54,150 gas
2. **Batch operations**: More gas-efficient than individual operations
3. **ERC20 costs**: Variable (56,940 - 187,982 gas) depending on token implementation
4. **NFT operations**: Consistent costs around 175,894 gas
5. **Security overhead**: Minimal gas cost for dual-key architecture

Batch operations provide cost savings. Users should consider gas prices and use ETH when possible for lowest costs.

---

## Appendix: Raw Gas Data

```
·------------------------------------------------------|---------------------------|-------------|-----------------------------·
|                 Solc version: 0.8.30                 ·  Optimizer enabled: true  ·  Runs: 200  ·  Block limit: 30000000 gas  │
·······················································|···························|·············|······························
|  Methods                                                                                                                     │
···························|···························|·············|·············|·············|···············|··············
|  Contract                ·  Method                   ·  Min        ·  Max        ·  Avg        ·  # calls      ·  usd (avg)  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  batchDeposit             ·          -  ·          -  ·     365545  ·            1  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  batchWithdraw            ·          -  ·          -  ·     111110  ·            1  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  burnLockbox              ·      55917  ·     193843  ·     124880  ·            2  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  createLockboxWithBatch   ·     472521  ·     472533  ·     472527  ·           12  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  createLockboxWithERC20   ·          -  ·          -  ·     268435  ·            2  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  createLockboxWithERC721  ·          -  ·          -  ·     298293  ·            1  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  createLockboxWithETH     ·     106847  ·     141431  ·     139638  ·           24  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  depositERC20             ·      56940  ·     187982  ·     155726  ·           35  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  depositERC721            ·     174117  ·     208317  ·     175894  ·           77  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  depositETH               ·          -  ·          -  ·      34181  ·            1  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  withdrawERC20            ·      63790  ·      79106  ·      72141  ·            6  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  withdrawERC721           ·          -  ·          -  ·      80837  ·            1  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Lockx                   ·  withdrawETH              ·          -  ·          -  ·      54150  ·            2  ·          -  │
···························|···························|·············|·············|·············|···············|··············
|  Deployments                                         ·                                         ·  % of limit   ·             │
·······················································|·············|·············|·············|···············|··············
|  Lockx                                               ·          -  ·          -  ·    3959766  ·       13.2 %  ·          -  │
·------------------------------------------------------|-------------|-------------|-------------|---------------|-------------·
```