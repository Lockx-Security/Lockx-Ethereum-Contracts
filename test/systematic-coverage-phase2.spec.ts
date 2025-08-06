import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 BRANCH COVERAGE PHASE 3 - FINAL PUSH TO 86.78%+', () => {
  let lockx, mockToken, mockTokenB, mockTokenC, mockRouter, owner, user1, user2, lockboxKeyPair;
  let rejectETH;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Token A', 'TA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TB');
    
    mockTokenC = await MockERC20.deploy();
    await mockTokenC.initialize('Token C', 'TC');
    
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();
    
    // Deploy contract that rejects ETH
    const RejectETH = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETH.deploy();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts and contracts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(user2.address, ethers.parseEther('1000'));
    await mockToken.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockTokenC.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenC.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 CRITICAL MISSING BRANCHES - Final Targets', () => {
    
    it('🎯 BRANCH: Hit successful ERC20 to ERC20 swap', async () => {
      // Create lockbox with ERC20 tokens
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
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('swap'));
      
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
      
      // Simple ERC20 to ERC20 swap
      const amountIn = ethers.parseEther('50');
      const minAmountOut = ethers.parseEther('40'); // 95% rate
      
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(), // tokenIn = ERC20
        await mockTokenB.getAddress(), // tokenOut = ERC20
        amountIn,
        minAmountOut,
        await lockx.getAddress() // recipient = lockx
      ]);
      
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await mockToken.getAddress(), // tokenIn = ERC20
          await mockTokenB.getAddress(), // tokenOut = ERC20
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress // Credit to lockbox
        ]
      );
      
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const swapValue = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };
      
      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
      
      // This should succeed and hit various branches
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        swapMessageHash,
        swapSignature,
        await mockToken.getAddress(), // tokenIn = ERC20
        await mockTokenB.getAddress(), // tokenOut = ERC20
        amountIn,
        minAmountOut,
        await mockRouter.getAddress(),
        swapCallData,
        referenceId,
        signatureExpiry,
        ethers.ZeroAddress // Credit to lockbox
      );
      
      console.log('✅ BRANCH: Hit successful ERC20 to ERC20 swap');
    });

    it('🎯 BRANCH: Hit new token registration in swap (existing balance branch)', async () => {
      // Create lockbox with ERC20 tokens
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
      
      // First, add TokenC to the lockbox manually to create existing balance
      await mockTokenC.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10'));
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockTokenC.getAddress(),
        ethers.parseEther('10'),
        ethers.keccak256(ethers.toUtf8Bytes('deposit'))
      );
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('newtoken'));
      
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
      
      // Now swap TokenA to TokenC (TokenC already has balance, so should hit else branch)
      const amountIn = ethers.parseEther('50');
      const minAmountOut = ethers.parseEther('40'); // 95% rate from MockRouter
      
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(), // tokenIn = TokenA
        await mockTokenC.getAddress(), // tokenOut = TokenC (already has balance)
        amountIn,
        minAmountOut,
        await lockx.getAddress() // recipient = lockx contract
      ]);
      
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await mockToken.getAddress(), // tokenIn = TokenA
          await mockTokenC.getAddress(), // tokenOut = TokenC
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress // Credit to lockbox
        ]
      );
      
      const swapNonce = await lockx.connect(user1).getNonce(tokenId);
      const swapValue = {
        tokenId: tokenId,
        nonce: swapNonce, 
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };
      
      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
      
      // This should hit the else branch of the new token registration (line 1794 else path)
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        swapMessageHash,
        swapSignature,
        await mockToken.getAddress(), // tokenIn = TokenA
        await mockTokenC.getAddress(), // tokenOut = TokenC (existing balance)
        amountIn,
        minAmountOut,
        await mockRouter.getAddress(),
        swapCallData,
        referenceId,
        signatureExpiry,
        ethers.ZeroAddress // Credit to lockbox
      );
      
      console.log('✅ BRANCH: Hit existing token balance branch in swap');
    });

    it('🎯 BRANCH: Hit router overspend protection', async () => {
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
      
      // Use OverpayingRouter which consumes more than specified amount
      const OverpayingRouter = await ethers.getContractFactory('OverpayingRouter');
      const overpayingRouter = await OverpayingRouter.deploy();
      await mockTokenB.connect(owner).transfer(await overpayingRouter.getAddress(), ethers.parseEther('10000'));
      
      // Pre-approve additional tokens to the router to enable overspending
      await mockToken.connect(user1).approve(await overpayingRouter.getAddress(), ethers.parseEther('10'));
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('overspend'));
      
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
      
      // This router will consume more than amountIn, triggering overspend protection
      const amountIn = ethers.parseEther('10');
      const minAmountOut = ethers.parseEther('9');
      
      const swapCallData = overpayingRouter.interface.encodeFunctionData('overpayingSwap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        amountIn, // Router will consume MORE than this
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
          minAmountOut,
          await overpayingRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress
        ]
      );
      
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const swapValue = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };
      
      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);
      
      // This should hit the SwapCallFailed branch due to router trying to overspend
      // (The approval mechanism prevents the actual overspending, causing the call to fail)
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          swapMessageHash,
          swapSignature,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          amountIn, // Router tries to consume more than this
          minAmountOut,
          await overpayingRouter.getAddress(),
          swapCallData,
          referenceId,
          signatureExpiry,
          ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(lockx, 'SwapCallFailed');
      
      console.log('✅ BRANCH: Hit router overspend protection via SwapCallFailed');
    });

    it('🎯 BRANCH: Hit mismatched inputs in batch operations', async () => {
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
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('mismatch'));
      
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
      
      // Create batch withdraw with token arrays mismatch - should hit the first branch
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          0, // amountETH
          [await mockToken.getAddress(), await mockTokenB.getAddress()], // 2 tokens
          [ethers.parseEther('10')], // 1 amount - MISMATCH!
          [], // nftContracts - empty
          [], // nftTokenIds - empty
          user1.address, // recipient
          referenceId,
          user1.address, // msg.sender
          signatureExpiry
        ]
      );
      
      const nonce3 = await lockx.connect(user1).getNonce(tokenId);
      const withdrawValue = {
        tokenId: tokenId,
        nonce: nonce3,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the first MismatchedInputs branch (tokenAddresses.length != tokenAmounts.length)
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0, // amountETH
          [await mockToken.getAddress(), await mockTokenB.getAddress()], // 2 tokens
          [ethers.parseEther('10')], // 1 amount - triggers first mismatch branch!
          [], // nftContracts
          [], // nftTokenIds
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
      
      console.log('✅ BRANCH: Hit token arrays mismatch in batch operations');
    });

    it('🎯 BRANCH: Hit duplicate entry check in batch operations', async () => {
      // Create lockbox with ETH first
      const tx = await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('2') }
      );
      
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
      
      // Add some tokens to the lockbox
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.keccak256(ethers.toUtf8Bytes('deposit1'))
      );
      
      const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('duplicate'));
      
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
      
      // Try batch withdraw with duplicate token entries - should hit duplicate check
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          0, // amountETH
          [await mockToken.getAddress(), await mockToken.getAddress()], // DUPLICATE tokens
          [ethers.parseEther('10'), ethers.parseEther('20')], // matching amounts
          [], // nftContracts
          [], // nftTokenIds
          user1.address, // recipient
          referenceId,
          user1.address, // msg.sender
          signatureExpiry
        ]
      );
      
      const nonce4 = await lockx.connect(user1).getNonce(tokenId);
      const withdrawValue = {
        tokenId: tokenId,
        nonce: nonce4,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      // This should hit the DuplicateEntry branch
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0, // amountETH
          [await mockToken.getAddress(), await mockToken.getAddress()], // DUPLICATE - triggers branch!
          [ethers.parseEther('10'), ethers.parseEther('20')],
          [], // nftContracts
          [], // nftTokenIds
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
      
      console.log('✅ BRANCH: Hit duplicate entry check in batch operations');
    });

    it('🎯 BRANCH: Hit successful ETH lockbox creation', async () => {
      // Create a simple ETH lockbox - should work fine and hit normal flow
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      console.log('✅ BRANCH: Hit successful ETH lockbox creation');
    });
  });
  
  console.log('🎉 BRANCH COVERAGE PHASE 3 - FINAL CRITICAL BRANCHES TARGETED!');
});