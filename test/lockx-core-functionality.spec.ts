import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🚀 LOCKX BRANCH RECOVERY - TARGET 90%+', () => {
  let lockx, mockToken, mockTokenB, mockNFT, owner, user1, user2, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Mock Token B', 'MTKB');
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.connect(owner).mint(user1.address, 1);
    await mockNFT.connect(owner).mint(user1.address, 2);
  });

  it('🎯 HIT CRITICAL MISSING BRANCHES FOR 90%+ COVERAGE', async () => {
    // ✅ HIT BRANCH: createLockboxWithBatch with assets
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    
    const tx = await lockx.connect(user1).createLockboxWithBatch(
      user1.address,                    // to
      lockboxKeyPair.address,           // lockboxPublicKey
      ethers.parseEther('1'),           // amountETH
      [await mockToken.getAddress()],   // tokenAddresses
      [ethers.parseEther('10')],        // tokenAmounts
      [await mockNFT.getAddress()],     // nftContracts
      [1],                              // nftTokenIds
      ethers.ZeroHash,                  // referenceId
      { value: ethers.parseEther('1') }
    );
    
    // Extract tokenId from transaction receipt
    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    
    // ✅ HIT BRANCH: Test swap functionality branches
    const SwapRouter = await ethers.getContractFactory('MockSwapRouter');
    const swapRouter = await SwapRouter.deploy();
    
    await mockToken.connect(owner).transfer(await swapRouter.getAddress(), ethers.parseEther('1000'));
    await mockTokenB.mint(await swapRouter.getAddress(), ethers.parseEther('1000'));
    
    // Create swap signature
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
    
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.ZeroHash;
    
    // Use the mockTokenB already created in beforeEach

    const swapCallData = swapRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(),   // tokenIn
      await mockTokenB.getAddress(),  // tokenOut (different token!)
      ethers.parseEther('5'),         // amountIn
      0,                              // minAmountOut
      ethers.ZeroAddress              // recipient
    ]);

    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,                        // tokenId
        await mockToken.getAddress(),   // tokenIn
        await mockTokenB.getAddress(),  // tokenOut (different token!)
        ethers.parseEther('5'),         // amountIn
        0,                              // minAmountOut
        await swapRouter.getAddress(),  // target
        ethers.keccak256(swapCallData), // data hash
        ethers.ZeroHash,                // referenceId
        user1.address,                  // msg.sender
        signatureExpiry,                // signatureExpiry
        ethers.ZeroAddress              // recipient
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
    
    // ✅ HIT BRANCH: swapInLockbox function
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      await mockToken.getAddress(),   // tokenIn
      await mockTokenB.getAddress(),  // tokenOut (different token!)
      ethers.parseEther('5'),         // amountIn
      0,                              // minAmountOut
      await swapRouter.getAddress(),  // target
      swapCallData,                   // data
      referenceId,                    // referenceId
      signatureExpiry,                // signatureExpiry
      ethers.ZeroAddress              // recipient
    );
    
    // ✅ HIT BRANCH: Test URI setting branches
    const newNonce = 2;
    const currentBlock3 = await ethers.provider.getBlock('latest');
    const uriSignatureExpiry = currentBlock3.timestamp + 3600;
    
    const uriData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'string', 'bytes32', 'address', 'uint256'],
      [
        tokenId,                  // tokenId
        'https://newuri.com',     // newMetadataURI
        ethers.ZeroHash,          // referenceId
        user1.address,            // msg.sender
        uriSignatureExpiry        // signatureExpiry
      ]
    );
    
    const uriValue = {
      tokenId: tokenId,
      nonce: newNonce,
      opType: 5, // SET_TOKEN_URI
      dataHash: ethers.keccak256(uriData)
    };
    
    const uriSignature = await lockboxKeyPair.signTypedData(domain, types, uriValue);
    const uriMessageHash = ethers.TypedDataEncoder.hash(domain, types, uriValue);
    
    // ✅ HIT BRANCH: setTokenMetadataURI function
    await lockx.connect(user1).setTokenMetadataURI(
      tokenId,
      uriMessageHash,
      uriSignature,
      'https://newuri.com',
      ethers.ZeroHash,
      uriSignatureExpiry
    );
    
    // ✅ HIT BRANCH: tokenURI after setting custom URI
    const customURI = await lockx.tokenURI(tokenId);
    expect(customURI).to.equal('https://newuri.com');
    
    // ✅ HIT BRANCH: Test key rotation branches
    const newKeyPair = ethers.Wallet.createRandom();
    const currentBlock4 = await ethers.provider.getBlock('latest');
    const rotateSignatureExpiry = currentBlock4.timestamp + 3600;
    
    const rotateData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,                  // tokenId
        newKeyPair.address,       // newPublicKey
        ethers.ZeroHash,          // referenceId
        user1.address,            // msg.sender
        rotateSignatureExpiry     // signatureExpiry
      ]
    );
    
    const rotateValue = {
      tokenId: tokenId,
      nonce: 3,
      opType: 0, // ROTATE_KEY
      dataHash: ethers.keccak256(rotateData)
    };
    
    const rotateSignature = await lockboxKeyPair.signTypedData(domain, types, rotateValue);
    const rotateMessageHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);
    
    // ✅ HIT BRANCH: rotateLockboxKey function
    await lockx.connect(user1).rotateLockboxKey(
      tokenId,
      rotateMessageHash,
      rotateSignature,
      newKeyPair.address,
      ethers.ZeroHash,
      rotateSignatureExpiry
    );
    
    // ✅ HIT BRANCH: Verify key was rotated
    const newActiveKey = await lockx.connect(user1).getActiveLockboxPublicKeyForToken(tokenId);
    expect(newActiveKey).to.equal(newKeyPair.address);
    
    console.log('✅ Critical Lockx.sol branches hit for 90%+ coverage recovery!');
  });

  it('🎯 HIT WITHDRAWAL EDGE CASE BRANCHES', async () => {
    // Create lockbox with multiple assets
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    
    const tx2 = await lockx.connect(user1).createLockboxWithBatch(
      user1.address,                      // to
      lockboxKeyPair.address,             // lockboxPublicKey  
      ethers.parseEther('2'),             // amountETH
      [await mockToken.getAddress()],     // tokenAddresses
      [ethers.parseEther('50')],          // tokenAmounts
      [await mockNFT.getAddress()],       // nftContracts
      [2],                                // nftTokenIds
      ethers.ZeroHash,                    // referenceId
      { value: ethers.parseEther('2') }
    );
    
    // Extract tokenId from transaction receipt
    const receipt2 = await tx2.wait();
    const transferEvent2 = receipt2.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
    if (!transferEvent2) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent2.topics[3], 16);
    
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
    
    // ✅ HIT BRANCH: Test batch withdrawal with mixed assets
    const currentBlock2 = await ethers.provider.getBlock('latest');
    const batchSignatureExpiry = currentBlock2.timestamp + 3600;
    
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,                          // tokenId
        ethers.parseEther('1'),           // amountETH
        [await mockToken.getAddress()],   // tokenAddresses
        [ethers.parseEther('25')],        // tokenAmounts
        [await mockNFT.getAddress()],     // nftContracts
        [2],                              // nftTokenIds
        user1.address,                    // recipient
        ethers.ZeroHash,                  // referenceId
        user1.address,                    // msg.sender
        batchSignatureExpiry              // signatureExpiry
      ]
    );
    
    const batchValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };
    
    const batchSignature = await lockboxKeyPair.signTypedData(domain, types, batchValue);
    const batchMessageHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);
    
    // ✅ HIT BRANCH: batchWithdraw function with mixed assets
    await lockx.connect(user1).batchWithdraw(
      tokenId,
      batchMessageHash,
      batchSignature,
      ethers.parseEther('1'),           // amountETH
      [await mockToken.getAddress()],   // tokenAddresses
      [ethers.parseEther('25')],        // tokenAmounts
      [await mockNFT.getAddress()],     // nftContracts
      [2],                              // nftTokenIds
      user1.address,                    // recipient
      ethers.ZeroHash,                  // referenceId
      batchSignatureExpiry              // signatureExpiry
    );
    
    console.log('✅ Additional withdrawal branches hit!');
  });

  it('🎯 HIT SIGNATURE VERIFICATION ERROR BRANCHES', async () => {
    // Create basic lockbox with fresh key
    const freshLockboxKeyPair = ethers.Wallet.createRandom();
    const tx3 = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      freshLockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    
    // Extract tokenId from transaction receipt
    const receipt3 = await tx3.wait();
    const transferEvent3 = receipt3.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
    if (!transferEvent3) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent3.topics[3], 16);
    
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
    
    // ✅ HIT BRANCH: InvalidSignature error branch  
    const currentBlock3 = await ethers.provider.getBlock('latest');
    const withdrawSignatureExpiry = currentBlock3.timestamp + 3600;
    
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,                    // tokenId
        ethers.parseEther('0.5'),   // amountETH
        user1.address,              // recipient
        ethers.ZeroHash,            // referenceId
        user1.address,              // msg.sender
        withdrawSignatureExpiry     // signatureExpiry
      ]
    );
    
    const currentNonce = await lockx.connect(user1).getNonce(tokenId);
    
    const withdrawValue = {
      tokenId: tokenId,
      nonce: currentNonce,
      opType: 1, // WITHDRAW_ETH
      dataHash: ethers.keccak256(withdrawData)
    };
    
    // Use a completely wrong key - this should cause InvalidSignature
    const wrongKey = ethers.Wallet.createRandom();
    const badSignature = await wrongKey.signTypedData(domain, types, withdrawValue);
    const withdrawMessageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
    
    await expect(
      lockx.connect(user1).withdrawETH(
        tokenId,
        withdrawMessageHash,
        badSignature,
        ethers.parseEther('0.5'),
        user1.address,
        ethers.ZeroHash,
        withdrawSignatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    
    // ✅ HIT BRANCH: InvalidMessageHash error branch
    const wrongHash = ethers.keccak256(ethers.toUtf8Bytes('wrong'));
    const correctSignature = await freshLockboxKeyPair.signTypedData(domain, types, withdrawValue);
    
    await expect(
      lockx.connect(user1).withdrawETH(
        tokenId,
        wrongHash,
        correctSignature,
        ethers.parseEther('0.5'),
        user1.address,
        ethers.ZeroHash,
        withdrawSignatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
    
    console.log('✅ Signature verification error branches hit!');
  });
});