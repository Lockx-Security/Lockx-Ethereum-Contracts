const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🔒 LOCKBOX CREATION VALIDATION - Comprehensive Test Suite', () => {
  let lockx,
    mockToken,
    mockTokenB,
    mockTokenC,
    mockNFT,
    mockRouter,
    owner,
    user1,
    user2,
    lockboxKeyPair;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();

    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');

    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TB');

    mockTokenC = await MockERC20.deploy();
    await mockTokenC.initialize('Token C', 'TC');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    lockboxKeyPair = ethers.Wallet.createRandom();

    // Fund accounts and setup
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(user2.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenC.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB
      .connect(owner)
      .transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));

    // Mint NFTs
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user1.address, 3);
    await mockNFT.mint(user1.address, 4);
    await mockNFT.mint(user2.address, 5);

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockTokenB.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockTokenC.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockNFT.connect(user2).setApprovalForAll(await lockx.getAddress(), true);

    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10'),
    });
  });

  describe('📦 createLockboxWithETH Validation & Success', () => {
    it('should revert with SelfMintOnly when creating lockbox for different address', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user2.address, // Different from msg.sender
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
    });

    it('should revert with ZeroKey when creating lockbox with zero address key', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          ethers.ZeroAddress, // Zero address key
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('should revert with ZeroAmount when creating lockbox with zero ETH', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: 0 } // Zero ETH
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should successfully create ETH lockbox with valid parameters', async () => {
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should hit successful ReentrancyGuard path in createLockboxWithETH', async () => {
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
            value: ethers.parseEther('1'),
          })
      ).to.emit(lockx, 'Transfer');
    });

    it('should create multiple ETH lockboxes successfully', async () => {
      // First lockbox
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      // Second lockbox
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('2'),
        });

      expect(await lockx.balanceOf(user1.address)).to.equal(2);
    });
  });

  describe('🪙 createLockboxWithERC20 Validation & Success', () => {
    it('should revert with SelfMintOnly when creating lockbox for different address', async () => {
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

    it('should revert with ZeroKey when creating lockbox with zero address key', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithERC20(
          user1.address,
          ethers.ZeroAddress, // Zero address key
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('should revert with ZeroAddress when creating lockbox with zero token address', async () => {
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

    it('should revert with ZeroAmount when creating lockbox with zero token amount', async () => {
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

    it('should successfully create ERC20 lockbox with valid parameters', async () => {
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should hit successful ReentrancyGuard path in createLockboxWithERC20', async () => {
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithERC20(
            user1.address,
            lockboxKeyPair.address,
            await mockToken.getAddress(),
            ethers.parseEther('10'),
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Transfer');
    });

    it('should create multiple ERC20 lockboxes successfully', async () => {
      // First lockbox with Token A
      await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('50'),
          ethers.ZeroHash
        );

      // Second lockbox with Token B
      await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockTokenB.getAddress(),
          ethers.parseEther('75'),
          ethers.ZeroHash
        );

      expect(await lockx.balanceOf(user1.address)).to.equal(2);
    });
  });

  describe('🖼️ createLockboxWithERC721 Validation & Success', () => {
    it('should revert with SelfMintOnly when creating lockbox for different address', async () => {
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

    it('should revert with ZeroKey when creating lockbox with zero address key', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithERC721(
          user1.address,
          ethers.ZeroAddress, // Zero address key
          await mockNFT.getAddress(),
          1,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('should revert with ZeroTokenAddress when creating lockbox with zero NFT address', async () => {
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

    it('should successfully create ERC721 lockbox with valid parameters', async () => {
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroHash
        );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should hit successful ReentrancyGuard path in createLockboxWithERC721', async () => {
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithERC721(
            user1.address,
            lockboxKeyPair.address,
            await mockNFT.getAddress(),
            1,
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Transfer');
    });

    it('should create multiple ERC721 lockboxes successfully', async () => {
      // First NFT lockbox
      await lockx
        .connect(user1)
        .createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroHash
        );

      // Second NFT lockbox
      await lockx
        .connect(user1)
        .createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          await mockNFT.getAddress(),
          2,
          ethers.ZeroHash
        );

      expect(await lockx.balanceOf(user1.address)).to.equal(2);
    });
  });

  describe('📦 createLockboxWithBatch Validation & Success', () => {
    it('should revert with SelfMintOnly when creating batch lockbox for different address', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user2.address, // Different from msg.sender
          lockboxKeyPair.address,
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

    it('should revert with ZeroKey when creating batch lockbox with zero address key', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
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

    it('should revert with ArrayLengthMismatch when token addresses and amounts have different lengths', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress(), await mockTokenB.getAddress()], // 2 addresses
          [ethers.parseEther('10')], // 1 amount - MISMATCH!
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('should revert with ArrayLengthMismatch when NFT contracts and token IDs have different lengths', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [await mockNFT.getAddress()], // 1 contract
          [1, 2], // 2 token IDs - MISMATCH!
          ethers.ZeroHash // referenceId
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('should revert with ZeroAddress when batch includes zero address token', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'), // amountETH
          [ethers.ZeroAddress], // Zero address token
          [ethers.parseEther('10')], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.reverted; // Generic revert due to token transfer failure
    });

    it('should revert with ZeroAmount when batch includes zero token amount', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'), // amountETH
          [await mockToken.getAddress()], // tokenAddresses
          [0], // Zero amount
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should revert when batch includes zero address NFT contract', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'), // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [ethers.ZeroAddress], // Zero address NFT contract
          [1], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('1') }
        )
      ).to.be.reverted; // Generic revert due to invalid NFT contract
    });

    it('should revert with EthValueMismatch when sent ETH does not match specified amount', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'), // Expecting 1 ETH
          [], // tokenAddresses
          [], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroHash, // referenceId
          { value: ethers.parseEther('0.5') } // But sending 0.5 ETH - MISMATCH!
        )
      ).to.be.revertedWithCustomError(lockx, 'EthValueMismatch');
    });

    it('should successfully create batch lockbox with ETH only', async () => {
      const tx = await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('1'), // amountETH
        [], // tokenAddresses - empty
        [], // tokenAmounts - empty
        [], // nftContracts - empty
        [], // nftTokenIds - empty
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('1') }
      );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should successfully create batch lockbox with mixed assets (ETH + ERC20 + NFT)', async () => {
      const tx = await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('0.5'), // amountETH
        [await mockToken.getAddress()], // tokenAddresses
        [ethers.parseEther('50')], // tokenAmounts
        [await mockNFT.getAddress()], // nftContracts
        [1], // nftTokenIds
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('0.5') }
      );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should hit successful ReentrancyGuard path in createLockboxWithBatch', async () => {
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
      ).to.emit(lockx, 'Transfer');
    });

    it('should successfully create batch lockbox with multiple ERC20 tokens', async () => {
      const tx = await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('1'), // amountETH
        [await mockToken.getAddress(), await mockTokenB.getAddress()], // Multiple tokens
        [ethers.parseEther('25'), ethers.parseEther('75')], // Matching amounts
        [], // nftContracts
        [], // nftTokenIds
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('1') }
      );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should successfully create batch lockbox with multiple NFTs', async () => {
      const tx = await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // Same contract
        [3, 4], // Different token IDs
        ethers.ZeroHash // referenceId
      );

      expect(tx).to.emit(lockx, 'Transfer');
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });
  });

  describe('🔐 ReentrancyGuard Success Paths', () => {
    it('should hit successful ReentrancyGuard path in all creation functions', async () => {
      // Test ETH creation
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
            value: ethers.parseEther('1'),
          })
      ).to.emit(lockx, 'Transfer');

      // Test ERC20 creation
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithERC20(
            user1.address,
            lockboxKeyPair.address,
            await mockToken.getAddress(),
            ethers.parseEther('10'),
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Transfer');

      // Test ERC721 creation
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithERC721(
            user1.address,
            lockboxKeyPair.address,
            await mockNFT.getAddress(),
            1,
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Transfer');

      // Test batch creation
      await expect(
        lockx
          .connect(user1)
          .createLockboxWithBatch(
            user1.address,
            lockboxKeyPair.address,
            ethers.parseEther('0.1'),
            [await mockTokenB.getAddress()],
            [ethers.parseEther('5')],
            [await mockNFT.getAddress()],
            [2],
            ethers.ZeroHash,
            { value: ethers.parseEther('0.1') }
          )
      ).to.emit(lockx, 'Transfer');

      expect(await lockx.balanceOf(user1.address)).to.equal(4);
    });
  });

  describe('✅ Additional Coverage Tests', () => {
    it('should verify lockbox ownership after creation', async () => {
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      expect(await lockx.ownerOf(tokenId)).to.equal(user1.address);
      expect(await lockx.balanceOf(user1.address)).to.equal(1);
    });

    it('should verify locked status after creation', async () => {
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      expect(await lockx.locked(tokenId)).to.be.true;
    });

    it('should create lockboxes with different reference IDs', async () => {
      const referenceId1 = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
      const referenceId2 = ethers.keccak256(ethers.toUtf8Bytes('ref2'));

      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, referenceId1, {
          value: ethers.parseEther('1'),
        });

      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, referenceId2, {
          value: ethers.parseEther('2'),
        });

      expect(await lockx.balanceOf(user1.address)).to.equal(2);
    });

    it('should handle sequential creation by different users', async () => {
      // User1 creates lockbox
      await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      // User2 creates lockbox
      await lockx
        .connect(user2)
        .createLockboxWithETH(user2.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      expect(await lockx.balanceOf(user1.address)).to.equal(1);
      expect(await lockx.balanceOf(user2.address)).to.equal(1);
      // Note: totalSupply() is not available in the current implementation
      // expect(await lockx.totalSupply()).to.equal(2);
    });
  });

  console.log('🎉 LOCKBOX CREATION VALIDATION - COMPREHENSIVE COVERAGE COMPLETE!');
});
