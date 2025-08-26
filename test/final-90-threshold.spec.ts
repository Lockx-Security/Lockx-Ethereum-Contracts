import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 FINAL 90% THRESHOLD PUSH', () => {
  let lockx, mockToken, mockNft;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');
    await mockToken.mint(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');
    await mockNft.connect(owner).mint(user1.address, 1);
    await mockNft.connect(owner).mint(user1.address, 2);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 1);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 2);
  });

  it('should hit final branches to reach 90% threshold', async () => {
    // Test different edge cases that might hit additional branches

    // Test 1: Create empty lockbox and try operations
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );

    const tokenId = 0;

    // Test 2: Try to access nonce before any operations
    const initialNonce = await lockx.connect(user1).getNonce(tokenId);
    expect(initialNonce).to.equal(1); // Nonce starts at 1 after creation

    // Test 3: Check balance edge cases
    const balance = await lockx.balanceOf(user1.address);
    expect(balance).to.equal(1);

    // Test 4: Try tokenURI with valid token (no default URI set)
    await expect(
      lockx.tokenURI(tokenId)
    ).to.be.revertedWithCustomError(lockx, 'NoURI');

    // Test 5: Check owner functions
    await expect(lockx.connect(user1).setDefaultMetadataURI('test')).to.be.revertedWithCustomError(lockx, 'OwnableUnauthorizedAccount');

    // Test 6: Create lockbox with minimal ETH 
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.001') }
    );

    console.log('✅ THRESHOLD: Additional edge case branches tested');
  });

  it('should test additional deposit validation paths', async () => {
    // Create lockbox for testing additional deposit branches
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Test edge cases in deposit functions that might hit additional branches
    
    // Test small ETH deposit
    await lockx.connect(user1).depositETH(
      tokenId,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.0001') }
    );

    // Test small token deposit
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('0.001'));
    await lockx.connect(user1).depositERC20(
      tokenId,
      await mockToken.getAddress(),
      ethers.parseEther('0.001'),
      ethers.ZeroHash
    );

    console.log('✅ THRESHOLD: Additional deposit validation paths tested');
  });

  it('should test remaining interface branches', async () => {
    // Test additional interface IDs that might not be fully covered
    const additionalInterfaceIds = [
      '0x00000000', // Empty interface
      '0x01020304', // Random interface
      '0xabcdefab', // Another random interface
    ];

    for (const interfaceId of additionalInterfaceIds) {
      const result = await lockx.supportsInterface(interfaceId);
      expect(result).to.be.false;
    }

    // Test edge cases in ERC721 functions
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );

    const tokenId = 0;
    expect(await lockx.getApproved(tokenId)).to.equal(ethers.ZeroAddress);
    expect(await lockx.isApprovedForAll(user1.address, owner.address)).to.be.false;

    console.log('✅ THRESHOLD: Additional interface branches tested');
  });
});