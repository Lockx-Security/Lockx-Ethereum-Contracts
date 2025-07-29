const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 BRANCH COVERAGE PHASE 5 - FINAL PUSH TO 86.78%+', () => {
  let lockx, mockToken, mockTokenB, mockRouter, owner, user1, lockboxKeyPair;
  
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
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

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
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('zeroaddr'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        WithdrawERC20: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const value = {
        tokenId: tokenId,
        tokenAddress: await mockToken.getAddress(),
        amount: ethers.parseEther('10'),
        to: ethers.ZeroAddress, // Zero address recipient
        referenceId: referenceId,
        signatureExpiry: signatureExpiry
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
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('insufficient'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        WithdrawERC20: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'tokenAddress', type: 'address' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const value = {
        tokenId: tokenId,
        tokenAddress: await mockToken.getAddress(),
        amount: ethers.parseEther('50'), // Requesting 50 when only 10 available
        to: user1.address,
        referenceId: referenceId,
        signatureExpiry: signatureExpiry
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
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nftnotfound'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        WithdrawERC721: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nftContract', type: 'address' },
          { name: 'nftTokenId', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const value = {
        tokenId: tokenId,
        nftContract: await mockToken.getAddress(),
        nftTokenId: 999, // Non-existent NFT
        to: user1.address,
        referenceId: referenceId,
        signatureExpiry: signatureExpiry
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
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('noeth'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        WithdrawETH: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const value = {
        tokenId: tokenId,
        amount: ethers.parseEther('1'), // Requesting 1 ETH when only 0.1 available
        to: user1.address,
        referenceId: referenceId,
        signatureExpiry: signatureExpiry
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
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const expiredSignatureExpiry = currentBlock.timestamp - 3600; // Expired 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('expired'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        WithdrawETH: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const value = {
        tokenId: tokenId,
        amount: ethers.parseEther('0.5'),
        to: user1.address,
        referenceId: referenceId,
        signatureExpiry: expiredSignatureExpiry // Expired signature
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
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('slippage'));
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };
      
      const types = {
        SwapInLockbox: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'target', type: 'address' },
          { name: 'data', type: 'bytes' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('10'),
        ethers.parseEther('1')
      ]);
      
      const value = {
        tokenId: tokenId,
        tokenIn: await mockToken.getAddress(),
        tokenOut: await mockTokenB.getAddress(),
        amountIn: ethers.parseEther('10'),
        minAmountOut: ethers.parseEther('100'), // Unrealistically high minimum - will cause slippage error
        target: await mockRouter.getAddress(),
        data: swapData,
        to: ethers.ZeroAddress,
        referenceId: referenceId,
        signatureExpiry: signatureExpiry
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);
      
      // Try swap with unrealistic slippage protection - should trigger SlippageExceeded error
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          ethers.parseEther('10'),
          ethers.parseEther('100'), // Unrealistically high minimum
          await mockRouter.getAddress(),
          swapData,
          ethers.ZeroAddress,
          referenceId,
          signatureExpiry,
          signature
        )
      ).to.be.revertedWithCustomError(lockx, 'SlippageExceeded');
    });

  });

});