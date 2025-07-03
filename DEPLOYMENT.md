# 🚀 Lockx v2.0.0 Deployment Guide

This guide covers deploying Lockx smart contracts using both Remix IDE and Hardhat.

## 📋 Prerequisites

- MetaMask or other Web3 wallet
- Sufficient ETH for gas fees
- API keys (for Hardhat method)

---

## 🎨 Method 1: Remix IDE (Recommended for beginners)

### Step 1: Prepare Remix

1. Go to [remix.ethereum.org](https://remix.ethereum.org)
2. Create a new workspace or use default

### Step 2: Configure Compiler

1. Go to **Solidity Compiler** tab
2. Set **Compiler version**: `0.8.30`
3. Click **Advanced Configurations**
4. Set these settings:
   - ✅ **Enable optimization**: checked
   - **Runs**: `200`
   - ✅ **Enable viaIR**: checked
   - **EVM Version**: `paris`

### Step 3: Import Contracts

**Option A: Upload files**
1. Upload all files from `contracts/` folder
2. Remix will auto-resolve OpenZeppelin imports

**Option B: Copy-paste contracts**
1. Create `Lockx.sol` in Remix
2. Copy content from your `contracts/Lockx.sol`
3. Remix will prompt to install OpenZeppelin v5.3.0 - click Yes

### Step 4: Deploy

1. Go to **Deploy & Run** tab
2. Set **Environment**: `Injected Provider - MetaMask`
3. Connect your wallet
4. Select **Lockx** contract
5. Click **Deploy**
6. Confirm transaction in MetaMask

### Step 5: Verify (Optional)

1. Copy deployed contract address
2. Go to Etherscan
3. Use "Verify and Publish" with same compiler settings

---

## ⚡ Method 2: Hardhat (Recommended for developers)

### Step 1: Get API Keys

You need these API keys:

**🌐 RPC Provider (Choose one):**
- **Alchemy**: [alchemy.com](https://alchemy.com) → Create App → Copy API Key
- **Infura**: [infura.io](https://infura.io) → Create Project → Copy Project ID
- **QuickNode**: [quicknode.com](https://quicknode.com) → Create Endpoint

**📊 Etherscan API (for verification):**
- Go to [etherscan.io/apis](https://etherscan.io/apis)
- Create account → Generate API Key

### Step 2: Create Environment File

Create `.env` file in project root:

```bash
# 🌐 RPC URLs
SEPOLIA_RPC=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY
MAINNET_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/YOUR_API_KEY

# 🔑 Private Key (your deployer wallet)
PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE

# 📊 Etherscan API Key
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY

# 💰 Gas Reporting (optional)
REPORT_GAS=true
COINMARKETCAP_API_KEY=YOUR_COINMARKETCAP_API_KEY
```

### Step 3: Deploy to Testnet (Sepolia)

```bash
# Deploy to Sepolia testnet
npx hardhat run --network sepolia scripts/deploy.ts

# Verify contract (replace ADDRESS with deployed address)
npx hardhat verify --network sepolia ADDRESS
```

### Step 4: Deploy to Mainnet

```bash
# Deploy to Ethereum mainnet
npx hardhat run --network mainnet scripts/deploy.ts

# Verify contract
npx hardhat verify --network mainnet ADDRESS
```

---

## 🔧 Troubleshooting

### Remix Issues

**"Import not found"**: 
- Make sure OpenZeppelin v5.3.0 is installed
- Try refreshing Remix

**"Compilation failed"**:
- Check compiler version is exactly `0.8.30`
- Enable viaIR option
- Enable optimization with 200 runs

### Hardhat Issues

**"Invalid private key"**:
- Make sure private key starts with `0x`
- Don't include quotes around the key

**"Insufficient funds"**:
- Add ETH to your deployer wallet
- Check gas prices and adjust

**"Network not found"**:
- Verify RPC URL is correct
- Check API key is valid

---

## 💰 Estimated Gas Costs

| Network | Deployment Cost | Verification |
|---------|----------------|--------------|
| Sepolia | ~0.005 ETH | Free |
| Mainnet | ~0.02-0.05 ETH | Free |

**Note**: Costs vary with network congestion. Always test on Sepolia first!

---

## 🔒 Security Checklist

- [ ] Using dedicated deployer wallet (not main wallet)
- [ ] Private key is secure and not committed to git
- [ ] Tested deployment on Sepolia testnet
- [ ] Contract verified on Etherscan
- [ ] Double-checked contract address before sharing

---

## 📞 Need Help?

If you encounter issues:

1. Check the [troubleshooting section](#troubleshooting)
2. Review error messages carefully
3. Test on Sepolia first
4. Verify all API keys are correct

Your Lockx v2.0.0 contracts are production-ready with OpenZeppelin v5.3.0 security! 🎉 