import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 BRANCH COVERAGE PHASE 2 - Push to 86.78%+', () => {
  let lockx, mockToken, mockTokenB, mockNFT, mockRouter, usdtSimulator, owner, user1, user2, lockboxKeyPair;
  
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
    
    // Deploy USDT simulator
    const USDTSimulator = await ethers.getContractFactory('USDTSimulator');
    usdtSimulator = await USDTSimulator.deploy();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(user2.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await usdtSimulator.mint(owner.address, ethers.parseEther('10000'));
    await usdtSimulator.mint(user1.address, ethers.parseEther('1000'));
    
    // Mint NFTs
    await mockNFT.connect(owner).mint(user1.address, 1);
    await mockNFT.connect(owner).mint(user1.address, 2);
    await mockNFT.connect(owner).mint(user1.address, 3);
    await mockNFT.connect(owner).mint(user2.address, 4);
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 WITHDRAWALS.SOL - Additional Missing Branches', () => {
    
    it('🎯 BRANCH: Hit signature expiry check in withdraw operations', async () => {
      // Create lockbox with ETH
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Use expired signature timestamp - should hit signature expiry branch
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('expired'));
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), user1.address, referenceId, user1.address, expiredTimestamp]
      );
      
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const withdrawValue = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 1, // WITHDRAW_ETH
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the SignatureExpired branch
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('0.5'),
          user1.address,
          referenceId,
          expiredTimestamp // Expired timestamp triggers branch!
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
      
      console.log('✅ BRANCH: Hit signature expiry check in withdraw operations');
    });

    it('🎯 BRANCH: Hit zero address recipient check in withdrawals', async () => {
      // Create lockbox with tokens
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
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('zeroaddr'));
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      // Try withdrawal with zero address recipient - should hit zero address branch
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('50'), ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const withdrawValue = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the ZeroAddress branch for recipient
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          ethers.parseEther('50'),
          ethers.ZeroAddress, // Zero address recipient - triggers branch!
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
      
      console.log('✅ BRANCH: Hit zero address recipient check in withdrawals');
    });

    it('🎯 BRANCH: Hit NFT not found check in withdrawals', async () => {
      // Create lockbox with ETH first (simpler setup)
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nftnotfound'));
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      // Try to withdraw NFT that doesn't exist in lockbox - should hit NFT not found branch
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockNFT.getAddress(), 999, user1.address, referenceId, user1.address, signatureExpiry] // NFT 999 doesn't exist
      );
      
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const withdrawValue = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 3, // WITHDRAW_NFT
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the NFTNotFound branch
      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockNFT.getAddress(),
          999, // Non-existent NFT - triggers branch!
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NFTNotFound');
      
      console.log('✅ BRANCH: Hit NFT not found check in withdrawals');
    });

    it('🎯 BRANCH: Hit swap invalid token combination (ETH to ETH)', async () => {
      // Create lockbox with ETH
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('invalidswap'));
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      // Try to swap ETH to ETH (invalid) - should hit invalid swap branch
      const amountIn = ethers.parseEther('0.5');
      const minAmountOut = ethers.parseEther('0.4');
      
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        ethers.ZeroAddress, // tokenIn = ETH
        ethers.ZeroAddress, // tokenOut = ETH - INVALID!
        amountIn,
        minAmountOut,
        await lockx.getAddress()
      ]);
      
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          ethers.ZeroAddress, // tokenIn = ETH
          ethers.ZeroAddress, // tokenOut = ETH - INVALID!
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress
        ]
      );
      
      const withdrawNonce = await lockx.connect(user1).getNonce(tokenId);
      const swapValue = {
        tokenId: tokenId,
        nonce: withdrawNonce,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };
      
      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
      
      // This should hit the InvalidSwap branch for ETH to ETH
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          swapMessageHash,
          swapSignature,
          ethers.ZeroAddress, // tokenIn = ETH
          ethers.ZeroAddress, // tokenOut = ETH - triggers branch!
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          swapCallData,
          referenceId,
          signatureExpiry,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidSwap');
      
      console.log('✅ BRANCH: Hit swap invalid token combination (ETH to ETH)');
    });

    it('🎯 BRANCH: Hit swap balance measurement branches for different token types', async () => {
      // Create lockbox with mixed assets (ETH + ERC20)
      const tx1 = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const receipt1 = await tx1.wait();
      const transferEvent1 = receipt1.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent1.topics[3], 16);
      
      // Add ERC20 to the same lockbox
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.keccak256(ethers.toUtf8Bytes('deposit'))
      );
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('balancemeasure'));
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      // Test ERC20 to ETH swap to hit different balance measurement branches
      const amountIn = ethers.parseEther('50');
      const minAmountOut = ethers.parseEther('0.001'); // Low to avoid slippage
      
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(), // tokenIn = ERC20
        ethers.ZeroAddress, // tokenOut = ETH
        amountIn,
        minAmountOut,
        await lockx.getAddress()
      ]);
      
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await mockToken.getAddress(), // tokenIn = ERC20
          ethers.ZeroAddress, // tokenOut = ETH
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress
        ]
      );
      
      const nonce3 = await lockx.connect(user1).getNonce(tokenId);
      const swapValue = {
        tokenId: tokenId,
        nonce: nonce3,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };
      
      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
      
      // This should hit balance measurement branches for both ERC20 and ETH
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        swapMessageHash,
        swapSignature,
        await mockToken.getAddress(), // tokenIn = ERC20
        ethers.ZeroAddress, // tokenOut = ETH
        amountIn,
        minAmountOut,
        await mockRouter.getAddress(),
        swapCallData,
        referenceId,
        signatureExpiry,
        ethers.ZeroAddress
      );
      
      console.log('✅ BRANCH: Hit swap balance measurement branches for different token types');
    });
  });

  describe('🎯 LOCKX.SOL - Additional Missing Branches', () => {
    
    it('🎯 BRANCH: Hit signature expiry in setTokenMetadataURI', async () => {
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
      
      // Use expired timestamp for metadata update - should hit signature expiry branch
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const newURI = 'https://example.com/new-metadata';
      
      const domain = {
        name: 'Lockx',
        version: '3',
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
      
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('metadata'));
      const metadataData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'uint256'],
        [tokenId, newURI, referenceId, expiredTimestamp]
      );
      
      const nonce4 = await lockx.connect(user1).getNonce(tokenId);
      const metadataValue = {
        tokenId: tokenId,
        nonce: nonce4,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(metadataData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, metadataValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, metadataValue);
      
      // This should hit the SignatureExpired branch in setTokenMetadataURI
      await expect(
        lockx.connect(user1).setTokenMetadataURI(
          tokenId,
          messageHash,
          signature,
          newURI,
          referenceId,
          expiredTimestamp // Expired timestamp triggers branch!
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
      
      console.log('✅ BRANCH: Hit signature expiry in setTokenMetadataURI');
    });

    it('🎯 BRANCH: Hit nonexistent token check in operations', async () => {
      // Try to perform operation on non-existent token - should hit NonexistentToken branch
      const nonExistentTokenId = 999999;
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      
      // This should hit the NonexistentToken branch
      await expect(
        lockx.connect(user1).withdrawETH(
          nonExistentTokenId, // Non-existent token triggers branch!
          ethers.ZeroHash,
          '0x00',
          ethers.parseEther('1'),
          user1.address,
          ethers.keccak256(ethers.toUtf8Bytes('nonexistent')),
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
      
      console.log('✅ BRANCH: Hit nonexistent token check in operations');
    });
  });

  describe('🎯 DEPOSITS.SOL - Additional Missing Branches', () => {
    
    it('🎯 BRANCH: Hit zero amount check in ERC20 deposits', async () => {
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
      
      // Try to deposit zero amount of ERC20 - should hit zero amount branch
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      await expect(
        lockx.connect(user1).depositERC20(
          tokenId,
          await mockToken.getAddress(),
          0, // Zero amount - triggers branch!
          ethers.keccak256(ethers.toUtf8Bytes('zeroamount'))
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
      
      console.log('✅ BRANCH: Hit zero amount check in ERC20 deposits');
    });

    it('🎯 BRANCH: Hit zero address token check in deposits', async () => {
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
      
      // Try to deposit with zero address token - should hit zero address branch
      await expect(
        lockx.connect(user1).depositERC20(
          tokenId,
          ethers.ZeroAddress, // Zero address token - triggers branch!
          ethers.parseEther('100'),
          ethers.keccak256(ethers.toUtf8Bytes('zerotoken'))
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
      
      console.log('✅ BRANCH: Hit zero address token check in deposits');
    });
  });
  
  console.log('🎉 BRANCH COVERAGE PHASE 2 - ADDITIONAL BRANCHES TARGETED!');
});