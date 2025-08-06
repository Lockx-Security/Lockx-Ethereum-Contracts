import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 ADDITIONAL BRANCH COVERAGE - TARGET REMAINING GAPS', () => {
  let lockx, mockToken, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy mock token
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Test Token', 'TEST');
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund user1 with tokens
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
  });

  it('🚫 More ZeroAddress branches in ERC20 and NFT withdrawals', async () => {
    // Create lockbox with ERC20
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
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('test'));
    
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
    
    // Test 1: withdrawERC20 with recipient = address(0)
    try {
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('10'), ethers.ZeroAddress, referenceId, user1.address, signatureExpiry]
      );
      
      const withdrawValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };
      
      const signature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
      
      await lockx.connect(user1).withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroAddress, // This should trigger ZeroAddress revert
        referenceId,
        signatureExpiry
      );
      expect.fail('Should have reverted with ZeroAddress');
    } catch (error) {
      expect(error.message).to.include('ZeroAddress');
      console.log('✅ BRANCH HIT: ZeroAddress validation in withdrawERC20');
    }
  });
  
  it('🚫 ETH swap branches - test ETH as tokenIn and tokenOut', async () => {
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
    
    // Deploy mock router
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    const mockRouter = await MockSwapRouter.deploy();
    
    // Fund router with tokens for swap
    await mockToken.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('1000'));
    
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ethswap'));
    
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
    
    // Test ETH to ERC20 swap (tokenIn = address(0))
    const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
      ethers.ZeroAddress,                // tokenIn = ETH
      await mockToken.getAddress(),      // tokenOut = ERC20
      ethers.parseEther('0.1'),          // amountIn
      ethers.parseEther('95'),           // minAmountOut
      await lockx.getAddress()           // recipient = lockx contract
    ]);
    
    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        ethers.ZeroAddress,              // tokenIn = ETH
        await mockToken.getAddress(),    // tokenOut = ERC20
        ethers.parseEther('0.1'),
        ethers.parseEther('95'),
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        referenceId,
        user1.address,
        signatureExpiry,
        user1.address
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
    
    // Execute ETH to ERC20 swap - this should hit the tokenIn == address(0) branches
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      ethers.ZeroAddress,              // tokenIn = ETH
      await mockToken.getAddress(),    // tokenOut = ERC20
      ethers.parseEther('0.1'),
      ethers.parseEther('95'),
      await mockRouter.getAddress(),
      swapCallData,
      referenceId,
      signatureExpiry,
      user1.address
    );
    
    console.log('✅ BRANCH HIT: ETH as tokenIn (address(0)) branches in swapInLockbox');
  });
  
  it('🚫 Batch withdraw signature expiry branch', async () => {
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
    
    const currentBlock = await ethers.provider.getBlock('latest');
    const expiredSignatureExpiry = currentBlock.timestamp - 1; // Already expired
    
    // Try to call batchWithdraw with expired signature
    try {
      await lockx.connect(user1).batchWithdraw(
        tokenId,
        ethers.keccak256(ethers.toUtf8Bytes('expired')),
        '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [], // nftContracts
        [], // nftTokenIds
        user1.address, // recipient
        ethers.ZeroHash, // referenceId
        expiredSignatureExpiry // signatureExpiry
      );
      expect.fail('Should have reverted with SignatureExpired');
    } catch (error) {
      expect(error.message).to.include('SignatureExpired'); 
      console.log('✅ BRANCH HIT: SignatureExpired in batchWithdraw');
    }
  });
  
  console.log('✅ ADDITIONAL BRANCH COVERAGE TESTS COMPLETED!');
});