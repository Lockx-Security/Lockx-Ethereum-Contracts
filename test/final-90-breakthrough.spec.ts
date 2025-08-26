import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🚀 FINAL 90% BREAKTHROUGH - TARGET REMAINING BRANCHES', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockToken3: MockERC20;
  let mockNFT: MockERC721;
  let mockNFT2: MockERC721;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let keyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, user2, keyPair] = await ethers.getSigners();

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
    mockNFT2 = await MockERC721Factory.deploy();
    await mockNFT2.initialize('Mock NFT 2', 'MNFT2');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await mockToken3.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
      await mockNFT2.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken3.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockNFT2.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('🎯 DEPOSITS - Array Management Edge Cases', () => {
    it('should hit _removeERC20Token with idx != arrayLength (reordering)', async () => {
      // Create lockbox with 3 tokens
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

      // Withdraw middle token (mockToken2) to trigger array reordering
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

      // Verify reordering happened
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(2); // Only 2 tokens left
      
      console.log('✅ DEPOSITS: Array reordering branch hit (idx != arrayLength)');
    });

    it('should hit _removeNFTKey with idx != arrayLength (reordering)', async () => {
      // Create lockbox with 3 NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT2.getAddress()],
        [1, 2, 1],
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

      // Withdraw middle NFT to trigger array reordering
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

      // Verify reordering happened
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[2].length).to.equal(2); // Only 2 NFTs left (index 2 is nftContracts)
      
      console.log('✅ DEPOSITS: NFT array reordering branch hit (idx != arrayLength)');
    });
  });

  describe('🎯 LOCKX - Lines 433-435 Complete Coverage', () => {
    it('should hit lines 433-435 with partial NFT removal then burn', async () => {
      // Create lockbox with 2 NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT2.getAddress()],
        [3, 2],
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

      // Withdraw both NFTs
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;

      // Batch withdraw all NFTs
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT2.getAddress()], [3, 2], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        [await mockNFT.getAddress(), await mockNFT2.getAddress()],
        [3, 2],
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Now burn the empty lockbox - this should hit lines 433-435
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

      console.log('✅ LOCKX: Lines 433-435 complete coverage');
    });
  });

  describe('🎯 WITHDRAWALS - Additional Edge Cases', () => {
    it('should hit complete token removal with multiple tokens', async () => {
      // Create lockbox with multiple tokens
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('1'),
        [await mockToken.getAddress(), await mockToken2.getAddress()],
        [ethers.parseEther('500'), ethers.parseEther('300')],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
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

      // Withdraw all of first token
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('500'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        await mockToken.getAddress(),
        ethers.parseEther('500'),
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Verify only one token left
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(1);
      
      console.log('✅ WITHDRAWALS: Complete token removal branch hit');
    });
  });
});