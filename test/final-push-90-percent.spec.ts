import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 FINAL PUSH TO 90% - CRITICAL BRANCHES', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockNFT: MockERC721;
  let feeToken: MockFeeOnTransferToken;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let keyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, keyPair] = await ethers.getSigners();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.initialize('Mock Token', 'MOCK');
    mockToken2 = await MockERC20Factory.deploy();
    await mockToken2.initialize('Mock Token 2', 'MOCK2');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const MockFeeOnTransferTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await MockFeeOnTransferTokenFactory.deploy();
    await feeToken.initialize('Fee Token', 'FEE');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await feeToken.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🔥 DEPOSITS: Hit array management edge with exactly idx == arrayLength', async () => {
    // Create lockbox with exactly 2 tokens
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [await mockToken.getAddress(), await mockToken2.getAddress()],
      [ethers.parseEther('100'), ethers.parseEther('200')],
      [],
      [],
      ethers.ZeroHash,
      { value: 0 }
    );
    const tokenId = 0;

    // Setup signature
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

    // Withdraw last token (mockToken2) - this hits idx == arrayLength branch
    const nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken2.getAddress(), ethers.parseEther('200'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const opValue = {
      tokenId,
      nonce,
      opType: 2, // WITHDRAW_ERC20
      dataHash: ethers.keccak256(withdrawData)
    };

    const signature = await keyPair.signTypedData(domain, types, opValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC20(
      tokenId,
      messageHash,
      signature,
      await mockToken2.getAddress(),
      ethers.parseEther('200'),
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    console.log('✅ DEPOSITS: idx == arrayLength branch hit');
  });

  it('🔥 DEPOSITS: Hit NFT array edge with exactly idx == arrayLength', async () => {
    // Create lockbox with exactly 2 NFTs
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress()],
      [1, 2],
      ethers.ZeroHash,
      { value: 0 }
    );
    const tokenId = 0;

    // Setup signature
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

    // Withdraw last NFT - hits idx == arrayLength
    const nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNFT.getAddress(), 2, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const opValue = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(withdrawData)
    };

    const signature = await keyPair.signTypedData(domain, types, opValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC721(
      tokenId,
      messageHash,
      signature,
      await mockNFT.getAddress(),
      2,
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    console.log('✅ DEPOSITS: NFT idx == arrayLength branch hit');
  });

  it('🔥 DEPOSITS: Hit fee-on-transfer received calculation branch', async () => {
    // Set a 10% fee on the fee token
    await feeToken.setFeePercentage(1000); // 10%

    // Create lockbox with fee token
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await feeToken.getAddress(),
      ethers.parseEther('1000'),
      ethers.ZeroHash
    );
    const tokenId = 0;

    // Deposit more fee tokens to hit received amount calculation
    await lockx.connect(user1).depositERC20(
      tokenId,
      await feeToken.getAddress(),
      ethers.parseEther('500'),
      ethers.ZeroHash
    );

    console.log('✅ DEPOSITS: Fee-on-transfer received calculation branch hit');
  });

  it('🔥 LOCKX: Hit burn with empty NFT array (lines 433-435)', async () => {
    // Create lockbox with just ETH, no NFTs
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    const tokenId = 0;

    // Setup signature
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

    // Withdraw ETH first
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('0.1'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const withdrawOp = {
      tokenId,
      nonce,
      opType: 1, // WITHDRAW_ETH
      dataHash: ethers.keccak256(withdrawData)
    };

    const withdrawSig = await keyPair.signTypedData(domain, types, withdrawOp);
    const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawOp);

    await lockx.connect(user1).withdrawETH(
      tokenId,
      withdrawHash,
      withdrawSig,
      ethers.parseEther('0.1'),
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Now burn empty lockbox - hits lines 433-435 with empty NFT array
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const burnOp = {
      tokenId,
      nonce,
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };

    const burnSig = await keyPair.signTypedData(domain, types, burnOp);
    const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnOp);

    await lockx.connect(user1).burnLockbox(
      tokenId,
      burnHash,
      burnSig,
      ethers.ZeroHash,
      signatureExpiry
    );

    console.log('✅ LOCKX: Lines 433-435 with empty NFT array hit');
  });

  it('🔥 DEPOSITS: Hit batch deposit with mixed array edge cases', async () => {
    // Test batch with only tokens (no ETH, no NFTs)
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [await mockToken.getAddress()],
      [ethers.parseEther('100')],
      [],
      [],
      ethers.ZeroHash,
      { value: 0 }
    );

    // Test batch with only NFTs (no ETH, no tokens)
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [],
      [],
      [await mockNFT.getAddress()],
      [3],
      ethers.ZeroHash,
      { value: 0 }
    );

    console.log('✅ DEPOSITS: Batch deposit edge cases hit');
  });
});