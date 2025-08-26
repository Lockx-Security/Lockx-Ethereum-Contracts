import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockSwapRouter } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 PHASE 9: Breakthrough - Target Uncovered Withdrawals Branches', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockNFT: MockERC721;
  let mockRouter: MockSwapRouter;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let lockboxKeyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.initialize('Mock Token', 'MOCK');
    mockToken2 = await MockERC20Factory.deploy();
    await mockToken2.initialize('Mock Token 2', 'MOCK2');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouterFactory.deploy();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances - MockERC20 initializes with 1M tokens to deployer
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockToken2.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user1.address, 3);

    // Fund swap router for testing
    await mockToken.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockToken2.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await owner.sendTransaction({ to: await mockRouter.getAddress(), value: ethers.parseEther('10') });

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🎯 BRANCH: Hit nftContracts.length != nftTokenIds.length in batchWithdraw', async () => {
    // Create lockbox with some assets
    const tx = await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('1'),
      [await mockToken.getAddress()],
      [ethers.parseEther('10')],
      [await mockNFT.getAddress()],
      [1],
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

    // Create signature for batch withdraw with mismatched NFT arrays
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
    
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('batch'));
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [ethers.parseEther('0.5'), [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [1], user2.address, referenceId, user1.address, signatureExpiry]
    );
    
    const batchValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, batchValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

    // Call with nftContracts.length (2) != nftTokenIds.length (1) - should hit uncovered branch
    await expect(
      lockx.connect(user1).batchWithdraw(
        tokenId,
        messageHash,
        signature,
        ethers.parseEther('0.5'), // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // 2 contracts
        [1], // 1 token ID - MISMATCH!
        user2.address, // recipient
        ethers.ZeroHash, // referenceId
        signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
  });

  it('🎯 BRANCH: Hit duplicate NFT detection in batchWithdraw', async () => {
    // Create lockbox with multiple NFTs
    const tx = await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      lockboxKeyPair.address,
      ethers.parseEther('1'),
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress()],
      [1, 2],
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

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
    
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('duplicate'));
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [1, 1], user2.address, referenceId, user1.address, signatureExpiry]
    );
    
    const batchValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, batchValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

    // Try to withdraw same NFT twice - should hit duplicate detection branch
    await expect(
      lockx.connect(user1).batchWithdraw(
        tokenId,
        messageHash,
        signature,
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // same contract
        [1, 1], // DUPLICATE token IDs!
        user2.address,
        ethers.ZeroHash,
        signatureExpiry
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
  });

  it('🎯 BRANCH: Hit ETH transfer to external recipient in swapInLockbox', async () => {
    // Create lockbox with ERC20 tokens
    const tx = await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      lockboxKeyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('10'),
      ethers.ZeroHash
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

    // Router already funded in beforeEach

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

    const referenceId = ethers.ZeroHash;
    const swapData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(), // tokenIn
      ethers.ZeroAddress, // tokenOut (ETH)
      ethers.parseEther('5'), // amountIn
      ethers.parseEther('0.1'), // minAmountOut
      user2.address // recipient (external!)
    ]);

    const swapEncodeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'address', 'uint256', 'address'],
      [await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther('5'), ethers.parseEther('0.1'), await mockRouter.getAddress(), swapData, referenceId, user1.address, signatureExpiry, user2.address]
    );
    
    const swapValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapEncodeData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // This should hit the ETH transfer to external recipient branch (lines 1783-1784)
    await expect(
      lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(), // tokenIn
        ethers.ZeroAddress, // tokenOut (ETH)
        ethers.parseEther('5'), // amountIn
        ethers.parseEther('0.1'), // minAmountOut
        await mockRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry,
        user2.address // external recipient - this triggers the branch!
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
  });

  it('🎯 BRANCH: Hit new token registration in swapInLockbox (line 1794)', async () => {
    // Create lockbox with only ETH
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
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

    // Router uses fixed 950 tokens per ETH rate

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

    const swapData = mockRouter.interface.encodeFunctionData('swap', [
      ethers.ZeroAddress, // tokenIn (ETH)
      await mockToken.getAddress(), // tokenOut
      ethers.parseEther('0.5'), // amountIn
      ethers.parseEther('4'), // minAmountOut
      ethers.ZeroAddress // recipient = lockbox
    ]);

    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('newtoken'));
    const swapEncodeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'address', 'uint256', 'address'],
      [ethers.ZeroAddress, await mockToken.getAddress(), ethers.parseEther('0.5'), ethers.parseEther('400'), await mockRouter.getAddress(), swapData, referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
    );
    
    const swapValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapEncodeData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // This should trigger new token registration (line 1794) since lockbox has no ERC20 balances yet
    await expect(
      lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        ethers.ZeroAddress, // tokenIn (ETH)
        await mockToken.getAddress(), // tokenOut (NEW token for this lockbox!)
        ethers.parseEther('0.5'), // amountIn
        ethers.parseEther('400'), // minAmountOut (0.5 ETH * 950 rate = 475 tokens)
        await mockRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry,
        ethers.ZeroAddress // recipient = lockbox (triggers registration)
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
  });

  it('🎯 BRANCH: Hit insufficient ETH balance in swapInLockbox', async () => {
    // Create lockbox with minimal ETH
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
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

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

    const swapData = mockRouter.interface.encodeFunctionData('swap', [
      ethers.ZeroAddress, // tokenIn (ETH)
      await mockToken.getAddress(), // tokenOut
      ethers.parseEther('1'), // amountIn (MORE than available!)
      ethers.parseEther('5'), // minAmountOut
      ethers.ZeroAddress // recipient
    ]);

    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('insufficient'));
    const swapEncodeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'address', 'uint256', 'address'],
      [ethers.ZeroAddress, await mockToken.getAddress(), ethers.parseEther('1'), ethers.parseEther('5'), await mockRouter.getAddress(), swapData, referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
    );
    
    const swapValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapEncodeData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // Should hit NoETHBalance error (line 1703)
    await expect(
      lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        ethers.ZeroAddress, // tokenIn (ETH)
        await mockToken.getAddress(), // tokenOut
        ethers.parseEther('1'), // amountIn > balance
        ethers.parseEther('5'), // minAmountOut
        await mockRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry,
        ethers.ZeroAddress // recipient
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
  });

  it('🎯 BRANCH: Hit insufficient ERC20 balance in swapInLockbox', async () => {
    // Create lockbox with minimal tokens
    const tx = await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      lockboxKeyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('1'), // small amount
      ethers.ZeroHash
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

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

    const swapData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(), // tokenIn
      ethers.ZeroAddress, // tokenOut (ETH)
      ethers.parseEther('10'), // amountIn (MORE than available!)
      ethers.parseEther('0.5'), // minAmountOut
      ethers.ZeroAddress // recipient
    ]);

    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('insufficientToken'));
    const swapEncodeData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'address', 'uint256', 'address'],
      [await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther('10'), ethers.parseEther('0.5'), await mockRouter.getAddress(), swapData, referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
    );
    
    const swapValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapEncodeData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // Should hit InsufficientTokenBalance error (line 1705)
    await expect(
      lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(), // tokenIn
        ethers.ZeroAddress, // tokenOut (ETH)
        ethers.parseEther('10'), // amountIn > balance
        ethers.parseEther('0.5'), // minAmountOut
        await mockRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry,
        ethers.ZeroAddress // recipient
      )
    ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
  });
});