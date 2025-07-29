const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🚀 LOCKX BRANCH RECOVERY - TARGET 90%+', () => {
  let lockx, mockToken, mockNFT, owner, user1, user2, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy mock contracts
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.connect(owner).mint(user1.address, 1);
    await mockNFT.connect(owner).mint(user1.address, 2);
  });

  it('🎯 HIT CRITICAL MISSING BRANCHES FOR 90%+ COVERAGE', async () => {
    // ✅ HIT BRANCH: createLockboxWithBatch with assets
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    
    await lockx.connect(user1).createLockboxWithBatch(
      lockboxKeyPair.address,
      'Batch Lockbox',
      [await mockToken.getAddress()],
      [ethers.parseEther('10')],
      [await mockNFT.getAddress()],
      [1],
      { value: ethers.parseEther('1') }
    );
    
    const tokenId = 1;
    
    // ✅ HIT BRANCH: Test swap functionality branches
    const SwapRouter = await ethers.getContractFactory('MockSwapRouter');
    const swapRouter = await SwapRouter.deploy();
    
    await mockToken.connect(owner).transfer(await swapRouter.getAddress(), ethers.parseEther('1000'));
    
    // Create swap signature
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
    
    const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address', 'address', 'address', 'uint256', 'bytes', 'address'],
      [
        await mockToken.getAddress(),
        await mockToken.getAddress(),
        await swapRouter.getAddress(),
        ethers.parseEther('5'),
        '0x',
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
    
    // ✅ HIT BRANCH: swapInLockbox function
    await lockx.connect(user1).swapInLockbox(
      tokenId,
      swapMessageHash,
      swapSignature,
      await mockToken.getAddress(),
      await mockToken.getAddress(),
      await swapRouter.getAddress(),
      ethers.parseEther('5'),
      '0x',
      user1.address
    );
    
    // ✅ HIT BRANCH: Test URI setting branches
    const newNonce = 2;
    const uriData = ethers.AbiCoder.defaultAbiCoder().encode(['string'], ['https://newuri.com']);
    
    const uriValue = {
      tokenId: tokenId,
      nonce: newNonce,
      opType: 5, // SET_TOKEN_URI
      dataHash: ethers.keccak256(uriData)
    };
    
    const uriSignature = await lockboxKeyPair.signTypedData(domain, types, uriValue);
    const uriMessageHash = ethers.TypedDataEncoder.hash(domain, types, uriValue);
    
    // ✅ HIT BRANCH: setTokenURI function
    await lockx.connect(user1).setTokenURI(
      tokenId,
      uriMessageHash,
      uriSignature,
      'https://newuri.com'
    );
    
    // ✅ HIT BRANCH: tokenURI after setting custom URI
    const customURI = await lockx.tokenURI(tokenId);
    expect(customURI).to.equal('https://newuri.com');
    
    // ✅ HIT BRANCH: Test key rotation branches
    const newKeyPair = ethers.Wallet.createRandom();
    const rotateData = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [newKeyPair.address]);
    
    const rotateValue = {
      tokenId: tokenId,
      nonce: 3,
      opType: 0, // ROTATE_KEY
      dataHash: ethers.keccak256(rotateData)
    };
    
    const rotateSignature = await lockboxKeyPair.signTypedData(domain, types, rotateValue);
    const rotateMessageHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);
    
    // ✅ HIT BRANCH: rotateLockboxKey function
    await lockx.connect(user1).rotateLockboxKey(
      tokenId,
      rotateMessageHash,
      rotateSignature,
      newKeyPair.address
    );
    
    // ✅ HIT BRANCH: Verify key was rotated
    const newActiveKey = await lockx.connect(user1).getActiveLockboxPublicKeyForToken(tokenId);
    expect(newActiveKey).to.equal(newKeyPair.address);
    
    console.log('✅ Critical Lockx.sol branches hit for 90%+ coverage recovery!');
  });

  it('🎯 HIT WITHDRAWAL EDGE CASE BRANCHES', async () => {
    // Create lockbox with multiple assets
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    
    await lockx.connect(user1).createLockboxWithBatch(
      lockboxKeyPair.address,
      'Withdrawal Lockbox',
      [await mockToken.getAddress()],
      [ethers.parseEther('50')],
      [await mockNFT.getAddress()],
      [2],
      { value: ethers.parseEther('2') }
    );
    
    const tokenId = 2;
    
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
    
    // ✅ HIT BRANCH: Test batch withdrawal with mixed assets
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address[]', 'uint256[]', 'address[]', 'uint256[]', 'uint256', 'address'],
      [
        [await mockToken.getAddress()],
        [ethers.parseEther('25')],
        [await mockNFT.getAddress()],
        [2],
        ethers.parseEther('1'),
        user1.address
      ]
    );
    
    const batchValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };
    
    const batchSignature = await lockboxKeyPair.signTypedData(domain, types, batchValue);
    const batchMessageHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);
    
    // ✅ HIT BRANCH: batchWithdraw function with mixed assets
    await lockx.connect(user1).batchWithdraw(
      tokenId,
      batchMessageHash,
      batchSignature,
      [await mockToken.getAddress()],
      [ethers.parseEther('25')],
      [await mockNFT.getAddress()],
      [2],
      ethers.parseEther('1'),
      user1.address
    );
    
    console.log('✅ Additional withdrawal branches hit!');
  });

  it('🎯 HIT SIGNATURE VERIFICATION ERROR BRANCHES', async () => {
    // Create basic lockbox
    await lockx.connect(user1).createLockboxWithETH(
      lockboxKeyPair.address,
      'Error Test Lockbox',
      { value: ethers.parseEther('1') }
    );
    
    const tokenId = 3;
    
    const domain = {
      name: 'Lockx',
      version: '2',
      chainId: await ethers.provider.getNetwork().then(n => n.chainId),
      verifyingContract: await lockx.getAddress()
    };
    
    const types = {
      Operation: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'nonce', type: 'uint8' },
        { name: 'opType', type: 'uint8' },
        { name: 'dataHash', type: 'bytes32' }
      ]
    };
    
    // ✅ HIT BRANCH: InvalidSignature error branch
    const wrongKeyPair = ethers.Wallet.createRandom();
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address'],
      [ethers.parseEther('0.5'), user1.address]
    );
    
    const withdrawValue = {
      tokenId: tokenId,
      nonce: 1,
      opType: 1, // WITHDRAW_ETH
      dataHash: ethers.keccak256(withdrawData)
    };
    
    const badSignature = await wrongKeyPair.signTypedData(domain, types, withdrawValue);
    const withdrawMessageHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);
    
    try {
      await lockx.connect(user1).withdrawETH(
        tokenId,
        withdrawMessageHash,
        badSignature,
        ethers.parseEther('0.5'),
        user1.address
      );
      expect.fail('Should have reverted with InvalidSignature');
    } catch (error) {
      expect(error.message).to.include('InvalidSignature');
    }
    
    // ✅ HIT BRANCH: InvalidMessageHash error branch
    const wrongHash = ethers.keccak256(ethers.toUtf8Bytes('wrong'));
    const correctSignature = await lockboxKeyPair.signTypedData(domain, types, withdrawValue);
    
    try {
      await lockx.connect(user1).withdrawETH(
        tokenId,
        wrongHash,
        correctSignature,
        ethers.parseEther('0.5'),
        user1.address
      );
      expect.fail('Should have reverted with InvalidMessageHash');
    } catch (error) {
      expect(error.message).to.include('InvalidMessageHash');
    }
    
    console.log('✅ Signature verification error branches hit!');
  });
});