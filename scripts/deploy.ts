import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log('🚀 Deploying Lockx v3.0.1 with OpenZeppelin v5...');
  console.log('Deployer address:', deployer.address);

  const balance = await deployer.provider!.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'ETH');

  if (balance < ethers.parseEther('0.01')) {
    console.warn('⚠️  Warning: Low balance! Make sure you have enough ETH for gas.');
  }

  console.log('\n📜 Contract deployment...');
  const Lockx = await ethers.getContractFactory('Lockx');
  const lockx = await Lockx.deploy();
  await lockx.waitForDeployment();

  const contractAddress = await lockx.getAddress();
  console.log('✅ Lockx deployed to:', contractAddress);

  console.log('\n🔍 Contract verification command:');
  console.log(
    `npx hardhat verify --network ${process.env.HARDHAT_NETWORK || 'localhost'} ${contractAddress}`
  );

  console.log('\n📋 Deployment Summary:');
  console.log('Contract: Lockx v3.0.1');
  console.log('Address:', contractAddress);
  console.log('Network:', process.env.HARDHAT_NETWORK || 'localhost');
  console.log('OpenZeppelin:', 'v5.3.0');
  console.log('EIP-712 Domain:', 'Lockx v2');

  console.log('\n🎉 Deployment complete! Your soul-bound NFT lockbox is ready.');
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exitCode = 1;
});
