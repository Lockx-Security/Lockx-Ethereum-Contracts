# Gas Consumption Report

**Contract Version:** v2.4.0  
**Compiler:** Solc version 0.8.30  
**Optimizer:** Enabled (200 runs)  
**Block Limit:** 30,000,000 gas  
**Test Coverage:** 86.78% branches (Lockx.sol: 90.54%)  

## Method Gas Usage

| Contract | Method | Min Gas | Max Gas | Avg Gas | # Calls |
|----------|--------|---------|---------|---------|---------|
| Lockx | batchDeposit | - | - | 365,545 | 1 |
| Lockx | batchWithdraw | - | - | 111,110 | 1 |
| Lockx | burnLockbox | 55,917 | 193,843 | 124,880 | 2 |
| Lockx | createLockboxWithBatch | 472,521 | 472,533 | 472,527 | 12 |
| Lockx | createLockboxWithERC20 | - | - | 268,435 | 2 |
| Lockx | createLockboxWithERC721 | - | - | 298,293 | 1 |
| Lockx | createLockboxWithETH | 106,847 | 141,431 | 139,638 | 24 |
| Lockx | depositERC20 | 56,940 | 187,982 | 155,726 | 35 |
| Lockx | depositERC721 | 174,117 | 208,317 | 175,894 | 77 |
| Lockx | depositETH | - | - | 34,181 | 1 |
| Lockx | withdrawERC20 | 63,790 | 79,106 | 72,141 | 6 |
| Lockx | withdrawERC721 | - | - | 80,837 | 1 |
| Lockx | withdrawETH | - | - | 54,150 | 2 |

## Mock Contract Gas Usage

| Contract | Method | Min Gas | Max Gas | Avg Gas | # Calls |
|----------|--------|---------|---------|---------|---------|
| MockERC20 | approve | 46,250 | 46,274 | 46,273 | 85 |
| MockERC20 | initialize | 95,880 | 136,246 | 135,661 | 76 |
| MockERC20 | mint | 51,103 | 51,115 | 51,109 | 88 |
| MockERC20 | transfer | - | - | 51,297 | 2 |
| MockERC721 | approve | - | - | 48,332 | 1 |
| MockERC721 | initialize | 71,968 | 112,284 | 111,438 | 49 |
| MockERC721 | mint | 51,354 | 68,454 | 51,552 | 4,308 |
| MockERC721 | setApprovalForAll | 46,150 | 46,174 | 46,172 | 44 |
| MockERC721 | transferFrom | 38,001 | 54,542 | 46,696 | 4 |
| MockFeeOnTransferToken | approve | 45,962 | 46,274 | 46,262 | 30 |
| MockFeeOnTransferToken | initialize | 49,672 | 89,966 | 88,877 | 37 |
| MockFeeOnTransferToken | mint | 33,923 | 68,135 | 67,154 | 35 |
| MockFeeOnTransferToken | setFeePercentage | 23,796 | 43,720 | 33,749 | 18 |
| MockFeeOnTransferToken | transfer | 43,669 | 60,841 | 56,252 | 9 |
| MockFeeOnTransferToken | transferFrom | - | - | 66,565 | 1 |

## Deployment Gas Costs

| Contract | Gas Used | % of Block Limit |
|----------|----------|------------------|
| Lockx | 3,959,766 | 13.2% |
| MockERC20 | 667,981 | 2.2% |
| MockERC721 | 948,283 | 3.2% |
| MockFeeOnTransferToken | 742,432 | 2.5% |
| RejectETH | 76,567 | 0.3% |

## Gas Analysis Summary

**Most Expensive Operations:**
- Contract Deployment: 3,959,766 gas (Lockx)
- Batch Creation: 472,527 gas average
- Batch Deposits: 365,545 gas
- ERC721 Deposits: 175,894 gas average

**Most Efficient Operations:**
- ETH Deposits: 34,181 gas
- ETH Withdrawals: 54,150 gas
- ERC20 Withdrawals: 72,141 gas average

**Gas Optimization Notes:**
- Token operations show consistent gas usage across different amounts
- Mock contracts add overhead but provide realistic testing environment
- Batch operations are more gas-efficient per asset than individual operations
- Gas measurements taken during comprehensive coverage testing (86.78% branches)
- All measurements include security validations and comprehensive error checking

**Replication:**
```bash
# Generate fresh gas report with coverage
./scripts/replicate-coverage.sh
```