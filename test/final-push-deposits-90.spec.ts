import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockFeeOnTransferToken, RejectETH } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 FINAL PUSH DEPOSITS TO 90%+ BRANCHES', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockToken3: MockERC20;
  let mockNFT: MockERC721;
  let mockNFT2: MockERC721;
  let feeToken: MockFeeOnTransferToken;
  let rejectETH: RejectETH;
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
    mockToken2 = await MockERC20Factory.deploy();
    await mockToken2.initialize('Mock Token 2', 'MOCK2');
    mockToken3 = await MockERC20Factory.deploy();
    await mockToken3.initialize('Mock Token 3', 'MOCK3');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    mockNFT2 = await MockERC721Factory.deploy();
    await mockNFT2.initialize('Mock NFT 2', 'MNFT2');

    const MockFeeOnTransferTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await MockFeeOnTransferTokenFactory.deploy();
    await feeToken.initialize('Fee Token', 'FEE');

    const RejectETHFactory = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETHFactory.deploy();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await mockToken3.mint(user1.address, ethers.parseEther('10000'));
    await feeToken.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
      await mockNFT2.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken3.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockNFT2.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🔥 DEPOSITS BRANCH: Complex array management and removal patterns', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    const tokenId = 0;

    // Add multiple different tokens to test array growth
    await lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await mockToken2.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await mockToken3.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    
    // Add to existing tokens to test balance updates
    await lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('50'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await mockToken2.getAddress(), ethers.parseEther('25'), ethers.ZeroHash);
    
    // Add fee token to test received amount calculation
    await lockx.connect(user1).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    
    console.log('✅ Complex ERC20 array management branches hit');
  });

  it('🔥 DEPOSITS BRANCH: NFT array edge cases and duplicates', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.5') }
    );
    const tokenId = 0;

    // Add NFTs from different collections
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 1, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT2.getAddress(), 1, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT2.getAddress(), 2, ethers.ZeroHash);
    
    // Add more from first collection to test array management
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 3, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 4, ethers.ZeroHash);
    
    console.log('✅ NFT array edge cases and management branches hit');
  });

  it('🔥 DEPOSITS BRANCH: Batch deposit with all combinations', async () => {
    // Test 1: Batch with only ETH
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('2'),
      [],
      [],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('2') }
    );
    
    // Test 2: Batch with ETH + 1 token
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('1'),
      [await mockToken.getAddress()],
      [ethers.parseEther('100')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    
    // Test 3: Batch with ETH + multiple tokens
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('0.5'),
      [await mockToken.getAddress(), await mockToken2.getAddress()],
      [ethers.parseEther('50'), ethers.parseEther('75')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.5') }
    );
    
    // Test 4: Batch with everything
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('0.3'),
      [await mockToken.getAddress(), await feeToken.getAddress()],
      [ethers.parseEther('30'), ethers.parseEther('40')],
      [await mockNFT.getAddress(), await mockNFT2.getAddress()],
      [5, 3],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.3') }
    );
    
    console.log('✅ Batch deposit combination branches hit');
  });

  it('🔥 DEPOSITS BRANCH: onERC721Received with different data encodings', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    const tokenId = 0;

    // Test 1: safeTransferFrom with valid tokenId
    await mockNFT.connect(user1)['safeTransferFrom(address,address,uint256,bytes)'](
      user1.address,
      await lockx.getAddress(),
      6,
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [tokenId])
    );
    
    // Test 2: Another NFT via safeTransferFrom
    await mockNFT2.connect(user1)['safeTransferFrom(address,address,uint256,bytes)'](
      user1.address,
      await lockx.getAddress(),
      4,
      ethers.AbiCoder.defaultAbiCoder().encode(['uint256'], [tokenId])
    );
    
    console.log('✅ onERC721Received branches hit');
  });

  it('🔥 DEPOSITS BRANCH: _requireExists with all entry points', async () => {
    // Test all functions that call _requireExists with non-existent token
    const nonExistentId = 9999;
    
    await expect(
      lockx.connect(user1).depositETH(nonExistentId, ethers.ZeroHash, { value: ethers.parseEther('1') })
    ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    
    await expect(
      lockx.connect(user1).depositERC20(nonExistentId, await mockToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    
    await expect(
      lockx.connect(user1).depositERC721(nonExistentId, await mockNFT.getAddress(), 7, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    
    await expect(
      lockx.connect(user1).batchDeposit(
        nonExistentId,
        ethers.parseEther('0.1'),
        [],
        [],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      )
    ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    
    console.log('✅ _requireExists branches for all entry points hit');
  });

  it('🔥 DEPOSITS BRANCH: _requireOwnsLockbox with wrong owner', async () => {
    // Create lockbox owned by user1
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    const tokenId = 0;
    
    // Try to deposit from user2 (not owner)
    await expect(
      lockx.connect(user2).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('0.1') })
    ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    
    await expect(
      lockx.connect(user2).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('10'), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    
    console.log('✅ _requireOwnsLockbox branches hit');
  });

  it('🔥 DEPOSITS BRANCH: Fee-on-transfer token edge cases', async () => {
    // Create lockbox with fee token directly
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      lockboxKeyPair.address,
      await feeToken.getAddress(),
      ethers.parseEther('1000'),
      ethers.ZeroHash
    );
    const tokenId = 0;
    
    // Add more fee tokens multiple times
    await lockx.connect(user1).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('500'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('250'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('125'), ethers.ZeroHash);
    
    // Batch deposit with fee token
    await lockx.connect(user1).batchDeposit(
      tokenId,
      0,
      [await feeToken.getAddress()],
      [ethers.parseEther('100')],
      [],
      [],
      ethers.ZeroHash
    );
    
    console.log('✅ Fee-on-transfer edge cases hit');
  });

  it('🔥 DEPOSITS BRANCH: Zero amount and validation branches', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    const tokenId = 0;
    
    // Test zero ETH deposit
    await expect(
      lockx.connect(user1).depositETH(tokenId, ethers.ZeroHash, { value: 0 })
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    
    // Test zero token amount
    await expect(
      lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), 0, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    
    // Test zero address token
    await expect(
      lockx.connect(user1).depositERC20(tokenId, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    
    // Test zero address NFT
    await expect(
      lockx.connect(user1).depositERC721(tokenId, ethers.ZeroAddress, 1, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    
    console.log('✅ Zero amount and validation branches hit');
  });
});