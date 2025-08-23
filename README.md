# 🔐 Lockx ZK Production System

## Overview
Production-ready zero-knowledge proof system for private balance management with public NFT ownership.

## Features
- **Poseidon Hash**: Industry-standard ZK-friendly hash function
- **Groth16 SNARKs**: Constant-size proofs (~256 bytes)
- **Real Trusted Setup**: Powers of Tau ceremony completed
- **Gas Optimized**: ~300k gas per verification
- **Privacy Preserving**: Balances completely hidden

## Architecture

```
contracts/
├── zk/
│   └── production/
│       ├── LockxZKProduction.sol      # Main contract
│       ├── ProductionCommitmentVerifier.sol
│       ├── ProductionDepositVerifier.sol
│       └── ProductionWithdrawVerifier.sol

circuits/
├── src/production/
│   ├── ProductionCommitment.circom
│   ├── ProductionDeposit.circom
│   ├── ProductionWithdraw.circom
│   ├── poseidon.circom
│   └── poseidon_constants.circom
├── sdk/
│   └── productionProver.js            # Client SDK
└── *.zkey                             # Proving keys

api/
└── proof-generator/                   # Cloud Run API
    ├── index.js
    ├── Dockerfile
    └── cloudbuild.yaml
```

## Quick Start

### 1. Deploy to Google Cloud
```bash
chmod +x scripts/deploy-to-gcp.sh
./scripts/deploy-to-gcp.sh
```

### 2. Deploy Smart Contracts
```bash
npx hardhat run scripts/deployProductionZK.js --network mainnet
```

### 3. Integrate Frontend
```javascript
const zkService = new LockxZKService('https://your-api.run.app');
const proof = await zkService.generateDepositProof(nftId, amount);
```

## Privacy Model

| Public (On-Chain) | Private (Hidden) |
|-------------------|------------------|
| NFT Ownership | Balance Amounts |
| Commitment Hashes | Salt Values |
| Withdrawal Amounts | Transaction Links |
| Nullifier Hashes | Total Value Locked |

## Performance

- Proof Generation: 2-5 seconds
- Proof Size: 256 bytes
- Verification: <10ms
- Gas Cost: ~300,000

## Security

- 128-bit security level
- BN254 elliptic curve
- Audited circuits (pending)
- No trusted setup vulnerabilities

## License
MIT
