import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 COVERAGE BOOST FINAL - TARGET 90%+', () => {
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

    // Setup - matching working pattern from swap-functionality.spec.ts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockTokenB.connect(owner).transfer(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Approve lockx contract to spend mock router's tokens
    await mockTokenB.connect(owner).approve(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    // Fund router with ETH for ETH swaps
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('1')
    });
  });

  it('should test swap with recipient = address(0) to hit lines 552, 556-557', async () => {
    // Approve lockx to spend user1's tokens
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    
    // Create lockbox
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    // Use working swap test pattern from swap-functionality.spec.ts
    const tokenId = 0;

    // Get lockbox data before
    const beforeData = await lockx.connect(user1).getFullLockbox(tokenId);
    console.log('Before tokens:', beforeData[1].length);

    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('swap1'));

    // Use minimal approach - just test more swaps to get different code paths
    const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(),
      await mockTokenB.getAddress(),
      ethers.parseEther('5'),
      ethers.parseEther('4.74'), // Account for 0.2% fee
      await lockx.getAddress()
    ]);

    // Build swap data matching working pattern
    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [
        tokenId,
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('5'),
        ethers.parseEther('4.74'),
        await mockRouter.getAddress(),
        ethers.keccak256(swapCallData),
        referenceId,
        user1.address,
        signatureExpiry,
        ethers.ZeroAddress  // This should hit lines 556-557
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
      tokenId: tokenId,
      nonce: nonce,
      opType: 7, // SWAP_ASSETS
      dataHash: ethers.keccak256(swapData)
    };

    const swapSignature = await keyPair.signTypedData(domain, types, swapValue);
    const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

    // Execute swap with recipient = 0 to credit lockbox
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      await mockToken.getAddress(),
      await mockTokenB.getAddress(),
      ethers.parseEther('5'),
      ethers.parseEther('4.74'),
      await mockRouter.getAddress(),
      swapCallData,
      referenceId,
      signatureExpiry,
      ethers.ZeroAddress  // This should trigger lines 556-557
    );

    // Check if new token was registered
    const afterData = await lockx.connect(user1).getFullLockbox(tokenId);
    console.log('After tokens:', afterData[1].length);
    expect(afterData[1].length).to.equal(2); // Should have both tokens now

    console.log('✅ HIT LINES 556-557: Token registration in lockbox after swap');
  });

});