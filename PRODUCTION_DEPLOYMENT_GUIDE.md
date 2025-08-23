# 🚀 Production Deployment Guide for Lockx ZK System

## Overview
You need both **on-chain** (smart contracts) and **off-chain** (backend services) infrastructure for production.

## 🎯 What Needs to Be Deployed

### 1. On-Chain (Ethereum/L2)
- ✅ Smart contracts (already built)
- ✅ Verifier contracts (already generated)

### 2. Off-Chain (Google Cloud)
- 🔨 Proof Generation API
- 🔨 Circuit hosting (WASM + zkey files)
- 🔨 Commitment tracking service
- 🔨 Frontend hosting

## 📦 Backend Services You Need on Google Cloud

### Service 1: Proof Generation API
**Purpose**: Generate ZK proofs for users (since it's computationally intensive)

```yaml
Service: Cloud Run or App Engine
Memory: 4-8 GB (proof generation is memory intensive)
CPU: 2-4 cores
Storage: 100 MB for circuits
```

### Service 2: Circuit File CDN
**Purpose**: Serve WASM and zkey files to clients

```yaml
Service: Cloud Storage + Cloud CDN
Files to host:
  - ProductionCommitment.wasm (~5 MB)
  - commitment_final.zkey (~0.11 MB)
  - ProductionDeposit.wasm (~10 MB)
  - deposit_final.zkey (~0.38 MB)
  - ProductionWithdraw.wasm (~10 MB)
  - withdraw_final.zkey (~0.53 MB)
```

### Service 3: Commitment Indexer
**Purpose**: Track commitments and nullifiers for faster queries

```yaml
Service: Cloud Functions + Firestore
Database: Firestore or Cloud SQL
Purpose: Index all commitments and nullifiers from blockchain
```

## 🏗️ Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         USER BROWSER                         │
├─────────────────────────────────────────────────────────────┤
│  1. User enters private data (balance, salt, etc.)          │
│  2. Calls Proof Generation API                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD PLATFORM                     │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          Proof Generation API (Cloud Run)            │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  - Receives private inputs                           │   │
│  │  - Loads WASM circuits                              │   │
│  │  - Generates Groth16 proofs                         │   │
│  │  - Returns proof + public signals                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │        Circuit CDN (Cloud Storage + CDN)            │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  - Hosts WASM files                                 │   │
│  │  - Hosts zkey files                                 │   │
│  │  - Global CDN distribution                          │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │     Commitment Indexer (Cloud Functions)            │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │  - Listens to blockchain events                     │   │
│  │  - Indexes commitments in Firestore                 │   │
│  │  - Tracks nullifiers                                │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    ETHEREUM BLOCKCHAIN                       │
├─────────────────────────────────────────────────────────────┤
│  - LockxZKProduction.sol                                    │
│  - ProductionCommitmentVerifier.sol                         │
│  - ProductionDepositVerifier.sol                            │
│  - ProductionWithdrawVerifier.sol                           │
└─────────────────────────────────────────────────────────────┘
```

## 🛠️ Step-by-Step Deployment

### Step 1: Prepare Circuit Files
```bash
# Compile circuits with WASM output
cd circuits
npx circom src/production/ProductionCommitment.circom --r1cs --wasm
npx circom src/production/ProductionDeposit.circom --r1cs --wasm
npx circom src/production/ProductionWithdraw.circom --r1cs --wasm

# Upload to Google Cloud Storage
gsutil mb gs://lockx-zk-circuits
gsutil cp -r ProductionCommitment_js/* gs://lockx-zk-circuits/commitment/
gsutil cp -r ProductionDeposit_js/* gs://lockx-zk-circuits/deposit/
gsutil cp -r ProductionWithdraw_js/* gs://lockx-zk-circuits/withdraw/
gsutil cp *.zkey gs://lockx-zk-circuits/keys/

# Enable public access
gsutil iam ch allUsers:objectViewer gs://lockx-zk-circuits
```

### Step 2: Deploy Proof Generation API
```javascript
// api/proof-generator/index.js
const express = require('express');
const snarkjs = require('snarkjs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Load circuits from Cloud Storage
const CIRCUIT_BUCKET = 'gs://lockx-zk-circuits';

app.post('/api/generate-proof', async (req, res) => {
    try {
        const { circuitType, inputs } = req.body;
        
        // Validate inputs
        if (!['commitment', 'deposit', 'withdraw'].includes(circuitType)) {
            return res.status(400).json({ error: 'Invalid circuit type' });
        }
        
        // Load circuit files
        const wasmPath = `${CIRCUIT_BUCKET}/${circuitType}/${circuitType}.wasm`;
        const zkeyPath = `${CIRCUIT_BUCKET}/keys/${circuitType}_final.zkey`;
        
        // Generate proof
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            wasmPath,
            zkeyPath
        );
        
        // Format for Solidity
        const solidityProof = formatProofForSolidity(proof);
        
        res.json({
            proof: solidityProof,
            publicSignals,
            success: true
        });
        
    } catch (error) {
        console.error('Proof generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate proof',
            details: error.message 
        });
    }
});

function formatProofForSolidity(proof) {
    return {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [[proof.pi_b[0][1], proof.pi_b[0][0]], 
            [proof.pi_b[1][1], proof.pi_b[1][0]]],
        c: [proof.pi_c[0], proof.pi_c[1]]
    };
}

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`Proof Generation API running on port ${PORT}`);
});
```

### Step 3: Deploy to Cloud Run
```yaml
# cloudbuild.yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build', '-t', 'gcr.io/$PROJECT_ID/proof-generator', '.']
  
  - name: 'gcr.io/cloud-builders/docker'
    args: ['push', 'gcr.io/$PROJECT_ID/proof-generator']
  
  - name: 'gcr.io/cloud-builders/gcloud'
    args:
      - 'run'
      - 'deploy'
      - 'proof-generator'
      - '--image=gcr.io/$PROJECT_ID/proof-generator'
      - '--platform=managed'
      - '--region=us-central1'
      - '--memory=8Gi'
      - '--cpu=4'
      - '--timeout=60'
      - '--allow-unauthenticated'
```

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 8080
CMD ["node", "index.js"]
```

### Step 4: Deploy Commitment Indexer
```javascript
// functions/commitment-indexer/index.js
const functions = require('@google-cloud/functions-framework');
const { Firestore } = require('@google-cloud/firestore');
const { ethers } = require('ethers');

const db = new Firestore();
const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

// Contract ABI (minimal)
const LOCKX_ABI = [
    "event CommitmentAdded(bytes32 indexed commitment, uint256 timestamp)",
    "event NullifierUsed(bytes32 indexed nullifier, uint256 timestamp)"
];

const contract = new ethers.Contract(
    process.env.LOCKX_CONTRACT_ADDRESS,
    LOCKX_ABI,
    provider
);

functions.cloudEvent('indexCommitments', async (cloudEvent) => {
    // Listen to new blocks
    provider.on('block', async (blockNumber) => {
        const events = await contract.queryFilter('CommitmentAdded', blockNumber, blockNumber);
        
        for (const event of events) {
            await db.collection('commitments').doc(event.args.commitment).set({
                commitment: event.args.commitment,
                blockNumber: event.blockNumber,
                timestamp: event.args.timestamp,
                transactionHash: event.transactionHash
            });
        }
    });
    
    // Index nullifiers
    contract.on('NullifierUsed', async (nullifier, timestamp, event) => {
        await db.collection('nullifiers').doc(nullifier).set({
            nullifier,
            timestamp,
            blockNumber: event.blockNumber,
            transactionHash: event.transactionHash,
            used: true
        });
    });
});
```

### Step 5: Frontend Integration
```javascript
// frontend/src/services/zkProof.js
class ZKProofService {
    constructor() {
        this.apiUrl = 'https://proof-generator-xxxxx-uc.a.run.app';
    }
    
    async generateCommitmentProof(balance, nftId, salt) {
        const commitment = this.poseidonHash([balance, nftId, salt]);
        
        const response = await fetch(`${this.apiUrl}/api/generate-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                circuitType: 'commitment',
                inputs: {
                    commitment: commitment.toString(),
                    balance: balance.toString(),
                    nftId: nftId.toString(),
                    salt: salt.toString()
                }
            })
        });
        
        const result = await response.json();
        return result.proof;
    }
    
    async generateDepositProof(nftId, oldBalance, depositAmount, salt) {
        // Similar implementation
    }
    
    async generateWithdrawProof(balance, nftId, salt, nullifier, recipient, amount) {
        // Similar implementation
    }
}
```

## 💰 Cost Estimates (Google Cloud)

### Monthly Costs:
- **Cloud Run (Proof API)**: ~$50-200 (depends on usage)
- **Cloud Storage**: ~$5 (circuit files)
- **Cloud CDN**: ~$10-50 (bandwidth)
- **Firestore**: ~$20-100 (commitment indexing)
- **Cloud Functions**: ~$10-30 (event indexing)

**Total: ~$95-385/month** for moderate usage

## 🔒 Security Considerations

1. **API Rate Limiting**: Prevent proof generation DoS
```javascript
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // limit each IP to 10 requests per window
});
app.use('/api/generate-proof', limiter);
```

2. **Input Validation**: Validate all inputs before proof generation
3. **CORS Configuration**: Only allow your frontend domain
4. **API Authentication**: Consider adding API keys for production
5. **Circuit File Integrity**: Use checksums to verify circuit files

## 🚦 Environment Variables

```env
# .env.production
RPC_URL=https://mainnet.infura.io/v3/YOUR_KEY
LOCKX_CONTRACT_ADDRESS=0x...
GOOGLE_CLOUD_PROJECT=your-project-id
CIRCUIT_BUCKET=gs://lockx-zk-circuits
PORT=8080
```

## 📊 Monitoring & Analytics

```yaml
# monitoring.yaml
monitoring:
  - metric: proof_generation_time
    alert: > 10 seconds
  
  - metric: proof_generation_errors
    alert: > 5 per minute
  
  - metric: api_response_time
    alert: > 2 seconds
  
  - metric: memory_usage
    alert: > 80%
```

## 🎯 Deployment Checklist

### Pre-Deployment:
- [ ] Audit smart contracts
- [ ] Test proof generation with production circuits
- [ ] Load test the API
- [ ] Set up monitoring
- [ ] Configure backups

### Deployment:
- [ ] Deploy contracts to mainnet
- [ ] Upload circuits to Cloud Storage
- [ ] Deploy Proof Generation API
- [ ] Deploy Commitment Indexer
- [ ] Configure CDN
- [ ] Test end-to-end flow

### Post-Deployment:
- [ ] Monitor gas usage
- [ ] Track proof generation times
- [ ] Monitor API performance
- [ ] Set up alerts
- [ ] Document API endpoints

## 📝 API Endpoints

### Production Endpoints:
```
POST https://api.lockx.io/generate-proof
GET  https://api.lockx.io/commitment/:hash
GET  https://api.lockx.io/nullifier/:hash
GET  https://cdn.lockx.io/circuits/commitment.wasm
GET  https://cdn.lockx.io/circuits/commitment.zkey
```

## 🔄 Continuous Deployment

```yaml
# .github/workflows/deploy.yml
name: Deploy to Google Cloud
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - id: 'auth'
        uses: 'google-github-actions/auth@v1'
        with:
          credentials_json: '${{ secrets.GCP_SA_KEY }}'
      
      - name: 'Deploy to Cloud Run'
        run: |
          gcloud run deploy proof-generator \
            --source . \
            --region us-central1 \
            --memory 8Gi \
            --cpu 4
```

## 🎉 Ready for Production!

With this setup, your ZK system will be fully production-ready with:
- ✅ Scalable proof generation
- ✅ Global CDN distribution
- ✅ Real-time commitment indexing
- ✅ High availability
- ✅ Monitoring and alerts

The system can handle thousands of users generating proofs simultaneously!