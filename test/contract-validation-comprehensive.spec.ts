import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('📋 CONTRACT VALIDATION COMPREHENSIVE - Core Validation Tests', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockNFT: MockERC721;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let lockboxKeyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.initialize('Mock Token', 'MOCK');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances and approvals
    await mockToken.mint(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));

    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('📦 LOCKX.SOL - Easy Branch Wins', () => {
    it('🎯 Should hit DefaultURIAlreadySet error branch', async () => {
      // Set default URI once
      await lockx.connect(owner).setDefaultMetadataURI('https://api.lockx.io/metadata/');

      // Try to set it again - should hit the DefaultURIAlreadySet branch
      await expect(
        lockx.connect(owner).setDefaultMetadataURI('https://different.uri/')
      ).to.be.revertedWithCustomError(lockx, 'DefaultURIAlreadySet');
    });

    it('🎯 Should hit NoURI error in tokenURI when no metadata set', async () => {
      // Create a lockbox without any metadata set
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const tokenId = 0;

      // Try to get tokenURI - should hit NoURI branch
      await expect(lockx.tokenURI(tokenId)).to.be.revertedWithCustomError(lockx, 'NoURI');
    });

    it('🎯 Should hit NonexistentToken error in tokenURI', async () => {
      // Try to get tokenURI for non-existent token
      await expect(
        lockx.tokenURI(999) // Non-existent token ID
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('🎯 Should hit TransfersDisabled error in _update', async () => {
      // Create a lockbox first
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const tokenId = 0;

      // Try to transfer the lockbox (should be soulbound and fail)
      await expect(
        lockx.connect(user1).transferFrom(user1.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
    });

    it('🎯 Should handle different interfaceId checks in supportsInterface', async () => {
      // Test different interface IDs to hit various branches
      const ERC721InterfaceId = '0x80ac58cd';
      const ERC5192InterfaceId = '0xb45a3c0e';
      const IERC721ReceiverInterfaceId = '0x150b7a02';
      const UnsupportedInterfaceId = '0x12345678';

      // These should return true
      expect(await lockx.supportsInterface(ERC721InterfaceId)).to.be.true;
      expect(await lockx.supportsInterface(ERC5192InterfaceId)).to.be.true;
      expect(await lockx.supportsInterface(IERC721ReceiverInterfaceId)).to.be.true;

      // This should return false (hit the else branch)
      expect(await lockx.supportsInterface(UnsupportedInterfaceId)).to.be.false;
    });
  });

  describe('🔒 DEPOSITS.SOL - Easy Branch Wins', () => {
    it('🎯 Should hit different validation branches in deposits', async () => {
      // Create a lockbox first
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const tokenId = 0;

      // Test zero amount deposit
      await expect(
        lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test zero address token deposit
      await expect(
        lockx
          .connect(user1)
          .depositERC20(tokenId, ethers.ZeroAddress, ethers.parseEther('10'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      // Test zero address NFT contract deposit
      await expect(
        lockx.connect(user1).depositERC721(tokenId, ethers.ZeroAddress, 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('🎯 Should hit NonexistentToken error in deposits', async () => {
      // Try to deposit to non-existent lockbox
      await expect(
        lockx
          .connect(user1)
          .depositERC20(999, await mockToken.getAddress(), ethers.parseEther('10'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');

      await expect(
        lockx.connect(user1).depositERC721(999, await mockNFT.getAddress(), 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');

      await expect(
        lockx.connect(user1).depositETH(999, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('🎯 Should handle duplicate NFT deposit attempt', async () => {
      // Create a lockbox
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const tokenId = 0;

      // First deposit succeeds
      await lockx
        .connect(user1)
        .depositERC721(tokenId, await mockNFT.getAddress(), 1, ethers.ZeroHash);

      // Second deposit of same NFT should revert (already deposited)
      await expect(
        lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 1, ethers.ZeroHash)
      ).to.be.reverted; // Just check it reverts, don't care about specific error
    });
  });

  describe('💰 Array Validation Branches', () => {
    it('🎯 Should hit ArrayLengthMismatch branches in batch operations', async () => {
      // Test ERC20 array mismatch
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          0, // no ETH
          [await mockToken.getAddress()],
          [], // Empty amounts array - mismatch!
          [],
          [],
          ethers.ZeroHash,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Test NFT array mismatch
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          0,
          [],
          [],
          [await mockNFT.getAddress()],
          [], // Empty NFT token IDs array - mismatch!
          ethers.ZeroHash,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('🎯 Should hit EthValueMismatch branch', async () => {
      // Test ETH value mismatch
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('2'), // Expect 2 ETH
          [],
          [],
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('1') } // But send only 1 ETH - mismatch!
        )
      ).to.be.revertedWithCustomError(lockx, 'EthValueMismatch');
    });
  });

  describe('🛡 Security Validation Branches', () => {
    it('🎯 Should hit various zero validation branches', async () => {
      // SelfMintOnly - try to mint for different address
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user2.address, // Different address!
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      // ZeroKey - try to create with zero address key
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          ethers.ZeroAddress, // Zero address key!
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');

      // ZeroAmount - try to create with zero ETH
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: 0 } // Zero ETH!
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });
  });

  describe('✨ Successful Path Branches', () => {
    it('🎯 Should hit successful creation and metadata branches', async () => {
      // Set default metadata first
      await lockx.connect(owner).setDefaultMetadataURI('https://api.lockx.io/metadata/');

      // Create a lockbox successfully
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
            value: ethers.parseEther('1'),
          })
      ).to.emit(lockx, 'Minted'); // The actual event name

      const tokenId = 0;

      // Check that it uses default metadata (hits default branch in tokenURI)
      const uri = await lockx.tokenURI(tokenId);
      expect(uri).to.equal('https://api.lockx.io/metadata/0');

      // Verify ownership and locked status
      expect(await lockx.ownerOf(tokenId)).to.equal(user1.address);
      expect(await lockx.locked(tokenId)).to.be.true;
    });

    it('🎯 Should hit successful deposit branches with different token types', async () => {
      // Create a lockbox
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const tokenId = 0;

      // Successful ERC20 deposit (hits new token registration branch)
      await expect(
        lockx
          .connect(user1)
          .depositERC20(
            tokenId,
            await mockToken.getAddress(),
            ethers.parseEther('100'),
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Deposited');

      // Another ERC20 deposit to same token (hits existing token branch)
      await expect(
        lockx
          .connect(user1)
          .depositERC20(
            tokenId,
            await mockToken.getAddress(),
            ethers.parseEther('50'),
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Deposited');

      // Successful NFT deposit
      await expect(
        lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 1, ethers.ZeroHash)
      ).to.emit(lockx, 'Deposited');

      // Successful ETH deposit
      await expect(
        lockx
          .connect(user1)
          .depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('0.5') })
      ).to.emit(lockx, 'Deposited');
    });
  });
});
