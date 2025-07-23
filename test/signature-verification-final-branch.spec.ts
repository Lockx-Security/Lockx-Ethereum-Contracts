import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignatureVerificationHarness } from '../typechain-types';
import { Signer } from 'ethers';

describe('SignatureVerification Final Branch Coverage', () => {
  let harness: SignatureVerificationHarness;
  let owner: Signer;
  let user: Signer;

  before(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy the harness contract
    const HarnessFactory = await ethers.getContractFactory('SignatureVerificationHarness');
    harness = await HarnessFactory.deploy();
  });

  describe('🎯 AlreadyInitialized Branch Coverage', () => {
    it('should hit AlreadyInitialized error on double initialization (Line 81)', async () => {
      const tokenId = 1;
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      // First, mint a token
      await harness.mint(await user.getAddress(), tokenId);
      
      // Initialize it for the first time - should succeed
      await harness.testInitialize(tokenId, lockboxKey);
      
      // Try to initialize it again - should hit the AlreadyInitialized branch
      await expect(
        harness.testInitialize(tokenId, lockboxKey)
      ).to.be.revertedWithCustomError(harness, 'AlreadyInitialized');
    });

    it('should successfully initialize new tokens without error', async () => {
      const tokenId = 2;
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      // Mint a new token
      await harness.mint(await user.getAddress(), tokenId);
      
      // Initialize it for the first time - should succeed
      await expect(
        harness.testInitialize(tokenId, lockboxKey)
      ).to.not.be.reverted;
      
      // Simply verify the initialization succeeded (no error thrown)
    });
  });
});