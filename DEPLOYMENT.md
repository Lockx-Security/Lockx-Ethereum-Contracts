# 🚀 Lockx v3.0.1 Deployment Guide

## Prerequisites

- MetaMask wallet
- ETH for gas fees
- API keys (for Hardhat method)

---

## Method 1: Remix IDE (Beginners)

### Setup

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Upload the `contracts/` folder from this repo

### Compile

1. **Solidity Compiler** tab
2. Set version: `0.8.30`
3. **Advanced Configurations**:
   - ✅ Enable optimization (10000 runs)
   - ✅ Enable viaIR
4. Compile `Lockx.sol`

### Deploy

1. **Deploy & Run** tab
2. Environment: `Injected Provider - MetaMask`
3. Select `Lockx` contract
4. Click **Deploy**
5. Confirm in MetaMask

### Verify

1. Copy contract address
2. Go to [Etherscan](https://etherscan.io)
3. **Contract** → **Verify and Publish**
4. Use same compiler settings

---

## Method 2: Hardhat (Developers)

### Environment Setup

Create `.env` file:

```bash
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY
PRIVATE_KEY=0xYOUR_PRIVATE_KEY
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

### Deploy

```bash
# Install dependencies
npm install

# Test on Sepolia first
npx hardhat run scripts/deploy.ts --network sepolia
npx hardhat verify --network sepolia CONTRACT_ADDRESS

# Deploy to mainnet
npx hardhat run scripts/deploy.ts --network mainnet
npx hardhat verify --network mainnet CONTRACT_ADDRESS
```

---

## API Keys

**Alchemy**: [alchemy.com](https://alchemy.com) → Create App → Copy API Key  
**Etherscan**: [etherscan.io/apis](https://etherscan.io/apis) → Generate API Key

---

## Gas Costs

| Network | Cost           |
| ------- | -------------- |
| Sepolia | ~0.005 ETH     |
| Mainnet | ~0.02-0.08 ETH |

---

## Troubleshooting

**Remix compilation fails**: Enable viaIR in advanced settings  
**Hardhat network error**: Check RPC URL and API key  
**Insufficient funds**: Add ETH to deployer wallet  
**Verification fails**: Wait 2-3 minutes after deployment, then retry

---

## Security

- ✅ Test on Sepolia first
- ✅ Use dedicated deployer wallet
- ✅ Never commit private keys to git
- ✅ Verify contract on Etherscan

Your Lockx v3.0.1 contract is ready! 🎉
