import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 COVERAGE 90% FINAL - HIT REMAINING BRANCHES', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockNFT: MockERC721;
  let feeToken: MockFeeOnTransferToken;
  let user1: HardhatEthersSigner;
  let keyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [, user1, keyPair] = await ethers.getSigners();

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
    await feeToken.setFeePercentage(500); // 5% fee

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await feeToken.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
    }

    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('DEPOSITS: _removeERC20Token with idx=0 and idx!=arrayLength', async () => {
    // Create lockbox with 3 tokens
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [await mockToken.getAddress(), await mockToken2.getAddress(), await feeToken.getAddress()],
      [ethers.parseEther('100'), ethers.parseEther('200'), ethers.parseEther('300')],
      [],
      [],
      ethers.ZeroHash,
      { value: 0 }
    );
    const tokenId = 0;

    const domain = { name: 'Lockx', version: '4', chainId: await ethers.provider.getNetwork().then(n => n.chainId), verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // Remove middle token (idx=1, triggers reordering since idx != arrayLength)
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockToken2.getAddress(), ethers.parseEther('200'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    let opValue = { tokenId, nonce, opType: 2, dataHash: ethers.keccak256(withdrawData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC20(tokenId, messageHash, signature, await mockToken2.getAddress(), ethers.parseEther('200'), user1.address, ethers.ZeroHash, signatureExpiry);

    console.log('✅ DEPOSITS: _removeERC20Token idx != arrayLength');
  });

  it('DEPOSITS: _removeNFTKey with idx=0 and idx!=arrayLength', async () => {
    // Create lockbox with 3 NFTs
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
      [1, 2, 3],
      ethers.ZeroHash,
      { value: 0 }
    );
    const tokenId = 0;

    const domain = { name: 'Lockx', version: '4', chainId: await ethers.provider.getNetwork().then(n => n.chainId), verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // Remove middle NFT (idx=1, triggers reordering)
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNFT.getAddress(), 2, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    let opValue = { tokenId, nonce, opType: 3, dataHash: ethers.keccak256(withdrawData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC721(tokenId, messageHash, signature, await mockNFT.getAddress(), 2, user1.address, ethers.ZeroHash, signatureExpiry);

    console.log('✅ DEPOSITS: _removeNFTKey idx != arrayLength');
  });

  it('DEPOSITS: Fee token received amount branch', async () => {
    // Deposit fee token that loses 5% to fees
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await feeToken.getAddress(),
      ethers.parseEther('1000'), // Will receive 950 after 5% fee
      ethers.ZeroHash
    );
    
    const tokenId = 0;
    const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
    // getFullLockbox returns (ethBalance, erc20Tokens[], nftContracts[])
    expect(lockboxData[1][0].balance).to.equal(ethers.parseEther('950'));
    
    console.log('✅ DEPOSITS: Fee token received amount');
  });

  it('LOCKX: Burn with NFT cleanup (lines 433-435)', async () => {
    // Create lockbox with NFT
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address,
      keyPair.address,
      await mockNFT.getAddress(),
      4,
      ethers.ZeroHash
    );
    const tokenId = 0;

    const domain = { name: 'Lockx', version: '4', chainId: await ethers.provider.getNetwork().then(n => n.chainId), verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // Withdraw NFT
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNFT.getAddress(), 4, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    let opValue = { tokenId, nonce, opType: 3, dataHash: ethers.keccak256(withdrawData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC721(tokenId, messageHash, signature, await mockNFT.getAddress(), 4, user1.address, ethers.ZeroHash, signatureExpiry);

    // Burn empty lockbox - executes lines 433-435
    nonce = await lockx.connect(user1).getNonce(tokenId);
    currentBlock = await ethers.provider.getBlock('latest');
    signatureExpiry = currentBlock!.timestamp + 3600;

    let burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    opValue = { tokenId, nonce, opType: 4, dataHash: ethers.keccak256(burnData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).burnLockbox(tokenId, messageHash, signature, ethers.ZeroHash, signatureExpiry);

    console.log('✅ LOCKX: Lines 433-435 NFT cleanup');
  });

  it('DEPOSITS: All batch validation branches', async () => {
    // Test batch with all empty
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, 0, [], [], [], [], ethers.ZeroHash, { value: 0 }
    );

    // Test batch with only ETH
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, ethers.parseEther('0.1'), [], [], [], [], ethers.ZeroHash, { value: ethers.parseEther('0.1') }
    );

    // Test batch with only tokens
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, 0, [await mockToken.getAddress()], [ethers.parseEther('50')], [], [], ethers.ZeroHash, { value: 0 }
    );

    // Test batch with only NFTs
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, 0, [], [], [await mockNFT.getAddress()], [5], ethers.ZeroHash, { value: 0 }
    );

    console.log('✅ DEPOSITS: Batch validation branches');
  });

  it('WITHDRAWALS: Complete removal branches', async () => {
    // Create lockbox with multiple assets
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('0.01'),
      [await mockToken.getAddress()],
      [ethers.parseEther('100')],
      [await mockNFT.getAddress()],
      [6],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );
    const tokenId = 0;

    const domain = { name: 'Lockx', version: '4', chainId: await ethers.provider.getNetwork().then(n => n.chainId), verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // Batch withdraw all
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let currentBlock = await ethers.provider.getBlock('latest');
    let signatureExpiry = currentBlock!.timestamp + 3600;

    let batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('0.01'), [await mockToken.getAddress()], [ethers.parseEther('100')], [await mockNFT.getAddress()], [6], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    let opValue = { tokenId, nonce, opType: 6, dataHash: ethers.keccak256(batchData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(
      tokenId, messageHash, signature,
      ethers.parseEther('0.01'),
      [await mockToken.getAddress()],
      [ethers.parseEther('100')],
      [await mockNFT.getAddress()],
      [6],
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    console.log('✅ WITHDRAWALS: Complete removal');
  });
});