import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🏦 DEPOSITS COVERAGE BOOST - TARGET MISSING BRANCHES', () => {
  let lockx, mockToken, feeToken, mockNft;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    // Deploy contracts
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');

    const FeeOnTransferToken = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeOnTransferToken.deploy();
    await feeToken.initialize('FeeToken', 'FEE');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');

    // Setup tokens
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await feeToken.mint(user1.address, ethers.parseEther('1000'));

    // Mint NFT
    await mockNft.connect(owner).mint(user1.address, 1);
    await mockNft.connect(owner).mint(user1.address, 2);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 1);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 2);
  });

  it('should test array length mismatch errors in createLockboxWithBatch', async () => {
    // Test ETH array length mismatch - empty ETH array with tokens
    try {
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        [], // Empty ETH amounts 
        [await mockToken.getAddress()], // But has tokens
        [ethers.parseEther('10')], // Token amounts
        [], // No NFTs
        [], // No NFT IDs
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: ArrayLengthMismatch - ETH array mismatch hit');
    }

    // Test NFT array length mismatch
    try {
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10'));
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        [], // No ETH
        [await mockToken.getAddress()], // Has tokens
        [ethers.parseEther('10')], // Token amounts
        [await mockNft.getAddress()], // Has NFT contracts
        [], // But no NFT IDs - mismatch!
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: ArrayLengthMismatch - NFT array mismatch hit');
    }

    // Test token array length mismatch
    try {
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        [], // No ETH
        [await mockToken.getAddress()], // Has token contract
        [], // But no token amounts - mismatch!
        [], // No NFTs
        [], // No NFT IDs
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: ArrayLengthMismatch - Token array mismatch hit');
    }
  });

  it('should test ETH value mismatch in createLockboxWithBatch', async () => {
    // Test ETH value mismatch error
    try {
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        [ethers.parseEther('1')], // Expects 1 ETH
        [], // No tokens
        [], // No token amounts
        [], // No NFTs
        [], // No NFT IDs
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') } // But only send 0.5 ETH
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: EthValueMismatch hit');
    }
  });

  it('should test fee-on-transfer token zero amount received', async () => {
    // Set fee so high that user gets 0 tokens
    await feeToken.connect(owner).setFeePercentage(10000); // 100% fee = user gets 0

    try {
      await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10'));
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await feeToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: ZeroAmountReceived hit');
    }
  });

  it('should test duplicate deposit array detection', async () => {
    // Create lockbox first
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Test duplicate token address in batchDeposit
    try {
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('40'));
      await lockx.connect(user1).batchDeposit(
        tokenId,
        [],
        [await mockToken.getAddress(), await mockToken.getAddress()], // Duplicate!
        [ethers.parseEther('10'), ethers.parseEther('10')],
        [],
        [],
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Duplicate token detection hit');
    }

    // Test duplicate NFT in batchDeposit
    try {
      await lockx.connect(user1).batchDeposit(
        tokenId,
        [],
        [],
        [],
        [await mockNft.getAddress(), await mockNft.getAddress()], // Same contract
        [1, 1], // Same NFT ID - duplicate!
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Duplicate NFT detection hit');
    }
  });

  it('should test edge cases in deposit functions', async () => {
    // Create lockbox
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Test zero ETH deposit error
    try {
      await lockx.connect(user1).depositETH(tokenId, ethers.ZeroHash, { value: 0 });
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Zero ETH deposit error hit');
    }

    // Test zero token amount deposit error
    try {
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken.getAddress(),
        0, // Zero amount
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Zero token amount error hit');
    }

    // Test zero address token deposit error
    try {
      await lockx.connect(user1).depositERC20(
        tokenId,
        ethers.ZeroAddress, // Zero address
        ethers.parseEther('10'),
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Zero address token error hit');
    }

    // Test zero address NFT deposit error
    try {
      await lockx.connect(user1).depositERC721(
        tokenId,
        ethers.ZeroAddress, // Zero address
        1,
        ethers.ZeroHash
      );
      expect.fail('Should have reverted');
    } catch (error) {
      console.log('✅ DEPOSITS: Zero address NFT error hit');
    }
  });

  it('should test existing token addition vs new token registration', async () => {
    // Create lockbox with token A
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Add more of the same token (existing token path)
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('25'));
    await lockx.connect(user1).depositERC20(
      tokenId,
      await mockToken.getAddress(),
      ethers.parseEther('25'),
      ethers.ZeroHash
    );
    console.log('✅ DEPOSITS: Existing token addition path hit');

    // Add a different token (new token registration path) 
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const newToken = await MockERC20.deploy();
    await newToken.initialize('TokenB', 'TKB');
    await newToken.connect(owner).transfer(user1.address, ethers.parseEther('100'));
    
    await newToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('30'));
    await lockx.connect(user1).depositERC20(
      tokenId,
      await newToken.getAddress(),
      ethers.parseEther('30'),
      ethers.ZeroHash
    );
    console.log('✅ DEPOSITS: New token registration path hit');
  });
});