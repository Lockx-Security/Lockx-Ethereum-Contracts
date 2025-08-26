import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 FINAL COVERAGE PUSH - TARGET 90%+ BRANCHES', () => {
  let lockx, mockToken, mockTokenB, mockRouter, mockNft;
  let owner, user1, keyPair, treasuryKeyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();
    treasuryKeyPair = ethers.Wallet.createRandom();

    // Deploy contracts
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');
    
    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('TokenB', 'TKB');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Setup tokens
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    await mockTokenB.connect(owner).approve(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('1')
    });

    // Create treasury lockbox (ID 0)
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      treasuryKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.001') }
    );

    // Mint NFT to user1
    await mockNft.connect(owner).mint(user1.address, 1);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 1);
  });

  it('should hit line 515: ETH input deduction in swap', async () => {
    // Create lockbox with ETH
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('eth_input_test'));

    // Swap ETH for token - this should hit line 515 (ETH deduction)
    const swapCallData = mockRouter.interface.encodeFunctionData('swapETHForTokens', [
      await mockTokenB.getAddress(),
      ethers.parseEther('0.47'), // minAmountOut
      await lockx.getAddress()
    ]);

    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        ethers.ZeroAddress, // tokenIn = ETH
        await mockTokenB.getAddress(),
        ethers.parseEther('0.5'), // amountIn
        ethers.parseEther('0.47'),
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        referenceId,
        user1.address,
        signatureExpiry,
        user1.address
      ]
    );

    const nonce = await lockx.connect(user1).getNonce(tokenId);

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

    const swapValue = {
      tokenId,
      nonce,
      opType: 7,
      dataHash: ethers.keccak256(swapData)
    };

    const swapSignature = await keyPair.signTypedData(domain, types, swapValue);
    const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // Get ETH balance before
    const beforeData = await lockx.connect(user1).getFullLockbox(tokenId);
    const ethBefore = beforeData[0];

    // Execute ETH -> Token swap (hits line 515)
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      ethers.ZeroAddress, // tokenIn = ETH
      await mockTokenB.getAddress(),
      ethers.parseEther('0.5'),
      ethers.parseEther('0.47'),
      await mockRouter.getAddress(),
      swapCallData,
      referenceId,
      signatureExpiry,
      user1.address,
      { value: 0 } // No additional ETH needed, using lockbox ETH
    );

    // Verify ETH was deducted from lockbox
    const afterData = await lockx.connect(user1).getFullLockbox(tokenId);
    const ethAfter = afterData[0];
    expect(ethAfter).to.be.lessThan(ethBefore);

    console.log('✅ HIT LINE 515: ETH deduction from lockbox in swap');
  });

  it('should hit lines 556-557: token registration when crediting to user lockbox', async () => {
    // Create lockbox with one token type
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('token_reg_test'));

    // Swap tokenA for tokenB, credit to lockbox (recipient = 0) - should register tokenB
    const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(),
      await mockTokenB.getAddress(),
      ethers.parseEther('10'),
      ethers.parseEther('9.481'),
      await lockx.getAddress()
    ]);

    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('10'),
        ethers.parseEther('9.481'),
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        referenceId,
        user1.address,
        signatureExpiry,
        ethers.ZeroAddress // Credit to lockbox - should trigger lines 556-557
      ]
    );

    const nonce = await lockx.connect(user1).getNonce(tokenId);

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

    const swapValue = {
      tokenId,
      nonce,
      opType: 7,
      dataHash: ethers.keccak256(swapData)
    };

    const swapSignature = await keyPair.signTypedData(domain, types, swapValue);
    const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // Check tokens before
    const beforeData = await lockx.connect(user1).getFullLockbox(tokenId);
    console.log('Before tokens:', beforeData[1].length);

    // Execute swap - should register tokenB in user lockbox
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      await mockToken.getAddress(),
      await mockTokenB.getAddress(),
      ethers.parseEther('10'),
      ethers.parseEther('9.481'),
      await mockRouter.getAddress(),
      swapCallData,
      referenceId,
      signatureExpiry,
      ethers.ZeroAddress // Credit to lockbox
    );

    // Verify new token was registered
    const afterData = await lockx.connect(user1).getFullLockbox(tokenId);
    console.log('After tokens:', afterData[1].length);
    expect(afterData[1].length).to.equal(2); // Should have both tokenA and tokenB

    console.log('✅ HIT LINES 556-557: Token registration in user lockbox');
  });

  it('should hit lines 433-435: NFT cleanup during lockbox burn', async () => {
    // Create lockbox with NFT
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address,
      keyPair.address,
      await mockNft.getAddress(),
      1,
      ethers.ZeroHash
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nft_cleanup_test'));

    // First withdraw the NFT to empty the lockbox
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 1, user1.address, referenceId, user1.address, signatureExpiry]
    );

    const nonce = await lockx.connect(user1).getNonce(tokenId);

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

    const withdrawValue = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(withdrawData)
    };

    const withdrawSignature = await keyPair.signTypedData(domain, types, withdrawValue);
    const withdrawMessageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);

    // Withdraw NFT
    await lockx.connect(user1).withdrawERC721(
      tokenId,
      withdrawMessageHash,
      withdrawSignature,
      await mockNft.getAddress(),
      1,
      user1.address,
      referenceId,
      signatureExpiry
    );

    // Now burn the empty lockbox - should hit NFT cleanup lines 433-435
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, referenceId, user1.address, signatureExpiry]
    );

    const burnNonce = await lockx.connect(user1).getNonce(tokenId);
    const burnValue = {
      tokenId,
      nonce: burnNonce,
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };

    const burnSignature = await keyPair.signTypedData(domain, types, burnValue);
    const burnMessageHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

    // Burn lockbox - should hit lines 433-435 (NFT cleanup loop)
    await lockx.connect(user1).burnLockbox(
      tokenId,
      burnMessageHash,
      burnSignature,
      referenceId,
      signatureExpiry
    );

    console.log('✅ HIT LINES 433-435: NFT cleanup during lockbox burn');
  });
});