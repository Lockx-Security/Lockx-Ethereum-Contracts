# Lockx Ethereum Contracts — Contract Architecture

This document describes the on-chain architecture for Lockx v5.0.0. It focuses on concrete behavior and interfaces of the four Solidity contracts in `contracts/`.

- Solidity: `^0.8.30`, optimized (viaIR, 10k runs) per `compiler_config.json`.
- License: BUSL‑1.1 (see `LICENSE`).
- Primary dependency: OpenZeppelin Contracts v5.3.0.

## Overview

Lockx provides on-chain “lockboxes” represented by soulbound ERC‑721 tokens. Each lockbox (one per tokenId) is a vault that can hold ETH, ERC‑20s, and ERC‑721s. Deposits credit internal accounting; withdrawals and swaps are gated by EIP‑712 signatures tied to a per‑lockbox public key that can be rotated.

Purpose
- Protect assets even if the wallet (EOA) that owns the lockbox NFT is compromised.
- Enforce non‑transferability (soulbound) for the lockbox NFT to prevent accidental or malicious transfers of control.
- Provide precise, auditable accounting and predictable flows for deposits, withdrawals, and swaps.

How this differs from multisig and hardware wallets
- Multisig and hardware wallets primarily protect keys and the act of signing; they add friction and safety at the key layer.
- Lockx protects assets at the application layer after a compromise: an attacker who steals the owner wallet still cannot withdraw without the independent per‑lockbox EIP‑712 key.
- Separation of powers: owner wallet controls initiation and visibility, while the per‑lockbox “active key” authorizes state‑changing actions; keys can be rotated if suspected compromised.

Core features
- Soulbound ERC‑721 lockboxes (ERC‑5192) with enforced non‑transferability.
- Per‑lockbox EIP‑712 authorization: `activeLockboxPublicKey`, `nonce`, and `referenceId` to prevent replay and cross‑context misuse.
- ETH/ERC‑20/ERC‑721 deposits with O(1) removal bookkeeping and batch operations.
- Signature‑gated withdrawals and router‑allowlisted swaps with strict selector filtering and slippage checks.
- Key rotation, burn, per‑token metadata, and comprehensive view helpers.
- Reentrancy protection and explicit revert reasons throughout.

Where to look in code
- Deposits and accounting: `contracts/Deposits.sol`.
- Withdrawals, batch, swaps: `contracts/Withdrawals.sol`.
- EIP‑712 + key/nonce/reference: `contracts/SignatureVerification.sol`.
- ERC‑721 soulbound wrapper and lifecycle: `contracts/Lockx.sol`.

## Table of Contents

- [Overview](#overview)
- [Contract Architecture](#contract-architecture)
- [Inheritance & Modules](#inheritance--modules)
- [Authorization Model (EIP‑712)](#authorization-model-eip-712)
- [Soulbound ERC‑721 (Lockx)](#soulbound-erc-721-lockx)
- [Asset Accounting (Deposits)](#asset-accounting-deposits)
- [Withdrawals, Batch, and Swaps (Withdrawals)](#withdrawals-batch-and-swaps-withdrawals)
- [Inheritance Diagram](#inheritance-diagram)
- [Minting, Burning, and Key Rotation (Lockx)](#minting-burning-and-key-rotation-lockx)
- [Events](#events)
- [Errors (selection)](#errors-selection)
- [External/Public API (summary)](#externalpublic-api-summary)
- [Storage Layout (core)](#storage-layout-core)
- [Dependencies & Tooling](#dependencies--tooling)
- [Operational Notes](#operational-notes)
- [Router Selector Allowlist](#router-selector-allowlist)
- [Usage Examples](#usage-examples)

## Contract Architecture

High‑level composition and responsibilities of modules and the deployed entrypoint.

## Inheritance & Modules

Top-level deployment is `Lockx` (ERC‑721 soulbound). Internal logic is composed via abstract modules:

```
                 OpenZeppelin
         ┌─────────────────────────┐
         │ ERC721  Ownable  EIP712 │
         └────────────┬────────────┘
                      │
                  (inherits)
                      │
                SignatureVerification
               (EIP-712 ops, key+nonce+ref)
                      ▲
                      │
                    Deposits
     (ETH/20/721 bookkeeping, IERC721Receiver,
            ReentrancyGuard on deposit)
                      ▲
                      │
                   Withdrawals
     (signature-gated withdraw, batch, swap,
        views; ReentrancyGuard on flows)
                      ▲
                      │
                     Lockx
  (ERC-721 soulbound, metadata, mint/burn,
        key rotation, entrypoint contract)
```

- `contracts/SignatureVerification.sol`: EIP‑712 authorization, per‑token key + nonce + referenceId.
- `contracts/Deposits.sol`: Internal ETH/ERC20/ERC721 deposit and tracking.
- `contracts/Withdrawals.sol`: Signature‑gated withdrawals, batch ops, swaps, and views.
- `contracts/Lockx.sol`: Deployed ERC‑721 that mints “Lockboxes”, enforces soulbound behavior, metadata, mint + initial deposits, burn, and key rotation.

Only `Lockx` is deployed. Other contracts are abstract mixins.

## Authorization Model (EIP‑712)

- Domain: name `Lockx`, version `5` (`SignatureVerification` constructor binds to `Lockx` ERC‑721 address).
- Per‑token auth state (`TokenAuth`):
  - `activeLockboxPublicKey`: current authorized key for signatures.
  - `nonce`: incremented on every successful verification to prevent replays.
  - `referenceId`: immutable 32‑byte identifier provided at mint; must match in most state‑changing calls.
- Operations enum (`OperationType`): `ROTATE_KEY`, `WITHDRAW_ETH`, `WITHDRAW_ERC20`, `WITHDRAW_NFT`, `BURN_LOCKBOX`, `SET_TOKEN_URI`, `BATCH_WITHDRAW`, `SWAP_ASSETS`.
- Verification: `_verifySignature(tokenId, signature, newKey, opType, data)` recovers signer against the EIP‑712 hash and increments nonce on success. For `ROTATE_KEY`, it updates the active key to `newKey`.
- Ownership gating: many functions also require `msg.sender` to be ERC‑721 owner of `tokenId`.

Reference IDs
- `_initialize(tokenId, key, referenceId)` sets the per‑token `referenceId` at mint.
- Calls that include a `referenceId` verify it via `_verifyReferenceId(tokenId, referenceId)`.

## Soulbound ERC‑721 (Lockx)

- Implements ERC‑5192 interface `locked(tokenId) → true` for any existing token.
- Non‑transferable: overrides `_update` to revert when transferring between non‑zero addresses; clears per‑token metadata on burn.
- Treasury lockbox: constructor mints `tokenId = 0` to deployer and emits `Locked`/`Minted`.

Metadata
- `setDefaultMetadataURI(string)`: one‑time, `onlyOwner`.
- `setTokenMetadataURI(tokenId, signature, newURI, referenceId, expiry)`: owner‑only + signature by active key; stores per‑token URI.
- `tokenURI(tokenId)`: returns per‑token URI if set; otherwise default URI + `tokenId`; reverts if no URI configured.

Receive/Fallback
- `receive()`: only accepts ETH from allowed router addresses (see Swaps). Direct ETH sends are rejected via `DirectETHTransferNotAllowed`.
- `fallback()`: always reverts.

## Asset Accounting (Deposits)

Tracking structures (per `tokenId`)
- ETH: `_ethBalances[tokenId]` in wei.
- ERC‑20: `_erc20Balances[tokenId][token]` and address list `_erc20TokenAddresses[tokenId]` with index map `_erc20Index[tokenId][token]` for O(1) removal.
- ERC‑721: `_lockboxNftData[tokenId][key]` where `key = keccak256(nftContract, nftTokenId)` and `_nftKeys[tokenId]` + `_nftIndex[tokenId][key]` for O(1) removal.

Deposit functions (owner‑only; non‑reentrant)
- `depositETH(tokenId, referenceId)` payable: credits `_ethBalances[tokenId]` with `msg.value`.
- `depositERC20(tokenId, tokenAddress, amount, referenceId)`: pulls tokens via `safeTransferFrom`, computes actual received by balance delta (fee‑on‑transfer safe), registers token on first deposit, increases balance.
- `depositERC721(tokenId, nftContract, nftTokenId, referenceId)`: registers NFT key and `safeTransferFrom` to contract.
- `batchDeposit(tokenId, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds, referenceId)` payable: deposits across assets with input length checks.

Notes
- Rebasing tokens are not supported; accounting is point‑in‑time.
- Contract implements `IERC721Receiver` and accepts NFTs; actual deposit path is via `depositERC721`.

## Withdrawals, Batch, and Swaps (Withdrawals)

Withdrawals (owner‑only; signature‑gated; non‑reentrant)
- `withdrawETH(tokenId, signature, amountETH, recipient, referenceId, expiry)`: checks balance, verifies signature, debits accounting, sends ETH.
- `withdrawERC20(tokenId, signature, tokenAddress, amount, recipient, referenceId, expiry)`: balance check, signature, debits accounting, transfers token; removes token from address list when balance hits zero.
- `withdrawERC721(tokenId, signature, nftContract, nftTokenId, recipient, referenceId, expiry)`: presence check via key; signature; deletes key; transfers NFT.
- `batchWithdraw(tokenId, signature, amountETH, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds, recipient, referenceId, expiry)`: combined withdraw with validation:
  - `tokenAddresses.length == tokenAmounts.length`, `nftContracts.length == nftTokenIds.length`.
  - ERC‑20 addresses must be strictly increasing, no duplicates.
  - ERC‑721 pairs `(nftContract, tokenId)` must be strictly increasing lexicographically, no duplicates.

Swaps (owner‑only; signature‑gated; non‑reentrant)
- Allowed routers (immutable allowlist): Uniswap V3 Router02, Uniswap Universal Router, 1inch v6, 0x Exchange Proxy, Paraswap Augustus, CowSwap GPv2.
- Allowed function selectors per router (immutable allowlist) to constrain calldata.
- Modes: `SwapMode.EXACT_IN` and `SwapMode.EXACT_OUT`.
- Flow:
  1) Validate router + selector and referenceId; verify EIP‑712 signature over parameters including `keccak256(data)`.
  2) Check balances (EXACT_IN uses `amountSpecified`; EXACT_OUT uses `amountLimit`).
  3) Measure pre‑swap in/out balances of the contract for accurate deltas (handles fee‑on‑transfer).
  4) Approve `target` for ERC‑20 inputs (or pass ETH value), perform low‑level `call`, then reset approval.
  5) Compute `actualAmountIn` and `actualAmountOut` by deltas; validate slippage:
     - EXACT_IN: require `actualOut ≥ amountLimit`, `actualIn ≤ amountSpecified`.
     - EXACT_OUT: require `actualIn ≤ amountLimit`, `actualOut ≥ amountSpecified`.
  6) Apply swap fee `SWAP_FEE_BP = 10` (0.10%) and credit fee to treasury lockbox `tokenId = 0`.
  7) Credit net output either to the same lockbox accounting or transfer to an external `recipient` if provided.

View helpers
- `getFullLockbox(tokenId)`: returns tuple of ETH amount, list of `(tokenAddress, balance)` for ERC‑20s, and list of `nftBalances{nftContract, nftTokenId}`; owner‑gated.
- `getAllowedRouters()` and `isAllowedRouter(address)` are pure views for transparency of the allowlist.

## Inheritance Diagram

```
ERC721 ───────┐
               ├── Lockx (deployed)
Ownable ──────┘         ▲
                         │
                         │ inherits
                         │
Withdrawals (abstract) ──┘
        ▲
        │ inherits
        │
Deposits (abstract) ────────── IERC721Receiver, ReentrancyGuard
        ▲
        │ inherits
        │
SignatureVerification ───────── EIP712 (domain: name 'Lockx', version '5')
```

## Minting, Burning, and Key Rotation (Lockx)

Minting (external; non‑reentrant)
- `createLockboxWithETH(lockboxPublicKey, referenceId)` payable: mints, initializes key/referenceId, credits ETH.
- `createLockboxWithERC20(lockboxPublicKey, tokenAddress, amount, referenceId)`: mints + deposits ERC‑20.
- `createLockboxWithERC721(lockboxPublicKey, nftContract, externalNftTokenId, referenceId)`: mints + deposits one NFT.
- `createLockboxWithBatch(lockboxPublicKey, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds, referenceId)` payable: mints + multi‑asset deposit; disallows empty creation.

Key rotation
- `rotateLockboxKey(tokenId, signature, newPublicKey, referenceId, expiry)`: owner‑only; EIP‑712 signed by current key; rejects duplicate key.

Burn
- `burnLockbox(tokenId, signature, referenceId, expiry)`: owner‑only; EIP‑712; requires lockbox to be empty (no ETH, no ERC‑20s, no NFTs); clears accounting, burns NFT, purges auth.

## Events

- Deposits: `Deposited(tokenId, referenceId)`.
- Withdrawals: `Withdrawn(tokenId, referenceId)`.
- Swaps: `SwapExecuted(tokenId, referenceId)`.
- Metadata: `TokenMetadataURISet(tokenId, referenceId)`.
- Lifecycle: `Minted(tokenId, referenceId)`, `Locked(tokenId)`, `LockboxBurned(tokenId, referenceId)`, `KeyRotated(tokenId, referenceId)`.

## Errors (selection)

- Common: `ZeroAddress`, `ZeroAmount`, `MismatchedInputs`, `NotOwner`, `NonexistentToken`.
- Signature/expiry: `InvalidSignature`, `SignatureExpired`, `AlreadyInitialized`, `ZeroKey`, `InvalidReferenceId`.
- ERC‑721/Soulbound: `TransfersDisabled`, `FallbackNotAllowed`, `DirectETHTransferNotAllowed`, `LockboxNotEmpty`, `NoURI`, `DefaultURIAlreadySet`, `DuplicateKey`.
- Withdrawals/Accounting: `NoETHBalance`, `InsufficientTokenBalance`, `NFTNotFound`, `EthTransferFailed`, `InvalidRecipient`.
- Batch ordering: `UnsortedArray`, `DuplicateEntry`.
- Swaps: `UnauthorizedRouter`, `UnauthorizedSelector`, `InvalidSwap`, `RouterOverspent`, `SlippageExceeded`, `InsufficientOutput`.

## External/Public API (summary)

Lockx (ERC‑721 + composition)
- Mint: `createLockboxWithETH`, `createLockboxWithERC20`, `createLockboxWithERC721`, `createLockboxWithBatch`.
- Metadata: `setDefaultMetadataURI`, `setTokenMetadataURI`, `tokenURI`, `locked`.
- Key mgmt: `rotateLockboxKey`.
- Lifecycle: `burnLockbox`.
- Deposits: `depositETH`, `depositERC20`, `depositERC721`, `batchDeposit`.
- Withdrawals: `withdrawETH`, `withdrawERC20`, `withdrawERC721`, `batchWithdraw`.
- Swaps: `swapInLockbox`.
- Views: `getFullLockbox`, `getAllowedRouters`, `isAllowedRouter`, `getActiveLockboxPublicKeyForToken`, `getNonce`.

Access control & safety
- Ownership checks: most deposit/withdraw/view calls require `msg.sender` to be the ERC‑721 owner of `tokenId`.
- Signatures: state‑changing non‑mint flows require EIP‑712 signatures by the active key and include `referenceId` and `expiry`.
- Reentrancy: all deposit/withdraw/swap entry points are `nonReentrant`.
- Safe transfers: `SafeERC20` for ERC‑20; `safeTransferFrom` for NFTs.
- Direct ETH sends are rejected except from allowed routers while swapping.

## Storage Layout (core)

- SignatureVerification
  - `_erc721`: immutable pointer to ERC‑721 collection.
  - `_tokenAuth[tokenId] → { activeLockboxPublicKey, nonce, referenceId }`.
- Deposits/Withdrawals bookkeeping (per `tokenId`)
  - `_ethBalances[tokenId] → uint256`.
  - `_erc20Balances[tokenId][token] → uint256`.
  - `_erc20TokenAddresses[tokenId] → address[]`, `_erc20Index[tokenId][token] → uint256`.
  - `_lockboxNftData[tokenId][key] → { nftContract, nftTokenId }`.
  - `_nftKeys[tokenId] → bytes32[]`, `_nftIndex[tokenId][key] → uint256`.

## Dependencies & Tooling

- OpenZeppelin: `ERC721`, `Ownable`, `IERC20`, `IERC721`, `IERC721Receiver`, `SafeERC20`, `ReentrancyGuard`, `ECDSA`, `EIP712`.
- Linting/formatting: `solhint`, `prettier-plugin-solidity`.
- Build/test: Hardhat + Foundry. See `package.json` scripts.

## Operational Notes

- Rebasing tokens are not supported for deposits/swaps.
- Batch withdrawals require strictly sorted inputs to avoid duplicates and improve gas.
- Swap router and selector allowlists are immutable in code; extending them requires a new deployment.

## Router Selector Allowlist

These addresses/selectors are hard-coded and enforced at runtime. If a network uses different router addresses, swaps will revert.

Routers (Ethereum mainnet addresses):

| Router                         | Address                                      |
|--------------------------------|----------------------------------------------|
| Uniswap V3 SwapRouter02        | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Uniswap Universal Router       | `0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B` |
| 1inch Aggregation Router v6    | `0x111111125421cA6dc452d289314280a0f8842A65` |
| 0x Exchange Proxy              | `0xDef1C0ded9bec7F1a1670819833240f027b25EfF` |
| Paraswap Augustus              | `0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57` |
| CowSwap GPv2 Settlement        | `0x9008D19f58AAbD9eD0D60971565AA8510560ab41` |

Allowed function selectors (4‑byte):

| Router                      | Function                                 | Selector   |
|-----------------------------|------------------------------------------|------------|
| Uniswap V3                  | `exactInputSingle((...))`                | `0x04e45aaf` |
| Uniswap V3                  | `exactOutputSingle((...))`               | `0x5023b4df` |
| Uniswap V3                  | `exactInput(bytes)`                      | `0xc04b8d59` |
| Uniswap V3                  | `exactOutput(bytes)`                     | `0xf28c0498` |
| Uniswap Universal Router    | `execute(bytes,bytes[],uint256)`         | `0x3593564c` |
| Uniswap Universal Router    | `execute(bytes,bytes[])`                 | `0x24856bc3` |
| 1inch v6                    | `swap(address,(...),bytes)`              | `0x6b1ef56f` |
| 0x Exchange Proxy           | `transformERC20((...),(...))`            | `0x415565b0` |
| 0x Exchange Proxy           | `sellToUniswap((...),(...),(...))`       | `0xd9627aa4` |
| Paraswap Augustus           | `simpleSwap((...))`                      | `0x54e3f31b` |
| Paraswap Augustus           | `multiSwap((...))`                       | `0xa94e78ef` |
| CowSwap Settlement          | `settle((...))`                          | `0x13d79a0b` |

Helper views:
- `getAllowedRouters()` returns the above addresses in order.
- `isAllowedRouter(address)` checks membership.

## Usage Examples

Below snippets use ethers v6 and TypeScript. Replace addresses and IDs for your environment.

Setup (domain, types, enum mapping):

```ts
import { AbiCoder, keccak256 } from 'ethers';

const domain = {
  name: 'Lockx',
  version: '5',
  chainId: await provider.getNetwork().then(n => n.chainId),
  verifyingContract: lockx.target as string, // Lockx ERC-721 address
};

const types = {
  Operation: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'opType', type: 'uint8' },
    { name: 'dataHash', type: 'bytes32' },
  ],
} as const;

// Solidity enum OperationType mapping
const OperationType = {
  ROTATE_KEY: 0,
  WITHDRAW_ETH: 1,
  WITHDRAW_ERC20: 2,
  WITHDRAW_NFT: 3,
  BURN_LOCKBOX: 4,
  SET_TOKEN_URI: 5,
  BATCH_WITHDRAW: 6,
  SWAP_ASSETS: 7,
} as const;

// Get current nonce for the tokenId (owner-gated)
const nonce = await lockx.getNonce(tokenId);
```

Withdraw ETH (owner calls function; signature by active key):

```ts
const referenceId = '0x...'; // must match stored value set at mint
const signatureExpiry = Math.floor(Date.now()/1000) + 600; // 10 min

const data = AbiCoder.defaultAbiCoder().encode(
  ['uint256','address','bytes32','uint256'],
  [amountETH, recipient, referenceId, signatureExpiry]
);
const dataHash = keccak256(data);

const operation = { tokenId, nonce, opType: OperationType.WITHDRAW_ETH, dataHash };
const signature = await lockboxKeyWallet.signTypedData(domain, types as any, operation);

await lockx.connect(ownerEOA).withdrawETH(
  tokenId,
  signature,
  amountETH,
  recipient,
  referenceId,
  signatureExpiry
);
```

Withdraw ERC‑20:

```ts
const data20 = AbiCoder.defaultAbiCoder().encode(
  ['address','uint256','address','bytes32','uint256'],
  [tokenAddress, amount, recipient, referenceId, signatureExpiry]
);
const dataHash20 = keccak256(data20);
const sig20 = await lockboxKeyWallet.signTypedData(domain, types as any, {
  tokenId, nonce, opType: OperationType.WITHDRAW_ERC20, dataHash: dataHash20,
});

await lockx.connect(ownerEOA).withdrawERC20(
  tokenId, sig20, tokenAddress, amount, recipient, referenceId, signatureExpiry
);
```

Withdraw ERC‑721:

```ts
const data721 = AbiCoder.defaultAbiCoder().encode(
  ['address','uint256','address','bytes32','uint256'],
  [nftContract, nftTokenId, recipient, referenceId, signatureExpiry]
);
const sig721 = await lockboxKeyWallet.signTypedData(domain, types as any, {
  tokenId, nonce, opType: OperationType.WITHDRAW_NFT, dataHash: keccak256(data721),
});

await lockx.connect(ownerEOA).withdrawERC721(
  tokenId, sig721, nftContract, nftTokenId, recipient, referenceId, signatureExpiry
);
```

Batch withdraw (inputs must be strictly sorted; see contract docs):

```ts
const dataBatch = AbiCoder.defaultAbiCoder().encode(
  [
    'uint256',
    'address[]', 'uint256[]',
    'address[]', 'uint256[]',
    'address', 'bytes32', 'uint256',
  ],
  [ amountETH, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds, recipient, referenceId, signatureExpiry ]
);
const sigBatch = await lockboxKeyWallet.signTypedData(domain, types as any, {
  tokenId, nonce, opType: OperationType.BATCH_WITHDRAW, dataHash: keccak256(dataBatch),
});

await lockx.connect(ownerEOA).batchWithdraw(
  tokenId, sigBatch, amountETH,
  tokenAddresses, tokenAmounts,
  nftContracts, nftTokenIds,
  recipient, referenceId, signatureExpiry
);
```

Swap EXACT_IN via Uniswap V3 (example):

```ts
// Build router calldata (example: exactInputSingle)
const router = '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45'; // Uniswap V3 Router02
const swapIface = new ethers.Interface([
  'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))',
]);
const params = {
  tokenIn,
  tokenOut,
  fee: 3000,
  recipient: lockx.target, // output credited to contract; function will allocate to lockbox
  deadline: Math.floor(Date.now()/1000) + 600,
  amountIn: amountSpecified,
  amountOutMinimum: amountLimit, // min out
  sqrtPriceLimitX96: 0,
};
const swapData = swapIface.encodeFunctionData('exactInputSingle', [params]);

// Sign auth payload for swap
const swapMode = 0; // EXACT_IN
const authData = AbiCoder.defaultAbiCoder().encode(
  [
    'address','address','uint8','uint256','uint256','address','bytes32','bytes32','uint256','address'
  ],
  [
    tokenIn, tokenOut, swapMode,
    amountSpecified, amountLimit,
    router, keccak256(swapData),
    referenceId, signatureExpiry,
    ethers.ZeroAddress, // recipient=0 -> credit to lockbox
  ]
);
const sigSwap = await lockboxKeyWallet.signTypedData(domain, types as any, {
  tokenId, nonce, opType: OperationType.SWAP_ASSETS, dataHash: keccak256(authData),
});

await lockx.connect(ownerEOA).swapInLockbox(
  tokenId, sigSwap,
  tokenIn, tokenOut, swapMode,
  amountSpecified, amountLimit,
  router, swapData,
  referenceId, signatureExpiry,
  ethers.ZeroAddress // credit to lockbox
);
```

Deposits (owner‑only):

```ts
// ETH
await lockx.connect(ownerEOA).depositETH(tokenId, referenceId, { value: amountETH });

// ERC-20 (approve first)
await erc20.connect(ownerEOA).approve(lockx.target, amount);
await lockx.connect(ownerEOA).depositERC20(tokenId, erc20.target, amount, referenceId);

// ERC-721 (sender must own NFT)
await lockx.connect(ownerEOA).depositERC721(tokenId, nftContract, nftTokenId, referenceId);
```

Notes
- `msg.sender` must be the Lockbox NFT owner for deposits/withdrawals.
- The EIP‑712 signer must be the active lockbox key (`getActiveLockboxPublicKeyForToken`).
- Use the correct `nonce` from `getNonce(tokenId)` at the moment of signing.
- `referenceId` must match the per‑token value assigned at mint; otherwise calls revert.
