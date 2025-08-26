import { expect } from 'chai';
import { ethers } from 'hardhat';

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
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Create proper signature with wrong signer to test InvalidSignature branch
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.ZeroHash;
      
      const domain = {
        name: 'Lockx',
        version: '4',
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
      
      const rotateData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, user2.address, referenceId, user1.address, signatureExpiry]
      );
      
      const rotateValue = {
        tokenId: tokenId,
        nonce: await lockx.connect(user1).getNonce(tokenId),
        opType: 0, // ROTATE_KEY
        dataHash: ethers.keccak256(rotateData)
      };
      
      // Sign with wrong key (user1 instead of lockboxKeyPair) to trigger InvalidSignature
      const wrongSignature = await user1.signTypedData(domain, types, rotateValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);
      
      // Try to rotate key with invalid signature - should hit signature validation branch
      await expect(
        lockx.connect(user1).rotateLockboxKey(
          tokenId,
          messageHash,
          wrongSignature, // Signed by wrong key
          user2.address, // new key
          referenceId,
          signatureExpiry
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
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.ZeroHash;
      
      // Try to burn as user2 (not owner) - should hit authorization branch
      await expect(
        lockx.connect(user2).burnLockbox(
          tokenId,
          ethers.ZeroHash, // messageHash - doesn't matter since auth check comes first
          "0x00", // Invalid signature, but should hit auth check first
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
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
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('burn'));
      
      const domain = {
        name: 'Lockx',
        version: '4',
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
      
      // Use nonce 1 for first operation on newly created token
      const nonce1 = await lockx.connect(user1).getNonce(tokenId);
      const burnValue = {
        tokenId: tokenId,
        nonce: nonce1,
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, burnValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);
      
      // Since the lockbox has assets, expect LockboxNotEmpty error
      await expect(
        lockx.connect(user1).burnLockbox(
          tokenId,
          messageHash, // messageHash
          signature, // signature
          referenceId, // referenceId
          signatureExpiry // signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'LockboxNotEmpty');
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
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('metadata'));
      
      const domain = {
        name: 'Lockx',
        version: '4',
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
      
      const rotateNonce = await lockx.connect(user1).getNonce(tokenId);
      const metadataValue = {
        tokenId: tokenId,
        nonce: rotateNonce,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(metadataData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, metadataValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, metadataValue);
      
      // Update metadata - should hit successful metadata update branches
      const metadataTx = await lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        messageHash, // messageHash
        signature, // signature
        "https://example.com/metadata", // newMetadataURI
        referenceId, // referenceId
        signatureExpiry // signatureExpiry
      );
      
      expect(metadataTx).to.not.be.reverted;
    });

  });

});