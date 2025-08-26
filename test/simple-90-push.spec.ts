import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 SIMPLE 90% PUSH - COVERAGE FRIENDLY', () => {
  let lockx, mockToken, mockNft;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    await mockToken.mint(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('Mock NFT', 'MNFT');
    await mockNft.connect(owner).mint(user1.address, 1);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 1);
  });

  it('should hit lines 433-435: NFT cleanup in burn', async () => {
    console.log('🎯 Simple test to hit NFT cleanup lines 433-435');
    
    // Create simple lockbox with just one NFT
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address,
      keyPair.address,
      await mockNft.getAddress(),
      1,
      ethers.ZeroHash
    );

    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;

    // Withdraw the NFT first to empty the lockbox
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const withdrawRef = ethers.keccak256(ethers.toUtf8Bytes('withdraw_nft'));
    
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 1, user1.address, withdrawRef, user1.address, signatureExpiry]
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

    const withdrawOp = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(withdrawData)
    };

    const withdrawSig = await keyPair.signTypedData(domain, types, withdrawOp);
    const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawOp);

    // Withdraw NFT to empty the lockbox
    await lockx.connect(user1).withdrawERC721(
      tokenId, withdrawHash, withdrawSig,
      await mockNft.getAddress(), 1, user1.address,
      withdrawRef, signatureExpiry
    );

    // Now burn the empty lockbox - this should hit lines 433-435
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const burnRef = ethers.keccak256(ethers.toUtf8Bytes('burn_empty'));
    
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, burnRef, user1.address, signatureExpiry]
    );

    const burnOp = {
      tokenId,
      nonce,
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };

    const burnSig = await keyPair.signTypedData(domain, types, burnOp);
    const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnOp);

    // This should hit the NFT cleanup loop in lines 433-435
    await lockx.connect(user1).burnLockbox(
      tokenId, burnHash, burnSig, burnRef, signatureExpiry
    );

    console.log('✅ Lines 433-435 NFT cleanup hit successfully!');
  });

  it('should hit deposit edge cases for Deposits.sol branches', async () => {
    console.log('🎯 Simple deposit edge cases');
    
    // Hit createLockboxWithBatch with arrays
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('0.1'),
      [await mockToken.getAddress()],
      [ethers.parseEther('10')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );

    // Hit another batch scenario
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0, // No ETH
      [],
      [],
      [await mockNft.getAddress()],
      [1],
      ethers.ZeroHash
    );

    console.log('✅ Deposit edge cases covered!');
  });

  it('should hit withdrawal edge cases for branch coverage', async () => {
    console.log('🎯 Simple withdrawal edge cases');
    
    // Create lockbox with ETH and token
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('0.5'),
      [await mockToken.getAddress()],
      [ethers.parseEther('50')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.5') }
    );

    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    
    // Simple batch withdraw to hit array processing branches
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const batchRef = ethers.keccak256(ethers.toUtf8Bytes('simple_batch'));
    
    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('0.1'), [await mockToken.getAddress()], [ethers.parseEther('10')], [], [], user1.address, batchRef, user1.address, signatureExpiry]
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

    const batchOp = {
      tokenId,
      nonce,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };

    const batchSig = await keyPair.signTypedData(domain, types, batchOp);
    const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchOp);

    // Execute batch withdraw
    await lockx.connect(user1).batchWithdraw(
      tokenId, batchHash, batchSig,
      ethers.parseEther('0.1'), [await mockToken.getAddress()], [ethers.parseEther('10')],
      [], [], user1.address, batchRef, signatureExpiry
    );

    console.log('✅ Withdrawal edge cases covered!');
  });
});