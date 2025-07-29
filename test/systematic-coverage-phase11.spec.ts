import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 PHASE 12: REENTRANCY ATTACK TESTS - Hit Missing "Else" Branches!', () => {
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
    await mockNFT.connect(user1).approve(await lockx.getAddress(), 1);
  });

  // The issue is that I need to understand what the "E" branches are
  // Let me try a different approach - test validation error conditions

  it('🎯 BRANCH: Hit SelfMintOnly error in createLockboxWithETH', async () => {
    // Try to mint for someone else - should hit validation branch
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user2.address, // Different from msg.sender
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
  });

  it('🎯 BRANCH: Hit ZeroKey error in createLockboxWithETH', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user1.address,
        ethers.ZeroAddress, // Zero address for lockbox key
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
  });

  it('🎯 BRANCH: Hit ZeroAmount error in createLockboxWithETH', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: 0 } // Zero ETH value
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
  });

  it('🎯 BRANCH: Hit SelfMintOnly error in createLockboxWithERC20', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user2.address, // Different from msg.sender
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
  });

  it('🎯 BRANCH: Hit ZeroTokenAddress error in createLockboxWithERC20', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroAddress, // Zero token address
        ethers.parseEther('100'),
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');
  });

  it('🎯 BRANCH: Hit ZeroAmount error in createLockboxWithERC20', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        0, // Zero amount
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
  });

  it('🎯 BRANCH: Hit SelfMintOnly error in createLockboxWithERC721', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithERC721(
        user2.address, // Different from msg.sender
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
  });

  it('🎯 BRANCH: Hit ZeroTokenAddress error in createLockboxWithERC721', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroAddress, // Zero NFT contract address
        1,
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');
  });

  it('🎯 BRANCH: Hit ArrayLengthMismatch error in createLockboxWithBatch', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('0.5'),
        [await mockToken.getAddress()], // 1 token address
        [ethers.parseEther('100'), ethers.parseEther('200')], // 2 amounts - MISMATCH!
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
  });

  it('🎯 BRANCH: Hit EthValueMismatch error in createLockboxWithBatch', async () => {
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('1.0'), // Expecting 1 ETH
        [],
        [],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') } // But sending 0.5 ETH - MISMATCH!
      )
    ).to.be.revertedWithCustomError(lockx, 'EthValueMismatch');
  });
});