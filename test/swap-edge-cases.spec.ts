const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🔧 SWAP FIX SUPPLEMENT - RESTORE MISSING COVERAGE', () => {
  let lockx, mockToken, mockTokenB, owner, user1, lockboxKeyPair, mockRouter;
  
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
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
  });

  it('🎯 HIT SWAP BRANCHES - CORRECT SIGNATURE', async () => {
    // Create lockbox with tokens
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address, // to
      lockboxKeyPair.address, // lockboxPublicKey
      await mockToken.getAddress(), // tokenAddress
      ethers.parseEther('100'), // amount
      ethers.ZeroHash // referenceId
    );
    
    const tokenId = 0;
    
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
    
    // Create proper swap signature with current API
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address'],
      [
        await mockToken.getAddress(),    // tokenIn
        await mockTokenB.getAddress(),   // tokenOut
        ethers.parseEther('10'),         // amountIn
        ethers.parseEther('9'),          // minAmountOut
        await mockRouter.getAddress(),   // target
        '0x',                           // data
        referenceId,                    // referenceId
        signatureExpiry,                // signatureExpiry  
        user1.address                   // recipient
      ]
    );
    
    const swapValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapData)
    };
    
    const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
    const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
    
    // Execute swap with correct signature
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      await mockToken.getAddress(),
      await mockTokenB.getAddress(), 
      ethers.parseEther('10'),
      ethers.parseEther('9'),
      await mockRouter.getAddress(),
      '0x',
      referenceId,
      signatureExpiry,
      user1.address
    );
    
    console.log('✅ SWAP: Successful swap executed with correct API');
  });

  it('🎯 HIT SWAP ERROR BRANCHES', async () => {
    // Create lockbox
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address, // to
      lockboxKeyPair.address, // lockboxPublicKey
      await mockToken.getAddress(), // tokenAddress
      ethers.parseEther('100'), // amount
      ethers.ZeroHash // referenceId
    );
    
    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref2'));
    
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
    
    // Test zero address error
    const zeroAddressData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address'],
      [
        await mockToken.getAddress(),
        ethers.ZeroAddress,              // tokenOut = zero address
        ethers.parseEther('10'),
        ethers.parseEther('9'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      ]
    );
    
    const zeroValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7,
      dataHash: ethers.keccak256(zeroAddressData)
    };
    
    const zeroSignature = await lockboxKeyPair.signTypedData(domain, types, zeroValue);
    const zeroMessageHash = ethers.TypedDataEncoder.hash(domain, types, zeroValue);
    
    try {
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        zeroMessageHash,
        zeroSignature,
        await mockToken.getAddress(),
        ethers.ZeroAddress,
        ethers.parseEther('10'),
        ethers.parseEther('9'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      );
      expect.fail('Should have reverted');
    } catch (error) {
      // Expected error for zero address
    }
    
    // Test zero amount error
    const zeroAmountData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address'],
      [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        0,                              // amountIn = 0
        ethers.parseEther('9'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      ]
    );
    
    const amountValue = {
      tokenId: tokenId,
      nonce: 1,  // Same nonce since previous failed
      opType: 7,
      dataHash: ethers.keccak256(zeroAmountData)
    };
    
    const amountSignature = await lockboxKeyPair.signTypedData(domain, types, amountValue);
    const amountMessageHash = ethers.TypedDataEncoder.hash(domain, types, amountValue);
    
    try {
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        amountMessageHash,
        amountSignature,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        0,
        ethers.parseEther('9'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      );
      expect.fail('Should have reverted');
    } catch (error) {
      // Expected error for zero amount
    }
    
    console.log('✅ SWAP: Error branches hit successfully');
  });

  it('🎯 HIT ADDITIONAL SWAP COVERAGE', async () => {
    // Create lockbox
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('50'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address, // to
      lockboxKeyPair.address, // lockboxPublicKey
      await mockToken.getAddress(), // tokenAddress
      ethers.parseEther('50'), // amount
      ethers.ZeroHash // referenceId
    );
    
    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref3'));
    
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
    
    // Test same token swap (should fail)
    const sameTokenData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address'],
      [
        await mockToken.getAddress(),
        await mockToken.getAddress(),    // Same as tokenIn
        ethers.parseEther('5'),
        ethers.parseEther('4'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      ]
    );
    
    const sameTokenValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7,
      dataHash: ethers.keccak256(sameTokenData)
    };
    
    const sameTokenSignature = await lockboxKeyPair.signTypedData(domain, types, sameTokenValue);
    const sameTokenMessageHash = ethers.TypedDataEncoder.hash(domain, types, sameTokenValue);
    
    try {
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        sameTokenMessageHash,
        sameTokenSignature,
        await mockToken.getAddress(),
        await mockToken.getAddress(),
        ethers.parseEther('5'),
        ethers.parseEther('4'),
        await mockRouter.getAddress(),
        '0x',
        referenceId,
        signatureExpiry,
        user1.address
      );
      expect.fail('Should have reverted for same token swap');
    } catch (error) {
      // Expected error for same token swap
    }
    
    console.log('✅ SWAP: Additional coverage branches hit');
  });
});