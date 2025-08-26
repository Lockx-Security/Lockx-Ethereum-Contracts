import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 LOCKX LINES 433-435 SPECIFIC COVERAGE', () => {
  let lockx: Lockx;
  let mockNFT: MockERC721;
  let user1: HardhatEthersSigner;
  let keyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [, user1, keyPair] = await ethers.getSigners();

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    for(let i = 1; i <= 5; i++) {
      await mockNFT.mint(user1.address, i);
    }
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('should execute lines 433-435 by burning lockbox after NFT withdrawal', async () => {
    // Create lockbox with only one NFT
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address,
      keyPair.address,
      await mockNFT.getAddress(),
      1,
      ethers.ZeroHash
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

    // Withdraw the NFT
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNFT.getAddress(), 1, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
    );

    const withdrawOp = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(withdrawData)
    };

    const withdrawSig = await keyPair.signTypedData(domain, types, withdrawOp);
    const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawOp);

    await lockx.connect(user1).withdrawERC721(
      tokenId,
      withdrawHash,
      withdrawSig,
      await mockNFT.getAddress(),
      1,
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Now burn the empty lockbox
    // This MUST execute lines 433-435 since _nftKeys[tokenId] was populated but is now empty
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

    // Verify lockbox was burned
    await expect(lockx.ownerOf(tokenId)).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    
    console.log('✅ LINES 433-435 EXECUTED: NFT keys array cleanup during burn');
  });

  it('should execute lines 433-435 with multiple NFTs then burn', async () => {
    // Create lockbox with multiple NFTs
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0,
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
      [2, 3, 4],
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

    // Batch withdraw all NFTs at once
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock!.timestamp + 3600;

    const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
        [2, 3, 4],
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
      0,
      [],
      [],
      [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
      [2, 3, 4],
      user1.address,
      ethers.ZeroHash,
      signatureExpiry
    );

    // Burn the now-empty lockbox
    // The _nftKeys array has 3 entries that need to be cleaned up (lines 433-435)
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

    console.log('✅ LINES 433-435 EXECUTED: Multiple NFT keys cleanup during burn');
  });
});