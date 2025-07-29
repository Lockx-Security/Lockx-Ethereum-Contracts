const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 BRANCH COVERAGE RESTORATION - Target Missing Branches', () => {
  let lockx, mockToken, mockTokenB, mockNFT, mockRouter, owner, user1, user2, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TB');
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('NFT Collection', 'NFT');
    
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(user2.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Mint NFTs
    await mockNFT.connect(owner).mint(user1.address, 1);
    await mockNFT.connect(owner).mint(user1.address, 2);
    await mockNFT.connect(owner).mint(user1.address, 3);
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 WITHDRAWALS.SOL - Missing Branches (Priority 1)', () => {
    
    it('🎯 BRANCH: Hit array length mismatch in batchWithdraw (lines 1542-1543)', async () => {
      // Create lockbox with NFT first
      await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
      
      const tx1 = await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        user1.address, // Use user1 as key holder for simplicity
        [await mockNFT.getAddress()],
        [1],
        ethers.ZeroHash
      );
      
      const receipt1 = await tx1.wait();
      const transferEvent1 = receipt1.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId1 = parseInt(transferEvent1.topics[3], 16);
      
      // Test array length mismatch directly - should hit the branch!
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('mismatch'));
      
      const nftAddress = await mockNFT.getAddress();
      
      // This should hit the array length mismatch branch and revert
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId1,
          ethers.ZeroHash, // Skip signature verification for branch testing
          '0x00', // Empty signature
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [nftAddress, nftAddress], // 2 contracts
          [1], // 1 tokenId - MISMATCH triggers branch!
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
      
      console.log('✅ BRANCH: Hit array length mismatch in batchWithdraw');
    });

    it('🎯 BRANCH: Hit insufficient ETH balance check (lines 1570)', async () => {
      // Create lockbox with minimal ETH
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('noeth'));
      
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
      
      // Try to withdraw more ETH than available - should hit insufficient balance branch
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), user1.address, referenceId, user1.address, signatureExpiry]
      );
      
      const withdrawValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 1, // WITHDRAW_ETH
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the NoETHBalance branch
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'), // More than available
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
      
      console.log('✅ BRANCH: Hit insufficient ETH balance check');
    });

    it('🎯 BRANCH: Hit insufficient token balance check (lines 1592)', async () => {
      // Create lockbox with minimal tokens
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10'));
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroHash
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('notoken'));
      
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
      
      // Try to withdraw more tokens than available - should hit insufficient balance branch
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('100'), user1.address, referenceId, user1.address, signatureExpiry]
      );
      
      const withdrawValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the InsufficientTokenBalance branch
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          ethers.parseEther('100'), // More than available
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
      
      console.log('✅ BRANCH: Hit insufficient token balance check');
    });

    it('🎯 BRANCH: Hit swap slippage protection (lines 1763-1764)', async () => {
      // Create lockbox with tokens for swapping
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('slippage'));
      
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
      
      // Create swap with excessive slippage protection - should hit the branch
      const amountIn = ethers.parseEther('10');
      const minAmountOut = ethers.parseEther('15'); // More than possible (95% rate = 9.5)
      
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        amountIn,
        minAmountOut,
        await lockx.getAddress()
      ]);
      
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut, // Too high - will trigger slippage protection
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress
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
      
      // This should hit the slippage protection branch
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          swapMessageHash,
          swapSignature,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut, // Too high - triggers slippage branch
          await mockRouter.getAddress(),
          swapCallData,
          referenceId,
          signatureExpiry,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(lockx, 'SwapCallFailed');
      
      console.log('✅ BRANCH: Hit swap slippage protection');
    });
  });

  describe('🎯 LOCKX.SOL - Missing Branches (Priority 2)', () => {
    
    it('🎯 BRANCH: Hit zero address key validation (lines 1135-1136)', async () => {
      // Try to create lockbox with zero address key - should hit validation branch
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          ethers.ZeroAddress, // Zero address key - triggers branch!
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
      
      console.log('✅ BRANCH: Hit zero address key validation');
    });

    it('🎯 BRANCH: Hit self-mint prevention (lines 1176-1177)', async () => {
      // Try to create lockbox to Lockx contract itself - should hit self-mint branch
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          await lockx.getAddress(), // Self-mint - triggers branch!
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
      
      console.log('✅ BRANCH: Hit self-mint prevention');
    });
  });

  describe('🎯 DEPOSITS.SOL - Missing Branches (Priority 3)', () => {
    
    it('🎯 BRANCH: Hit NFT already exists check (lines 837)', async () => {
      // Create lockbox with NFT
      await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
      
      const nftAddress = await mockNFT.getAddress();
      const tx = await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        user1.address, // Use user1 as key holder for simplicity
        [nftAddress],
        [1],
        ethers.ZeroHash
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Mint another NFT with same ID to user1 for testing
      await mockNFT.connect(owner).mint(user1.address, 2);
      
      // Try to deposit a NEW NFT (ID 2) - this should work
      const referenceId1 = ethers.keccak256(ethers.toUtf8Bytes('newNFT'));
      await lockx.connect(user1).depositERC721(
        tokenId,
        nftAddress,
        2, // Different NFT - should work
        referenceId1
      );
      
      // Now try to deposit the same NFT (ID 2) again - should hit "already exists" branch
      const referenceId2 = ethers.keccak256(ethers.toUtf8Bytes('duplicate'));
      await expect(
        lockx.connect(user1).depositERC721(
          tokenId,
          nftAddress,
          2, // Same NFT as above - triggers branch!
          referenceId2
        )
      ).to.be.revertedWithCustomError(lockx, 'NFTAlreadyExists');
      
      console.log('✅ BRANCH: Hit NFT already exists check');
    });
  });
  
  console.log('🎉 BRANCH COVERAGE RESTORATION - KEY BRANCHES TARGETED!');
});