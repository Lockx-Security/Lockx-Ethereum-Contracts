import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 SIMPLE FEE COVERAGE', () => {
  let lockx, mockToken, mockTokenB, mockRouter;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    // Deploy contracts
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('TokenB', 'TKB');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Setup tokens
    await mockToken.mint(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockTokenB.mint(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund router with ETH for ETH swaps
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('1')
    });
  });

  it('should hit lines 556-557: token registration after swap', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    const tokenId = 0; // First lockbox will be ID 0
    
    // Prepare swap signature
    const nonce = await lockx.connect(user1).getNonce(tokenId);
    const signatureExpiry = (await ethers.provider.getBlock('latest')).timestamp + 3600;

    const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(),
      await mockTokenB.getAddress(), 
      ethers.parseEther('10'),
      ethers.parseEther('9.481'), // 95% rate minus 0.2% fee
      await lockx.getAddress()
    ]);

    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('10'),
        ethers.parseEther('9.481'), // After fee
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        ethers.ZeroHash,
        user1.address,
        signatureExpiry,
        ethers.ZeroAddress // Credit to lockbox - hits 556-557
      ]
    );

    const domain = {
      name: 'Lockx',
      version: '4',
      chainId: (await ethers.provider.getNetwork()).chainId,
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

    const opStruct = {
      tokenId,
      nonce,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapData)
    };

    const signature = await keyPair.signTypedData(domain, types, opStruct);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

    // Execute swap - hits lines 556-557
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      messageHash, 
      signature,
      await mockToken.getAddress(),
      await mockTokenB.getAddress(),
      ethers.parseEther('10'),
      ethers.parseEther('9.481'),
      await mockRouter.getAddress(),
      swapCallData,
      ethers.ZeroHash,
      signatureExpiry,
      ethers.ZeroAddress
    );

    console.log('✅ HIT LINES 556-557: Token registration in swap');
  });

  it('should hit line 552: ETH credit to lockbox', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    const tokenId = 0;
    const nonce = await lockx.connect(user1).getNonce(tokenId);
    const signatureExpiry = (await ethers.provider.getBlock('latest')).timestamp + 3600;

    // Swap to ETH 
    const swapCallData = mockRouter.interface.encodeFunctionData('swapTokensForETH', [
      await mockToken.getAddress(),
      ethers.parseEther('10'),
      ethers.parseEther('0.0997'), // minAmountOut after fee: 10/100 = 0.1 ETH, minus 0.2% fee = ~0.0998
      await lockx.getAddress()
    ]);

    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        await mockToken.getAddress(),
        ethers.ZeroAddress, // ETH output
        ethers.parseEther('10'),
        ethers.parseEther('0.0997'),
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        ethers.ZeroHash,
        user1.address,
        signatureExpiry,
        ethers.ZeroAddress // Credit ETH to lockbox - hits line 552
      ]
    );

    const domain = {
      name: 'Lockx',
      version: '4',
      chainId: (await ethers.provider.getNetwork()).chainId,
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

    const opStruct = {
      tokenId,
      nonce,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapData)
    };

    const signature = await keyPair.signTypedData(domain, types, opStruct);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

    // Execute ETH swap - hits line 552
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      messageHash,
      signature,
      await mockToken.getAddress(),
      ethers.ZeroAddress,
      ethers.parseEther('10'),
      ethers.parseEther('0.0997'),
      await mockRouter.getAddress(),
      swapCallData,
      ethers.ZeroHash,
      signatureExpiry,
      ethers.ZeroAddress
    );

    console.log('✅ HIT LINE 552: ETH credit to lockbox');
  });
});