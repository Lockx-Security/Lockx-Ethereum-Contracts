# Raw Test Output Data

## Coverage Report Output

```
--------------------|----------|----------|----------|----------|----------------|
File                |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
--------------------|----------|----------|----------|----------|----------------|
 contracts/         |    91.03 |    89.36 |    95.24 |    91.84 |                |
  Deposits.sol      |    88.31 |    84.09 |      100 |    89.19 |... 261,278,279 |
  Lockx.sol         |    93.75 |    92.42 |      100 |    94.03 |... 254,258,296 |
  SignatureVerifi...|      100 |      100 |      100 |      100 |                |
  Withdrawals.sol   |    89.76 |     87.5 |      100 |    90.32 |... 461,532,533 |
 contracts/mocks/   |    84.06 |       75 |    88.89 |    85.71 |                |
  LockxHarness.sol  |        0 |        0 |        0 |        0 |... 38,43,44,45 |
  MockERC20.sol     |      100 |       50 |      100 |      100 |                |
  MockERC721.sol    |      100 |       50 |      100 |      100 |                |
  MockFeeOnTransf...|      100 |     87.5 |      100 |      100 |                |
  RejectETH.sol     |      100 |      100 |      100 |      100 |                |
  SignatureVerifi...|      100 |      100 |      100 |      100 |                |
--------------------|----------|----------|----------|----------|----------------|
All files           |    88.49 |    86.17 |    94.12 |    89.53 |                |
--------------------|----------|----------|----------|----------|----------------|

> Istanbul reports written to ./coverage/ and ./coverage.json
```

## Test Execution Log

```
$ npx hardhat test test/*.spec.ts

  Lockx Core Functionality
    ✓ should create lockbox with ETH (95ms)
    ✓ should create lockbox with ERC20 (87ms)
    ✓ should create lockbox with ERC721 (91ms)
    ✓ should create lockbox with batch assets (103ms)
    ✓ should deposit ETH to existing lockbox (76ms)
    ✓ should deposit ERC20 to existing lockbox (82ms)
    ✓ should deposit ERC721 to existing lockbox (88ms)
    ✓ should withdraw ETH with valid signature (112ms)
    ✓ should withdraw ERC20 with valid signature (108ms)
    ✓ should withdraw ERC721 with valid signature (115ms)
    ✓ should rotate lockbox key (95ms)
    ✓ should burn lockbox and return assets (125ms)
    ✓ should handle batch withdrawals (118ms)
    ✓ should set token metadata URI (72ms)

  Branch Coverage Tests
    ✓ should revert on zero address owner (45ms)
    ✓ should revert on zero address lockbox key (42ms)
    ✓ should revert on invalid signature (48ms)
    ✓ should revert on expired signature (51ms)
    ✓ should revert on signature reuse (55ms)
    ✓ should handle zero ETH deposits (38ms)
    ✓ should handle zero ERC20 deposits (41ms)
    ✓ should revert on insufficient balance (47ms)
    ✓ should revert on unauthorized access (44ms)
    ✓ should handle empty batch operations (40ms)
    ✓ should revert on non-existent token (43ms)
    ✓ should handle fee-on-transfer tokens (68ms)
    ✓ should reject ETH transfers to non-payable (52ms)
    ✓ should handle array removal edge cases (61ms)
    ✓ should test all creation modifiers (55ms)
    ✓ should test withdrawal modifiers (58ms)
    ✓ should test deposit modifiers (54ms)
    ✓ should test signature verification branches (62ms)
    ✓ should test interface support (48ms)

  Complete Branch Coverage
    ✓ should test withdrawETH with zero address recipient (89ms)
    ✓ should test withdrawETH from non-owner (45ms)
    ✓ should test withdrawERC20 with zero address (91ms)
    ✓ should test withdrawERC20 from non-owner (47ms)
    ✓ should test withdrawERC721 with zero address (94ms)
    ✓ should test withdrawERC721 from non-owner (49ms)
    ✓ should test batchWithdraw with zero address (98ms)
    ✓ should test batchWithdraw from non-owner (51ms)
    ✓ should test rotateLockboxKey from non-owner (46ms)
    ✓ should test burnLockbox from non-owner (48ms)

  [Additional test suites output truncated for brevity - 160+ total tests]

  167 passing (24s)
```

## Branch Coverage Details from lcov.info

### Deposits.sol Branch Coverage (37/44 = 84.09%)
```
BRDA:56,1,0,3     - Line 56, branch 1, path 0: hit 3 times
BRDA:56,1,1,202   - Line 56, branch 1, path 1: hit 202 times
BRDA:65,2,0,0     - Line 65, branch 2, path 0: NOT COVERED (owner == address(0))
BRDA:65,2,1,40    - Line 65, branch 2, path 1: hit 40 times
BRDA:89,3,0,9     - Line 89, branch 3, path 0: hit 9 times
BRDA:89,3,1,0     - Line 89, branch 3, path 1: NOT COVERED
...
```

### Lockx.sol Branch Coverage (61/66 = 92.42%)
```
BRDA:84,1,0,101   - Line 84, branch 1, path 0: hit 101 times
BRDA:84,1,1,0     - Line 84, branch 1, path 1: NOT COVERED
BRDA:85,2,0,1     - Line 85, branch 2, path 0: hit 1 time
BRDA:85,2,1,100   - Line 85, branch 2, path 1: hit 100 times
...
```

### Withdrawals.sol Branch Coverage (56/64 = 87.5%)
```
BRDA:61,1,0,21    - Line 61, branch 1, path 0: hit 21 times
BRDA:61,1,1,0     - Line 61, branch 1, path 1: NOT COVERED
BRDA:63,2,0,1     - Line 63, branch 2, path 0: hit 1 time
BRDA:63,2,1,19    - Line 63, branch 2, path 1: hit 19 times
...
```

### SignatureVerification.sol Branch Coverage (14/14 = 100%)
```
BRDA:79,1,0,2     - Line 79, branch 1, path 0: hit 2 times
BRDA:79,1,1,145   - Line 79, branch 1, path 1: hit 145 times
BRDA:92,2,0,2     - Line 92, branch 2, path 0: hit 2 times
BRDA:92,2,1,105   - Line 92, branch 2, path 1: hit 105 times
...
All branches covered
```

## Foundry Invariant Test Output

```
$ forge test --match-contract Invariant -vv

[⠊] Compiling...
[⠢] Compiling 4 files with 0.8.28
[⠆] Solc 0.8.28 finished in 1.23s

Running 7 tests for test/foundry/InvariantTests.t.sol:InvariantTests
[PASS] invariant_contractEthMatchesAccounting() (runs: 256, calls: 3840, reverts: 412)
[PASS] invariant_erc20BalancesMatch() (runs: 256, calls: 3840, reverts: 389)
[PASS] invariant_nftOwnershipConsistency() (runs: 256, calls: 3840, reverts: 421)
[PASS] invariant_arrayIntegrity() (runs: 256, calls: 3840, reverts: 403)
[PASS] invariant_nonceMonotonicity() (runs: 256, calls: 3840, reverts: 395)
[PASS] invariant_lockboxStateConsistency() (runs: 256, calls: 3840, reverts: 408)
[PASS] invariant_multiUserIsolation() (runs: 256, calls: 3840, reverts: 411)

Test result: ok. 7 passed; 0 failed; finished in 45.21s
```

## Test File Statistics

```
$ wc -l test/*.spec.ts
     293 test/achieve-100-coverage.spec.ts
     186 test/complete-branch-coverage.spec.ts
     151 test/comprehensive-branch-coverage.spec.ts
     148 test/core-functionality.spec.ts
     167 test/deposits-100-coverage.spec.ts
     293 test/edge-case-branches.spec.ts
     255 test/final-100-branch-coverage.spec.ts
     344 test/final-100-coverage.spec.ts
     344 test/final-push-100-coverage.spec.ts
     195 test/fix-coverage-issues.spec.ts
      82 test/fix-failing-tests.spec.ts
     227 test/lockx-100-coverage.spec.ts
     313 test/mock-contracts.spec.ts
     283 test/withdrawals-100-coverage.spec.ts
     151 test/edge-cases.spec.ts
    3432 total
```

## Coverage Improvement Timeline

```
Initial Coverage Run: 61.5% (112/182 branches)
After Phase 1: 72.3% (132/182 branches)
After Phase 2: 81.7% (149/182 branches)
After Phase 3: 86.8% (158/182 branches)
Final Coverage: 89.36% (168/188 branches)
```