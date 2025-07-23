import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { Signer } from 'ethers';

describe('Signature Expiry Coverage Tests', () => {
  let lockx: Lockx;
  let tokenA: MockERC20;
  let mockNft: MockERC721;
  let owner: Signer;
  let user: Signer;
  let lockboxKeyPair: { publicKey: string; privateKey: string };
  let tokenId: any;

  before(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy mock contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20Factory.deploy();
    await tokenA.initialize('TokenA', 'TKA');
    await tokenA.mint(await owner.getAddress(), ethers.parseEther('1000000'));

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721Factory.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');

    // Deploy main Lockx contract
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Generate lockbox key pair
    const wallet = ethers.Wallet.createRandom();
    lockboxKeyPair = {
      publicKey: wallet.address,
      privateKey: wallet.privateKey
    };

    // Create a lockbox
    const createTx = await lockx.connect(user).createLockboxWithETH(
      await user.getAddress(),
      lockboxKeyPair.publicKey,
      ethers.ZeroHash,
      { value: ethers.parseEther('2') }
    );
    const receipt = await createTx.wait();
    
    const transferEvent = receipt?.logs.find(
      log => lockx.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'Transfer'
    );
    const parsedEvent = lockx.interface.parseLog({
      topics: transferEvent?.topics as string[],
      data: transferEvent?.data || ''
    });
    tokenId = parsedEvent?.args.tokenId;

    // Setup some assets for testing
    await tokenA.connect(owner).transfer(await user.getAddress(), ethers.parseEther('1000'));
    await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    
    // Deposit some tokens (ETH was already deposited during creation)
    await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    
    // Mint and deposit an NFT
    await mockNft.mint(await user.getAddress(), 1);
    await mockNft.connect(user).approve(await lockx.getAddress(), 1);
    await lockx.connect(user).depositERC721(tokenId, await mockNft.getAddress(), 1, ethers.ZeroHash);
  });

  it('should hit signature expiry branch in withdrawERC20 (Line 1647)', async () => {
    const expiredTimestamp = 1; // Very old timestamp
    const messageHash = ethers.keccak256('0x1234');
    const signature = '0x' + '00'.repeat(65); // Dummy signature
    
    await expect(
      lockx.connect(user).withdrawERC20(
        tokenId, messageHash, signature,
        await tokenA.getAddress(), ethers.parseEther('10'), await user.getAddress(),
        ethers.ZeroHash, expiredTimestamp
      )
    ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
  });

  it('should hit signature expiry branch in withdrawERC721 (Line 1718)', async () => {
    const expiredTimestamp = 1; // Very old timestamp
    const messageHash = ethers.keccak256('0x1234');
    const signature = '0x' + '00'.repeat(65); // Dummy signature
    
    await expect(
      lockx.connect(user).withdrawERC721(
        tokenId, messageHash, signature,
        await mockNft.getAddress(), 1, await user.getAddress(),
        ethers.ZeroHash, expiredTimestamp
      )
    ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
  });

  it('should hit signature expiry branch in batchWithdraw (Line 1789)', async () => {
    const expiredTimestamp = 1; // Very old timestamp
    const messageHash = ethers.keccak256('0x1234');
    const signature = '0x' + '00'.repeat(65); // Dummy signature
    
    await expect(
      lockx.connect(user).batchWithdraw(
        tokenId, messageHash, signature,
        ethers.parseEther('0.1'), // amountETH
        [await tokenA.getAddress()], // tokenAddresses
        [ethers.parseEther('10')], // tokenAmounts
        [await mockNft.getAddress()], // nftContracts
        [1], // nftTokenIds
        await user.getAddress(), // recipient
        ethers.ZeroHash, // referenceId
        expiredTimestamp // signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
  });

});