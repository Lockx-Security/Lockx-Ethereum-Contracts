import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 BRANCH COVERAGE PHASE 5 - FINAL PUSH TO 86.78%+', () => {
  let lockx, mockToken, mockTokenB, mockRouter, noSlippageRouter, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TB');
    
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();
    
    const NoSlippageCheckRouter = await ethers.getContractFactory('NoSlippageCheckRouter');
    noSlippageRouter = await NoSlippageCheckRouter.deploy();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockTokenB.connect(owner).transfer(await noSlippageRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund routers with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
    await owner.sendTransaction({
      to: await noSlippageRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  // Helper function to build EIP-712 domain
  async function buildDomain() {
    const { chainId } = await ethers.provider.getNetwork();
    return {
      name: 'Lockx',
      version: '4',
      chainId,
      verifyingContract: await lockx.getAddress(),
    };
  }

  // EIP-712 types for Operation
  const types = {
    Operation: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'opType', type: 'uint8' },
      { name: 'dataHash', type: 'bytes32' },
    ],
  };

  // Operation types
  const OPERATION_TYPE = {
    ROTATE_KEY: 0,
    WITHDRAW_ETH: 1,
    WITHDRAW_ERC20: 2,
    WITHDRAW_NFT: 3,
    BURN_LOCKBOX: 4,
    SET_TOKEN_URI: 5,
    BATCH_WITHDRAW: 6,
    SWAP_ASSETS: 7,
  };

  describe('🎯 WITHDRAWALS HIGH PRIORITY BRANCHES - 6 Critical Tests', () => {
    
    it('🎯 BRANCH: Hit zero address recipient error in withdrawERC20', async () => {
      // Create lockbox with ERC20 tokens
      await mockToken.mint(user1.address, ethers.parseEther('100'));
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('50'),
        ethers.ZeroHash,
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('zeroaddr'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('10'), ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.WITHDRAW_ERC20,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try to withdraw to zero address - should trigger ZeroAddress error
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(), // tokenAddress
          ethers.parseEther('10'), // amount
          ethers.ZeroAddress, // recipient - Zero address recipient
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('🎯 BRANCH: Hit insufficient token balance in withdrawERC20', async () => {
      // Create lockbox with minimal ERC20 tokens
      await mockToken.mint(user1.address, ethers.parseEther('100'));
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'), // Only 10 tokens
        ethers.ZeroHash,
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('insufficient'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('50'), user1.address, referenceId, user1.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.WITHDRAW_ERC20,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try to withdraw more than available - should trigger InsufficientTokenBalance error
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(), // tokenAddress 
          ethers.parseEther('50'), // amount - Requesting 50 when only 10 available
          user1.address, // recipient
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
    });

    it('🎯 BRANCH: Hit NFT not found error in withdrawERC721', async () => {
      // Create lockbox with minimal setup
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nftnotfound'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), 999, user1.address, referenceId, user1.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.WITHDRAW_NFT,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try to withdraw non-existent NFT - should trigger NFTNotFound error
      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(), // nftContract
          999, // nftTokenId - Non-existent NFT
          user1.address, // recipient
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NFTNotFound');
    });

    it('🎯 BRANCH: Hit insufficient ETH balance error in withdrawETH', async () => {
      // Create lockbox with minimal ETH
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') } // Only 0.1 ETH
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('noeth'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), user1.address, referenceId, user1.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.WITHDRAW_ETH,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try to withdraw more ETH than available - should trigger NoETHBalance error
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'), // amountETH - Requesting 1 ETH when only 0.1 available
          user1.address, // recipient
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
    });

    it('🎯 BRANCH: Hit signature expired error in operations', async () => {
      // Create lockbox
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
      const expiredSignatureExpiry = currentBlock.timestamp - 3600; // Expired 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('expired'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), user1.address, referenceId, user1.address, expiredSignatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.WITHDRAW_ETH,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try to use expired signature - should trigger SignatureExpired error
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('0.5'), // amountETH
          user1.address, // recipient
          referenceId,
          expiredSignatureExpiry // Expired signature
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('🎯 BRANCH: Hit swap slippage protection error', async () => {
      // Create lockbox with tokens for swapping
      await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('100'));
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('50'),
        ethers.ZeroHash,
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('slippage'));
      
      const domain = await buildDomain();
      // Use nonce 1 for first operation on newly created token
      const nonce = 1;
      
      const swapData = noSlippageRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('10'),
        ethers.parseEther('1'), // This will be ignored by NoSlippageCheckRouter
        await lockx.getAddress() // Send tokens to Lockx contract
      ]);
      
      // Prepare data for signature
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [tokenId, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('10'), ethers.parseEther('100'), await noSlippageRouter.getAddress(), ethers.keccak256(swapData), referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
      );
      const dataHash = ethers.keccak256(data);
      
      const value = {
        tokenId: tokenId,
        nonce: nonce,
        opType: OPERATION_TYPE.SWAP_ASSETS,
        dataHash: dataHash
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try swap with unrealistic slippage protection - should trigger SlippageExceeded error
      // Router will return ~9.5 tokens (95% of 10), but we require 100 minimum
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          ethers.parseEther('10'),
          ethers.parseEther('100'), // Unrealistically high minimum (expecting 100, getting ~9.5)
          await noSlippageRouter.getAddress(),
          swapData,
          referenceId,
          signatureExpiry,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(lockx, 'SlippageExceeded');
    });

  });

});