import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LOCKX.SOL - Target 90% Branch Coverage (88.75% → 90%+)', () => {
  let lockx, mockToken, mockNFT, mockRouter, owner, user1, user2, keyPair, newKeyPair;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();
    newKeyPair = ethers.Wallet.createRandom();

    // Deploy contracts
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock', 'MCK');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('NFT', 'NFT');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Setup
    await mockToken.transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.transfer(await mockRouter.getAddress(), ethers.parseEther('1000'));
    for (let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
    }
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    
    // Set default URI
    await lockx.setDefaultMetadataURI('https://default.com/');
  });

  describe('Non-existent token branches', () => {
    it('should revert getFullLockbox for non-existent token', async () => {
      await expect(
        lockx.connect(user1).getFullLockbox(999)
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should revert tokenURI for non-existent token', async () => {
      await expect(
        lockx.tokenURI(999)
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should revert withdrawal operations for non-existent token', async () => {
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

      const domain = {
        name: 'Lockx',
        version: '4',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [999, ethers.parseEther('1'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const withdrawValue = {
        tokenId: 999,
        nonce: 1,
        opType: 1, // WITHDRAW_ETH
        dataHash: ethers.keccak256(withdrawData)
      };

      const withdrawSig = await keyPair.signTypedData(domain, types, withdrawValue);
      const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);

      await expect(
        lockx.connect(user1).withdrawETH(
          999, withdrawHash, withdrawSig,
          ethers.parseEther('1'), user1.address,
          ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });
  });

  describe('Array length mismatch branches', () => {
    it('should revert createLockboxWithBatch when tokenAddresses.length != tokenAmounts.length', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          keyPair.address,
          ethers.parseEther('0.1'),
          [await mockToken.getAddress()], // 1 address
          [ethers.parseEther('100'), ethers.parseEther('200')], // 2 amounts - MISMATCH!
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('0.1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });
  });

  describe('Missing Branches in _update function', () => {
    it('should hit from == address(0) branch (mint scenario)', async () => {
      // This happens during createLockbox which mints a new NFT
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      
      // Verify NFT was minted (from == address(0))
      expect(await lockx.ownerOf(0)).to.equal(user1.address);
    });

    it('should hit to == address(0) branch (burn scenario)', async () => {
      // Create empty lockbox
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

      // Withdraw all ETH first
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const domain = {
        name: 'Lockx',
        version: '4',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const withdrawValue = {
        tokenId,
        nonce: 1,
        opType: 1, // WITHDRAW_ETH
        dataHash: ethers.keccak256(withdrawData)
      };

      const withdrawSig = await keyPair.signTypedData(domain, types, withdrawValue);
      const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);

      await lockx.connect(user1).withdrawETH(
        tokenId,
        withdrawHash,
        withdrawSig,
        ethers.parseEther('0.1'),
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Now burn (to == address(0))
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const burnValue = {
        tokenId,
        nonce: 2,
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnData)
      };

      const burnSig = await keyPair.signTypedData(domain, types, burnValue);
      const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

      await lockx.connect(user1).burnLockbox(
        tokenId,
        burnHash,
        burnSig,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Verify NFT was burned (to == address(0))
      await expect(lockx.ownerOf(tokenId)).to.be.reverted;
    });
  });

  describe('Missing Branches in tokenURI function', () => {
    it('should hit bytes(defaultURI).length == 0 branch', async () => {
      // Deploy new Lockx without setting defaultURI
      const Lockx2 = await ethers.getContractFactory('Lockx');
      const lockx2 = await Lockx2.deploy();
      
      await lockx2.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );

      // Should revert with NoURI when no default is set
      await expect(lockx2.tokenURI(0)).to.be.revertedWithCustomError(lockx2, 'NoURI');
    });

    it('should hit customURI branch', async () => {
      // Create lockbox
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

      // Set custom URI
      const uriData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'address', 'uint256'],
        [tokenId, 'https://custom.com/metadata', ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const domain = {
        name: 'Lockx',
        version: '4',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const uriValue = {
        tokenId,
        nonce: 1,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(uriData)
      };

      const uriSig = await keyPair.signTypedData(domain, types, uriValue);
      const uriHash = ethers.TypedDataEncoder.hash(domain, types, uriValue);

      await lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        uriHash,
        uriSig,
        'https://custom.com/metadata',
        ethers.ZeroHash,
        signatureExpiry
      );

      // Should return custom URI
      const uri = await lockx.tokenURI(tokenId);
      expect(uri).to.equal('https://custom.com/metadata');
    });
  });

  describe('Missing Branches in supportsInterface', () => {
    it('should hit all interface checks', async () => {
      // ERC165
      expect(await lockx.supportsInterface('0x01ffc9a7')).to.be.true;
      
      // ERC721
      expect(await lockx.supportsInterface('0x80ac58cd')).to.be.true;
      
      // ERC721Metadata
      expect(await lockx.supportsInterface('0x5b5e139f')).to.be.true;
      
      // ERC721Receiver
      expect(await lockx.supportsInterface('0x150b7a02')).to.be.true;
      
      // ERC5192 (Locked)
      expect(await lockx.supportsInterface('0xb45a3c0e')).to.be.true;
      
      // Invalid interface
      expect(await lockx.supportsInterface('0xffffffff')).to.be.false;
    });
  });

  describe('Edge case branches', () => {
    it('should hit edge cases in createLockboxWithBatch', async () => {
      // Empty batch
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [],
        [],
        ethers.ZeroHash
      );

      // Batch with only ETH
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('0.5'),
        [],
        [],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      );

      // Batch with everything
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('0.2'),
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        [await mockNFT.getAddress()],
        [1],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.2') }
      );
    });
  });
});