import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🚀 FINAL PUSH TO 90%+', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockToken3: MockERC20;
  let mockNFT: MockERC721;
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
    mockToken3 = await MockERC20Factory.deploy();
    await mockToken3.initialize('Mock Token 3', 'MOCK3');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await mockToken3.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 5; i++) {
      await mockNFT.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken3.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🔥 DEPOSITS: Hit all array management branches with exactly 3 tokens', async () => {
    // Create lockbox with exactly 3 tokens
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [await mockToken.getAddress(), await mockToken2.getAddress(), await mockToken3.getAddress()],
      [ethers.parseEther('100'), ethers.parseEther('200'), ethers.parseEther('300')],
      [],
      [],
      ethers.ZeroHash,
      { value: 0 }
    );
    const tokenId = 0;

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

    // Test 1: Remove last token (idx == arrayLength)
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken3.getAddress(), ethers.parseEther('300'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    let opValue = {
      tokenId,
      nonce,
      opType: 2, // WITHDRAW_ERC20
      dataHash: ethers.keccak256(withdrawData)
    };

    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC20(
      tokenId,
      messageHash,
      signature,
      await mockToken3.getAddress(),
      ethers.parseEther('300'),
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Test 2: Remove first token (idx != arrayLength, triggers reordering)
    nonce = await lockx.connect(user1).getNonce(tokenId);
    currentBlock = await ethers.provider.getBlock('latest');
    signatureExpiry = currentBlock!.timestamp + 3600;

    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken.getAddress(), ethers.parseEther('100'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    opValue = {
      tokenId,
      nonce,
      opType: 2, // WITHDRAW_ERC20
      dataHash: ethers.keccak256(withdrawData)
    };

    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC20(
      tokenId,
      messageHash,
      signature,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Test 3: Remove remaining token (now only one left)
    nonce = await lockx.connect(user1).getNonce(tokenId);
    currentBlock = await ethers.provider.getBlock('latest');
    signatureExpiry = currentBlock!.timestamp + 3600;

    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken2.getAddress(), ethers.parseEther('200'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    opValue = {
      tokenId,
      nonce,
      opType: 2, // WITHDRAW_ERC20
      dataHash: ethers.keccak256(withdrawData)
    };

    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

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

    // Verify all tokens removed
    const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
    expect(lockboxData[1].length).to.equal(0);
    
    console.log('✅ ALL DEPOSITS ARRAY BRANCHES HIT');
  });

  it('🔥 LOCKX: Burn lockbox with NFTs to hit lines 433-435', async () => {
    // Create lockbox with NFTs
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

    // Withdraw all NFTs
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [1, 2], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const batchOp = {
      tokenId,
      nonce,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };

    const batchSig = await keyPair.signTypedData(domain, types, batchOp);
    const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchOp);

    await lockx.connect(user1).batchWithdraw(
      tokenId,
      batchHash,
      batchSig,
      0,
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress()],
      [1, 2],
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Now burn empty lockbox - lines 433-435
    nonce = await lockx.connect(user1).getNonce(tokenId);
    currentBlock = await ethers.provider.getBlock('latest');
    signatureExpiry = currentBlock!.timestamp + 3600;

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

    console.log('✅ LOCKX LINES 433-435 HIT');
  });

  it('🔥 DEPOSITS: All validation and edge case branches', async () => {
    // Test all validation branches
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    const tokenId = 0;

    // Test 1: Zero amount ETH deposit
    await expect(
      lockx.connect(user1).depositETH(tokenId, ethers.ZeroHash, { value: 0 })
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

    // Test 2: Zero address token
    await expect(
      lockx.connect(user1).depositERC20(tokenId, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

    // Test 3: Zero amount token
    await expect(
      lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), 0, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

    // Test 4: Zero address NFT
    await expect(
      lockx.connect(user1).depositERC721(tokenId, ethers.ZeroAddress, 1, ethers.ZeroHash)
    ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

    // Test 5: Batch with ETH mismatch
    await expect(
      lockx.connect(user1).batchDeposit(
        tokenId,
        ethers.parseEther('1'),
        [],
        [],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.be.revertedWithCustomError(lockx, 'ETHMismatch');

    // Test 6: Batch with array mismatch
    await expect(
      lockx.connect(user1).batchDeposit(
        tokenId,
        0,
        [await mockToken.getAddress()],
        [], // Mismatched!
        [],
        [],
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

    console.log('✅ ALL DEPOSITS VALIDATION BRANCHES HIT');
  });

  it('🔥 DEPOSITS & WITHDRAWALS: Complete array lifecycle', async () => {
    // This test hits the complete lifecycle of array management
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );
    const tokenId = 0;

    // Add 3 tokens
    await lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await mockToken2.getAddress(), ethers.parseEther('200'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC20(tokenId, await mockToken3.getAddress(), ethers.parseEther('300'), ethers.ZeroHash);

    // Add 3 NFTs
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 3, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 4, ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 5, ethers.ZeroHash);

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

    // Batch withdraw everything
    const nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,
        ethers.parseEther('0.01'),
        [await mockToken.getAddress(), await mockToken2.getAddress(), await mockToken3.getAddress()],
        [ethers.parseEther('100'), ethers.parseEther('200'), ethers.parseEther('300')],
        [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
        [3, 4, 5],
        user1.address,
        ethers.ZeroHash,
        user1.address,
        signatureExpiry
      ]
    );

    const batchOp = {
      tokenId,
      nonce,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchData)
    };

    const batchSig = await keyPair.signTypedData(domain, types, batchOp);
    const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchOp);

    await lockx.connect(user1).batchWithdraw(
      tokenId,
      batchHash,
      batchSig,
      ethers.parseEther('0.01'),
      [await mockToken.getAddress(), await mockToken2.getAddress(), await mockToken3.getAddress()],
      [ethers.parseEther('100'), ethers.parseEther('200'), ethers.parseEther('300')],
      [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
      [3, 4, 5],
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Verify everything was removed
    const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
    expect(lockboxData[0]).to.equal(0); // No ETH
    expect(lockboxData[1].length).to.equal(0); // No tokens
    // NFTs array is at index 2 (getFullLockbox returns: ethBalance, erc20Tokens[], nftContracts[])
    const nftsArray = lockboxData[2];
    if (nftsArray) {
      expect(nftsArray.length).to.equal(0); // No NFTs
    }
    
    console.log('✅ COMPLETE ARRAY LIFECYCLE BRANCHES HIT');
  });
});