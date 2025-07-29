const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 BRANCH COVERAGE PHASE 7 - WITHDRAWALS FOCUS', () => {
  let lockx, mockToken, mockTokenB, mockRouter, usdtSimulator, owner, user1, lockboxKeyPair;
  
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
    
    // Deploy USDTSimulator for forceApprove testing
    const USDTSimulator = await ethers.getContractFactory('USDTSimulator');
    usdtSimulator = await USDTSimulator.deploy();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await usdtSimulator.mint(user1.address, ethers.parseEther('1000'));
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 UNTAPPED WITHDRAWALS BRANCHES', () => {
    
    it('🎯 BRANCH: Hit forceApprove reset path with existing allowance (USDT)', async () => {
      // Create lockbox with USDT tokens
      await usdtSimulator.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      const tx = await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await usdtSimulator.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Set up existing allowance to trigger forceApprove reset
      await usdtSimulator.setAllowance(await lockx.getAddress(), await mockRouter.getAddress(), ethers.parseEther('50'));
      
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('forceapprove'));
      
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
        await usdtSimulator.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('50'),
        ethers.parseEther('25')
      ]);
      
      const swapEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await usdtSimulator.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('50'), ethers.parseEther('25'), await mockRouter.getAddress(), swapData, ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const swapValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 4, // SwapInLockbox
        dataHash: ethers.keccak256(swapEncoded)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      
      // Execute swap - should hit forceApprove(0) then forceApprove(amount) branches
      const swapTx = await lockx.connect(user1).swapInLockbox(
        tokenId,
        ethers.keccak256(swapEncoded),
        signature,
        await usdtSimulator.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('50'),
        ethers.parseEther('25'),
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroAddress
      );
      
      expect(swapTx).to.not.be.reverted;
    });

    it('🎯 BRANCH: Hit token removal after complete swap (balance = 0)', async () => {
      // Create lockbox with tokens for swapping ALL tokens
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('tokenremoval'));
      
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
        ethers.parseEther('100'), // Swap ALL tokens
        ethers.parseEther('50')
      ]);
      
      const swapEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('100'), ethers.parseEther('50'), await mockRouter.getAddress(), swapData, ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const swapValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 4, // SwapInLockbox
        dataHash: ethers.keccak256(swapEncoded)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      
      // Execute swap - should swap ALL tokens, making balance 0, triggering token removal
      const swapTx = await lockx.connect(user1).swapInLockbox(
        tokenId,
        ethers.keccak256(swapEncoded),
        signature,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('100'), // ALL tokens
        ethers.parseEther('50'),
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroAddress
      );
      
      expect(swapTx).to.not.be.reverted;
    });

    it('🎯 BRANCH: Hit swap to ETH with external recipient', async () => {
      // Create lockbox with tokens for ETH swap
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ethexternal'));
      
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
        ethers.ZeroAddress, // ETH
        ethers.parseEther('50'),
        ethers.parseEther('0.1')
      ]);
      
      const externalRecipient = await owner.getAddress(); // External recipient
      
      const swapEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther('50'), 0, await mockRouter.getAddress(), swapData, externalRecipient, referenceId, user1.address, signatureExpiry]
      );
      
      const swapValue = {
        tokenId: tokenId,
        nonce: 0,
        opType: 4, // SwapInLockbox
        dataHash: ethers.keccak256(swapEncoded)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      
      // Execute swap to ETH with external recipient - should hit lines 520-521
      const swapTx = await lockx.connect(user1).swapInLockbox(
        tokenId,
        ethers.keccak256(swapEncoded),
        signature,
        await mockToken.getAddress(),
        ethers.ZeroAddress, // ETH output
        ethers.parseEther('50'),
        0, // No slippage check
        await mockRouter.getAddress(),
        swapData,
        externalRecipient // External recipient
      );
      
      expect(swapTx).to.not.be.reverted;
    });

  });

});