import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 PHASE 11: FINAL BREAKTHROUGH - 86.78%+ TARGET!', () => {
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

    // Setup balances
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user1.address, 3);
    await mockNFT.mint(user1.address, 4);

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithETH', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithERC20', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroHash
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithERC721', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithBatch', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('0.5'), // amountETH
        [await mockToken.getAddress()], // tokenAddresses
        [ethers.parseEther('5')], // tokenAmounts
        [await mockNFT.getAddress()], // nftContracts
        [2], // nftTokenIds
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in burnLockbox', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
    const tokenId = parseInt(transferEvent.topics[3], 16);

    // Create a dummy signature for burnLockbox
    const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
    const dummySignature = ethers.toUtf8Bytes("dummy_signature_test");

    // This should hit the "else" (successful) path of the nonReentrant modifier
    // Even though signature will be invalid, we get past the reentrancy guard first
    await expect(
      lockx.connect(user1).burnLockbox(
        tokenId,
        messageHash,
        dummySignature,
        ethers.ZeroHash, // referenceId
        signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash'); // Gets past reentrancy guard, hits signature verification
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in rotateLockboxKey', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
    const tokenId = parseInt(transferEvent.topics[3], 16);

    // Create a dummy signature
    const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
    const dummySignature = ethers.toUtf8Bytes("dummy_signature_test");

    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).rotateLockboxKey(
        tokenId,
        messageHash,
        dummySignature,
        user2.address, // new key
        ethers.ZeroHash, // referenceId
        signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash'); // Gets past reentrancy guard, hits signature verification
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in setTokenMetadataURI', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
    const tokenId = parseInt(transferEvent.topics[3], 16);

    // Create a dummy signature
    const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
    const messageHash = ethers.keccak256(ethers.toUtf8Bytes('test'));
    const dummySignature = ethers.toUtf8Bytes("dummy_signature_test");

    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        messageHash,
        dummySignature,
        "https://example.com/metadata.json",
        ethers.ZeroHash, // referenceId
        signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash'); // Gets past reentrancy guard, hits signature verification
  });
});