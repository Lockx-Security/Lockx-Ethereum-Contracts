import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 BRANCH COVERAGE PHASE 5 - WORKING TESTS', () => {
  let lockx, mockToken, mockTokenB, mockNFT, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TB');
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Mint NFTs
    await mockNFT.mint(owner.address, 1);
    
    // Fund accounts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
  });

  describe('🎯 WORKING BRANCH TESTS - 3 More Branches', () => {
    
    it('🎯 BRANCH: Hit SelfMintOnly error in createLockboxWithBatch (fixed)', async () => {
      // Try to mint batch for different address with correct function signature
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          user1.address, // to = user1 (but msg.sender = owner)
          lockboxKeyPair.address, // lockboxPublicKey
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress()], // tokenAddresses
          [ethers.parseEther('10')], // tokenAmounts
          [await mockNFT.getAddress()], // nftContracts
          [1], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
    });

    it('🎯 BRANCH: Hit ZeroKey error in createLockboxWithBatch (fixed)', async () => {
      // Try to create batch lockbox with zero address key
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address, // to = owner
          ethers.ZeroAddress, // Zero address key
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress()], // tokenAddresses
          [ethers.parseEther('10')], // tokenAmounts
          [await mockNFT.getAddress()], // nftContracts
          [1], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('🎯 BRANCH: Hit array mismatch error in createLockboxWithBatch', async () => {
      // Try to create batch lockbox with mismatched arrays
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address, // to
          lockboxKeyPair.address, // lockboxPublicKey
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress()], // tokenAddresses - 1 address
          [ethers.parseEther('10'), ethers.parseEther('20')], // tokenAmounts - 2 amounts (MISMATCH!)
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('🎯 BRANCH: Hit zero token address error in createLockboxWithBatch', async () => {
      // Try to create batch lockbox with zero address token
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address, // to
          lockboxKeyPair.address, // lockboxPublicKey
          ethers.parseEther('1'), // amountETH
          [ethers.ZeroAddress], // tokenAddresses - zero address token
          [ethers.parseEther('10')], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.reverted; // Generic revert check
    });

    it('🎯 BRANCH: Hit zero amount error in createLockboxWithBatch', async () => {
      // Try to create batch lockbox with zero token amount
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address, // to
          lockboxKeyPair.address, // lockboxPublicKey
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress()], // tokenAddresses
          [0], // tokenAmounts - zero amount
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

  });

});