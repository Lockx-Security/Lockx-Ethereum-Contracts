# Lockx – Security & quality-assurance report (v1.1.2)

_Generated 2025-06-23_

> **Executive summary**  
> • No critical or high-severity issues found across Slither, Mythril, fuzz, and invariant tests.  
> • 100 % line & branch coverage; invariant suites prove balance conservation and nonce monotonicity.  
> • Gas snapshot and CI gas-diff guardrails in place to catch regressions.  
> • Recommend keeping `viaIR` compiler flag and retaining invariant tests on future changes.

---

## 1 Executive summary

This document describes the assessment performed on the Lockx smart-contract suite prior to the v1.0.0 release. All findings in this report refer to commit `c72cef38` (current `main` HEAD).

---

## 2 Methodology

### 2.1 Environment

| Component | Version                     |
| --------- | --------------------------- |
| Node.js   | 23.3.0                      |
| Hardhat   | 2.24.3 (optimizer, `viaIR`) |
| Foundry   | 0.2.x                       |
| Solidity  | 0.8.30                      |

### 2.2 Testing layers

1. **Deterministic unit tests** (Hardhat, Mocha/Chai) – single-path checks for success and expected reverts. Executes in <1 s.
2. **Property-based fuzz tests** (Foundry) – hundreds of runs with pseudo-random inputs per entry-point; automatically shrinks failing inputs.
3. **Stateful invariants** (Foundry) – thousands of random call sequences checking high-level properties such as balance conservation and nonce monotonicity.

### 2.3 Static & symbolic analysis

- **Slither** – 76 detectors, checklist and printer modules.
- **Mythril** – symbolic execution on `Lockx.sol` with 300 s time-box.
- **CodeQL** – JavaScript / TypeScript queries for repository scripts.

### 2.4 Gas profiling & regression guardrails

`hardhat-gas-reporter` captures gas usage on every CI run. A dedicated workflow (`gas-diff.yml`) posts a comparison table on pull-requests if consumption changes.

---

## 3 Contract architecture

Lockx is composed of four on-chain modules:

| Contract                    | Responsibility                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `Lockx.sol`                 | User-facing ERC-721 contract that mints soul-bound lockboxes and exposes high-level deposit/withdraw helpers. |
| `Deposits.sol`              | Internal module that records ETH, ERC-20 and ERC-721 deposits, enforcing balance accounting.                  |
| `Withdrawals.sol`           | Internal counterpart that executes authorised withdrawals and keeps balances in sync.                         |
| `SignatureVerification.sol` | Shared EIP-712 domain separator and signature validation utilities.                                           |

Only `Lockx.sol` is exposed to end-users; the other modules are inherited and never deployed separately.

---

## 4 Function-by-function analysis (`Lockx.sol`)

For each entry-point below, the following format is used:

- **Purpose** – brief description.
- **Threat surface** – main abuse vectors considered.
- **Unit test excerpt** – condensed snippet with expected outcome.
- **Fuzz property** – statement verified by Foundry.
- **Invariant involvement** – larger properties that include the function.
- **Gas** – measured cost on the Paris EVM target.

### 4.1 `createLockboxWithETH`

- **Purpose** – Mint a new soul-bound ERC-721 and deposit ETH in a single call.
- **Threat surface** – Incorrect balance accounting, bypassing self-mint restriction, reentrancy on mint.
- **Unit test excerpt**
  ```typescript
  it('mints and credits ETH', async () => {
    const tx = await lockx.createLockboxWithETH(owner.address, signer, refId, { value: 1e18 });
    await expect(tx).to.emit(lockx, 'Locked').withArgs(0);
    expect(await lockx.balanceETH(0)).to.equal(1e18);
  });
  ```
- **Fuzz property** – For all `amount > 0`, `balanceETH(tokenId) == amount` immediately after deposit.
- **Invariant involvement** – `LockxInvariant`: ∑`balanceETH(tokenId) == address(this).balance` after arbitrary sequences of deposits/withdrawals.
- **Gas** – 241 546.

### 4.2 `createLockboxWithERC20`

- **Purpose** – Mint and deposit an ERC-20 amount.
- **Threat surface** – Wrong allowance checks, token address misuse, mis-accounting.
- **Unit test excerpt**
  ```typescript
  it('mints and credits ERC20', async () => {
    await token.mint(owner.address, 5000);
    await token.approve(lockx.getAddress(), 5000);
    await lockx.createLockboxWithERC20(owner.address, signer, token.getAddress(), 5000, refId);
    expect(await lockx.balanceERC20(0, token.getAddress())).to.equal(5000);
  });
  ```
- **Fuzz property** – For all `amount > 0`, internal ledger equals token balance held by contract.
- **Invariant involvement** – `LockxArrayInvariant` (array bijection) and `LockxInvariant` (ETH+ERC-20 totals).
- **Gas** – 87 214.

### 4.3 `createLockboxWithERC721`

- **Purpose** – Mint and wrap an external NFT.
- **Threat surface** – Transfers of non-owned NFTs, unsafe receivers.
- **Unit test excerpt**
  ```typescript
  it('wraps NFT', async () => {
    await nft.mint(owner.address, 7);
    await nft.approve(lockx.getAddress(), 7);
    await lockx.createLockboxWithERC721(owner.address, signer, nft.getAddress(), 7, refId);
    expect(await nft.ownerOf(7)).to.equal(lockx.getAddress());
  });
  ```
- **Fuzz property** – For all `tokenId`, post-deposit ownership is contract address.
- **Invariant involvement** – Covered indirectly by withdrawal invariants to ensure NFTs leave state cleanly.
- **Gas** – 98 671.

### 4.4 `createLockboxWithBatch`

- **Purpose** – Mint and deposit mixed assets (ETH, ERC-20, ERC-721) in one call.
- **Threat surface** – Array length mismatches, inconsistent `msg.value`, partial failures.
- **Fuzz property** – Given matching array lengths and non-zero totals, every asset appears in bookkeeping structures after call.
- **Unit test excerpt** – Batch tests are written in Solidity (`LockxBatchFuzz.t.sol`) and assert total counts.
- **Gas** – 543 816 (inputs: 1 ETH, 2 ERC-20s, 1 ERC-721).

### 4.5 `setDefaultMetadataURI`

- **Purpose** – One-time default URI.
- **Unit test excerpt**
  ```typescript
  await lockx.setDefaultMetadataURI('ipfs://base', { from: owner });
  await expect(lockx.setDefaultMetadataURI('ipfs://again')).to.be.reverted;
  ```
- **Gas** – 31 975.

### 4.6 `setTokenMetadataURI`

- **Purpose** – Update per-token URI based on EIP-712 signature.
- **Unit test excerpt**
  ```typescript
  const digest = await lockx.hashSetURI(0, 'ipfs://custom', refId, expiry);
  const sig = sign(digest, lockboxKey);
  await lockx.setTokenMetadataURI(0, digest, sig, 'ipfs://custom', refId, expiry);
  ```
- **Threat surface** – Replay, signature spoofing, expiry bypass.
- **Gas** – 71 002.

### 4.7 `tokenURI`

- **Purpose** – Resolve effective URI.
- **Checks** – custom first, else default, else revert.

### 4.8 `soul-bound enforcement`

- `locked` and `_transfer` override. Tested via explicit revert expectations and by ensuring no invariant trace can transfer a lockbox.

### 4.9 Fallback / receive

Rejects stray ETH. Hardhat test sends 0.1 ETH to fallback and expects revert.

---

## 5 Cross-function invariants

| Suite                     | Property                                              | Calls              | Result |
| ------------------------- | ----------------------------------------------------- | ------------------ | ------ |
| `LockxInvariant`          | Contract ETH + ERC-20 balances equal internal ledgers | 128 000 × 256 runs | Pass   |
| `LockxArrayInvariant`     | ERC-20 ledger arrays have no gaps or duplicates       | 128 000 × 256 runs | Pass   |
| `LockxNonceInvariant`     | `nonce` per lockbox strictly increases                | 98 000 × 196 runs  | Pass   |
| `LockxMultiUserInvariant` | Sum of three users’ balances equals contract totals   | 128 000 × 256 runs | Pass   |

If any property failed, Foundry would output the minimal failing call trace for replication.

---

## 6 Unit test summary

| Suite                 | Assertions | Time     |
| --------------------- | ---------- | -------- | -------------------------------------------------------------------- |
| deposits              | 2          | <1 s     | ([deposits.spec.ts](../test/deposits.spec.ts))                       |
| core lockbox          | 1          | <1 s     | ([lockx.spec.ts](../test/lockx.spec.ts))                             |
| withdrawal reverts    | 6          | <1 s     | ([withdrawals.reverts.spec.ts](../test/withdrawals.reverts.spec.ts)) |
| withdrawals           | 3          | <1 s     | ([withdrawals.spec.ts](../test/withdrawals.spec.ts))                 |
| metadata & soul-bound | 3          | <1 s     | ([lockx.spec.ts](../test/lockx.spec.ts))                             |
| **Total**             | **15**     | **~1 s** |

---

## 7 Fuzz & invariant summary

Runs ≥257 per fuzz case; up to 128 000 calls per invariant run. All tests pass.

---

## 8 Coverage

100 % lines, branches, functions (see `coverage/`).

---

## 9 Static & symbolic analysis

| Tool    | Critical | High | Notes                                   |
| ------- | -------- | ---- | --------------------------------------- |
| Slither | 0        | 0    | Informational naming/style only         |
| Mythril | 0        | –    | Time-boxed 300 s, no exploitable traces |
| CodeQL  | 0        | –    | JavaScript/TS scan                      |

---

## 10 Gas snapshot

| Function                | Gas     |
| ----------------------- | ------- |
| createLockboxWithETH    | 241 546 |
| createLockboxWithERC20  | 87 214  |
| createLockboxWithERC721 | 98 671  |
| createLockboxWithBatch  | 543 816 |
| batchWithdraw (typical) | 597 809 |

---

## 11 Recommendations

- Maintain branch-protection rules requiring all CI checks.
- Monitor gas-diff comments on pull-requests and scrutinise large regressions.
- Periodically re-run Mythril with higher time-out and add additional Slither detectors as they mature.

---

## 12 Conclusion

Based on the testing, invariant verification, and static analysis performed, no critical or high-severity issues were identified in Lockx v1.0.0. The contracts demonstrate full test coverage and satisfy strict invariants related to asset accounting and nonce monotonicity.

---

_End of report_
