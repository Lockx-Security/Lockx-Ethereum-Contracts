const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 FINAL BRANCH PUSH - TARGET 86.78%+', () => {
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

  describe('🎯 FINAL PUSH - Simple Working Tests', () => {
    
    it('🎯 BRANCH: Hit successful token-to-token swap with correct signature', async () => {
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
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('swap'));
      
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
      
      // Use correct MockSwapRouter function signature: (tokenIn, tokenOut, amountIn, minAmountOut, recipient)
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),      // tokenIn
        await mockTokenB.getAddress(),     // tokenOut
        ethers.parseEther('50'),          // amountIn
        ethers.parseEther('25'),          // minAmountOut
        await lockx.getAddress()          // recipient (lockbox)
      ]);
      
      const swapEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('50'), ethers.parseEther('25'), await mockRouter.getAddress(), swapData, ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const swapValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 4, // SwapInLockbox
        dataHash: ethers.keccak256(swapEncoded)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      
      // Execute successful swap - should hit various success branches
      const swapTx = await lockx.connect(user1).swapInLockbox(
        tokenId,
        ethers.keccak256(swapEncoded),
        signature,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('50'),
        ethers.parseEther('25'),
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroAddress
      );
      
      expect(swapTx).to.not.be.reverted;
    });

    it('🎯 BRANCH: Hit different token registration path', async () => {
      // Create lockbox and perform swap to a token not previously held
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('newtoken'));
      
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
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('30'),
        ethers.parseEther('15'),
        await lockx.getAddress()
      ]);
      
      const swapEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('30'), ethers.parseEther('15'), await mockRouter.getAddress(), swapData, ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const swapValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 4,
        dataHash: ethers.keccak256(swapEncoded)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      
      // This swap should introduce mockTokenB to the lockbox for the first time
      // Should hit the new token registration branch
      const swapTx = await lockx.connect(user1).swapInLockbox(
        tokenId,
        ethers.keccak256(swapEncoded),
        signature,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('30'),
        ethers.parseEther('15'),
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroAddress
      );
      
      expect(swapTx).to.not.be.reverted;
    });

  });

});