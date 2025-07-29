const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 BRANCH COVERAGE PHASE 8 - SIMPLE VALIDATION FOCUS', () => {
  let lockx, mockToken, mockNFT, owner, user1, user2, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and mint NFTs
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user2.address, 3);
  });

  describe('🎯 SIMPLE VALIDATION BRANCHES - Guaranteed Hits', () => {
    
    it('🎯 BRANCH: Hit invalid signature in rotateLockboxKey', async () => {
      // Create lockbox first
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Try to rotate key with invalid signature - should hit signature validation branch
      await expect(
        lockx.connect(user1).rotateLockboxKey(
          tokenId,
          user2.address, // new key
          ethers.ZeroHash,
          Math.floor(Date.now() / 1000) + 3600,
          "0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890" // Invalid signature
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });

    it('🎯 BRANCH: Hit unauthorized access in burnLockbox', async () => {
      // Create lockbox as user1
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Try to burn as user2 (not owner) - should hit authorization branch
      await expect(
        lockx.connect(user2).burnLockbox(
          tokenId,
          ethers.ZeroHash,
          Math.floor(Date.now() / 1000) + 3600,
          "0x00" // Invalid signature, but should hit auth check first
        )
      ).to.be.revertedWithCustomError(lockx, 'Unauthorized');
    });

    it('🎯 BRANCH: Hit zero amount in createLockboxWithERC20', async () => {
      // Try to create lockbox with zero ERC20 amount
      await mockToken.connect(user1).approve(await lockx.getAddress(), 0);
      
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

    it('🎯 BRANCH: Hit empty NFT arrays in createLockboxWithBatch', async () => {
      // Try to create batch lockbox with empty arrays but mismatched lengths
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          0, // amountETH
          [], // tokenAddresses - empty
          [], // tokenAmounts - empty
          [], // nftContracts - empty but will add one
          [1], // nftTokenIds - 1 ID with 0 contracts (MISMATCH!)
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('🎯 BRANCH: Hit successful lockbox burn with valid signature', async () => {
      // Create simple lockbox
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('burn'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
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
      
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, referenceId, user1.address, signatureExpiry]
      );
      
      const burnValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 5, // BurnLockbox
        dataHash: ethers.keccak256(burnData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, burnValue);
      
      // Burn lockbox - should hit successful burn branches
      const burnTx = await lockx.connect(user1).burnLockbox(
        tokenId,
        referenceId,
        signatureExpiry,
        signature
      );
      
      expect(burnTx).to.emit(lockx, 'Transfer');
    });

    it('🎯 BRANCH: Hit zero ETH in createLockboxWithETH', async () => {
      // Try to create ETH lockbox with 0 ETH value
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: 0 } // Zero ETH
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('🎯 BRANCH: Hit successful metadata URI update', async () => {
      // Create lockbox first
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('metadata'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
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
      
      const metadataData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'address', 'uint256'],
        [tokenId, "https://example.com/metadata", referenceId, user1.address, signatureExpiry]
      );
      
      const metadataValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 6, // SetTokenMetadataURI
        dataHash: ethers.keccak256(metadataData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, metadataValue);
      
      // Update metadata - should hit successful metadata update branches
      const metadataTx = await lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        "https://example.com/metadata",
        referenceId,
        signatureExpiry,
        signature
      );
      
      expect(metadataTx).to.not.be.reverted;
    });

  });

});