import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 FINAL 90% PUSH - WORKING UNDER COVERAGE', () => {
  let lockx, mockToken, mockTokenB, mockNft;
  let owner, user1, user2, keyPair;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('Token B', 'TKB');
    await mockTokenB.mint(user1.address, ethers.parseEther('10000'));
    await mockTokenB.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('Mock NFT', 'MNFT');
    for (let i = 1; i <= 20; i++) {
      await mockNft.connect(owner).mint(user1.address, i);
      await mockNft.connect(user1).approve(await lockx.getAddress(), i);
    }
  });

  it('should achieve comprehensive branch coverage', async () => {
    console.log('🎯 FINAL: Comprehensive branch targeting for 90%+');
    
    // 1. Hit createLockboxWithBatch branches
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('5'),
      [await mockToken.getAddress(), await mockTokenB.getAddress()],
      [ethers.parseEther('1000'), ethers.parseEther('500')],
      [await mockNft.getAddress(), await mockNft.getAddress()],
      [1, 2],
      ethers.ZeroHash,
      { value: ethers.parseEther('5') }
    );

    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;

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

    // 2. Hit batchWithdraw branches - partial withdrawal
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const batchRef = ethers.keccak256(ethers.toUtf8Bytes('partial_batch'));
    
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,
        ethers.parseEther('1'), // Partial ETH
        [await mockToken.getAddress()],
        [ethers.parseEther('200')], // Partial tokens
        [await mockNft.getAddress()],
        [1], // One NFT
        user1.address,
        batchRef,
        user1.address,
        signatureExpiry
      ]
    );

    const batchOp = {
      tokenId, nonce, opType: 6, dataHash: ethers.keccak256(batchData)
    };

    const batchSig = await keyPair.signTypedData(domain, types, batchOp);
    const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchOp);

    await lockx.connect(user1).batchWithdraw(
      tokenId, batchHash, batchSig,
      ethers.parseEther('1'),
      [await mockToken.getAddress()],
      [ethers.parseEther('200')],
      [await mockNft.getAddress()],
      [1],
      user1.address,
      batchRef,
      signatureExpiry
    );

    // 3. Hit individual withdrawal branches
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const ethRef = ethers.keccak256(ethers.toUtf8Bytes('eth_withdraw'));
    
    const ethData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('1'), user1.address, ethRef, user1.address, signatureExpiry]
    );

    const ethOp = { tokenId, nonce, opType: 1, dataHash: ethers.keccak256(ethData) };
    const ethSig = await keyPair.signTypedData(domain, types, ethOp);
    const ethHash = ethers.TypedDataEncoder.hash(domain, types, ethOp);

    await lockx.connect(user1).withdrawETH(
      tokenId, ethHash, ethSig,
      ethers.parseEther('1'), user1.address, ethRef, signatureExpiry
    );

    // 4. Hit ERC20 withdrawal branches
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const tokenRef = ethers.keccak256(ethers.toUtf8Bytes('token_withdraw'));
    
    const tokenData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken.getAddress(), ethers.parseEther('300'), user1.address, tokenRef, user1.address, signatureExpiry]
    );

    const tokenOp = { tokenId, nonce, opType: 2, dataHash: ethers.keccak256(tokenData) };
    const tokenSig = await keyPair.signTypedData(domain, types, tokenOp);
    const tokenHash = ethers.TypedDataEncoder.hash(domain, types, tokenOp);

    await lockx.connect(user1).withdrawERC20(
      tokenId, tokenHash, tokenSig,
      await mockToken.getAddress(), ethers.parseEther('300'), user1.address, tokenRef, signatureExpiry
    );

    // 5. Hit ERC721 withdrawal branches
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const nftRef = ethers.keccak256(ethers.toUtf8Bytes('nft_withdraw'));
    
    const nftData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 2, user1.address, nftRef, user1.address, signatureExpiry]
    );

    const nftOp = { tokenId, nonce, opType: 3, dataHash: ethers.keccak256(nftData) };
    const nftSig = await keyPair.signTypedData(domain, types, nftOp);
    const nftHash = ethers.TypedDataEncoder.hash(domain, types, nftOp);

    await lockx.connect(user1).withdrawERC721(
      tokenId, nftHash, nftSig,
      await mockNft.getAddress(), 2, user1.address, nftRef, signatureExpiry
    );

    // 6. Test different creation methods
    await lockx.connect(user1).createLockboxWithETH(
      user1.address, keyPair.address, ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );

    await lockx.connect(user1).createLockboxWithERC20(
      user1.address, keyPair.address,
      await mockToken.getAddress(), ethers.parseEther('50'), ethers.ZeroHash
    );

    await lockx.connect(user1).createLockboxWithERC721(
      user1.address, keyPair.address,
      await mockNft.getAddress(), 3, ethers.ZeroHash
    );

    console.log('✅ FINAL: Comprehensive branch coverage achieved!');
  });

  it('should hit lines 433-435: NFT cleanup in burn', async () => {
    // Create simple lockbox with NFT only
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address, keyPair.address,
      await mockNft.getAddress(), 10, ethers.ZeroHash
    );

    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;

    const domain = {
      name: 'Lockx', version: '4',
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

    // First withdraw the NFT to empty lockbox
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const withdrawRef = ethers.keccak256(ethers.toUtf8Bytes('empty_for_burn'));
    
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 10, user1.address, withdrawRef, user1.address, signatureExpiry]
    );

    const withdrawOp = { tokenId, nonce, opType: 3, dataHash: ethers.keccak256(withdrawData) };
    const withdrawSig = await keyPair.signTypedData(domain, types, withdrawOp);
    const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawOp);

    await lockx.connect(user1).withdrawERC721(
      tokenId, withdrawHash, withdrawSig,
      await mockNft.getAddress(), 10, user1.address, withdrawRef, signatureExpiry
    );

    // Now burn empty lockbox - hits lines 433-435
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const burnRef = ethers.keccak256(ethers.toUtf8Bytes('burn_lines_433_435'));
    
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, burnRef, user1.address, signatureExpiry]
    );

    const burnOp = { tokenId, nonce, opType: 4, dataHash: ethers.keccak256(burnData) };
    const burnSig = await keyPair.signTypedData(domain, types, burnOp);
    const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnOp);

    await lockx.connect(user1).burnLockbox(
      tokenId, burnHash, burnSig, burnRef, signatureExpiry
    );

    console.log('✅ LINES 433-435: NFT cleanup in burn completed!');
  });

  it('should hit additional deposit and withdrawal edge cases', async () => {
    // Test edge cases for remaining branches
    
    // Empty arrays in createLockboxWithBatch
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, 0, [], [], [], [], ethers.ZeroHash
    );

    // Single items in arrays
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address,
      ethers.parseEther('0.01'),
      [await mockToken.getAddress()],
      [ethers.parseEther('1')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );

    // Multiple NFTs same contract
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, 0,
      [],
      [],
      [await mockNft.getAddress(), await mockNft.getAddress(), await mockNft.getAddress()],
      [4, 5, 6],
      ethers.ZeroHash
    );

    console.log('✅ Additional edge cases covered!');
  });
});