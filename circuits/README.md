# Lockx ZK Circuits

Zero-knowledge proof circuits for the Lockx privacy system.

## Prerequisites

1. Install Node.js 16+
2. Install Rust (for circom compilation)
3. Install circom and snarkjs globally:

```bash
npm install -g circom snarkjs
```

## Setup

1. Install dependencies:
```bash
npm install
```

2. Download Powers of Tau trusted setup:
```bash
npm run download:ptau
```

3. Compile all circuits:
```bash
npm run compile:all
```

4. Generate proving keys:
```bash
npm run setup:deposit
npm run setup:withdraw
npm run setup:transfer
```

5. Contribute to the ceremony (optional but recommended):
```bash
npm run contribute:deposit
npm run contribute:withdraw
npm run contribute:transfer
```

6. Export Solidity verifiers:
```bash
npm run export:all
```

## Circuit Descriptions

### Deposit Circuit
- **Purpose**: Prove valid deposit to a hidden NFT
- **Public inputs**: depositAmount, newCommitment, depositorAddress, merkleRoot
- **Private inputs**: nftId, currentBalance, salt, merkle proof
- **Constraints**: ~5,000

### Withdraw Circuit
- **Purpose**: Prove authorization to withdraw without revealing source NFT
- **Public inputs**: withdrawalRoot, nullifierHash, recipient, amount
- **Private inputs**: nftId, balance, salt, nullifier, merkle proof
- **Constraints**: ~6,000

### Transfer Circuit
- **Purpose**: Prove valid transfer between owned NFTs
- **Public inputs**: oldStateRoot, newStateRoot, transferTimestamp
- **Private inputs**: fromNftId, toNftId, balances, transferAmount, salt
- **Constraints**: ~3,000

## Testing

Run circuit tests:
```bash
npm test
```

## Gas Costs

Approximate verification costs on Ethereum:
- Deposit proof: ~200k gas
- Withdraw proof: ~280k gas
- Transfer proof: ~180k gas

## Security Notes

1. **Trusted Setup**: The Powers of Tau ceremony must be secure
2. **Random Salt**: Always use cryptographically secure randomness
3. **Nullifiers**: Store used nullifiers to prevent double-spending
4. **Commitments**: Never reuse commitments across operations

## Production Checklist

- [ ] Complete trusted setup ceremony with multiple participants
- [ ] Audit circuits by qualified cryptographers
- [ ] Test with mainnet fork
- [ ] Implement backup/recovery for user secrets
- [ ] Add monitoring for proof generation failures
- [ ] Set up redundant proof generation servers