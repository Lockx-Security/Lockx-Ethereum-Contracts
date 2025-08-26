import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 COMPREHENSIVE 90% BRANCH COVERAGE', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockToken3: MockERC20;
  let mockNFT: MockERC721;
  let mockNFT2: MockERC721;
  let feeToken: MockFeeOnTransferToken;
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

    const MockFeeOnTransferTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await MockFeeOnTransferTokenFactory.deploy();
    await feeToken.initialize('Fee Token', 'FEE');
    await feeToken.setFeePercentage(1000); // 10% fee

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await mockToken3.mint(user1.address, ethers.parseEther('10000'));
    await feeToken.mint(user1.address, ethers.parseEther('10000'));
    
    for(let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
      await mockNFT2.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken3.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockNFT2.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('DEPOSITS.SOL - Complete Branch Coverage', () => {
    it('should cover _removeERC20Token all branches', async () => {
      // Create lockbox with 3 tokens to test all removal scenarios
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

      // Test 1: Remove middle token (idx != arrayLength) - triggers array reordering
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      let currentBlock = await ethers.provider.getBlock('latest');
      let signatureExpiry = currentBlock!.timestamp + 3600;

      let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken2.getAddress(), ethers.parseEther('200'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        await mockToken2.getAddress(),
        ethers.parseEther('200'),
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      console.log('✅ Hit: _removeERC20Token with idx != arrayLength (array reordering)');

      // Test 2: Remove last token (idx == arrayLength) - no reordering needed
      nonce = await lockx.connect(user1).getNonce(tokenId);
      currentBlock = await ethers.provider.getBlock('latest');
      signatureExpiry = currentBlock!.timestamp + 3600;

      withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken3.getAddress(), ethers.parseEther('300'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      opValue = {
        tokenId,
        nonce,
        opType: 2,
        dataHash: ethers.keccak256(withdrawData)
      };

      signature = await keyPair.signTypedData(domain, types, opValue);
      messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

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

      console.log('✅ Hit: _removeERC20Token with idx == arrayLength (simple pop)');

      // Test 3: Remove final token (triggers complete removal)
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
        opType: 2,
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

      console.log('✅ Hit: Complete token removal');
    });

    it('should cover _removeNFTKey all branches', async () => {
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

      // Remove middle NFT (triggers reordering)
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      let currentBlock = await ethers.provider.getBlock('latest');
      let signatureExpiry = currentBlock!.timestamp + 3600;

      let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockNFT.getAddress(), 2, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      let opValue = {
        tokenId,
        nonce,
        opType: 3, // WITHDRAW_ERC721
        dataHash: ethers.keccak256(withdrawData)
      };

      let signature = await keyPair.signTypedData(domain, types, opValue);
      let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

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

      console.log('✅ Hit: _removeNFTKey with idx != arrayLength (array reordering)');
    });

    it('should cover fee token received calculation', async () => {
      // Create lockbox with fee token
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await feeToken.getAddress(),
        ethers.parseEther('1000'), // Will receive 900 after 10% fee
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Verify received amount after fee
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      // getFullLockbox returns (ethBalance, erc20Tokens[], nftContracts[])
      // erc20Tokens[0] contains the first token data
      expect(lockboxData[1][0].balance).to.equal(ethers.parseEther('900'));

      // Add more fee tokens to existing balance
      await lockx.connect(user1).depositERC20(
        tokenId,
        await feeToken.getAddress(),
        ethers.parseEther('500'), // Will receive 450 after fee
        ethers.ZeroHash
      );

      const lockboxData2 = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData2[1][0].balance).to.equal(ethers.parseEther('1350')); // 900 + 450

      console.log('✅ Hit: Fee token received amount calculation');
    });

    it('should cover batch deposit array iteration branches', async () => {
      // Test with multiple tokens and NFTs to ensure loop coverage
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('0.01'),
        [await mockToken.getAddress(), await mockToken2.getAddress(), await mockToken3.getAddress()],
        [ethers.parseEther('10'), ethers.parseEther('20'), ethers.parseEther('30')],
        [await mockNFT.getAddress(), await mockNFT2.getAddress()],
        [4, 1],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.01') }
      );

      console.log('✅ Hit: Batch deposit array iteration branches');
    });
  });

  describe('LOCKX.SOL - Lines 433-435 Coverage', () => {
    it('should execute NFT cleanup during burn', async () => {
      // Create lockbox with multiple NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress()],
        [5, 6],
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
        [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [5, 6], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        [5, 6],
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Now burn the empty lockbox - this executes lines 433-435
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

      console.log('✅ Hit: Lines 433-435 NFT cleanup during burn');
    });
  });

  describe('WITHDRAWALS.SOL - Complete Branch Coverage', () => {
    it('should cover all withdrawal edge cases', async () => {
      // Create lockbox with multiple assets
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('0.1'),
        [await mockToken.getAddress(), await mockToken2.getAddress()],
        [ethers.parseEther('100'), ethers.parseEther('200')],
        [await mockNFT.getAddress()],
        [7],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
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

      // Partial withdrawal
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      let currentBlock = await ethers.provider.getBlock('latest');
      let signatureExpiry = currentBlock!.timestamp + 3600;

      let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('50'), user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        await mockToken.getAddress(),
        ethers.parseEther('50'),
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      console.log('✅ Hit: Partial token withdrawal');

      // Complete removal of second token
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
        opType: 2,
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

      console.log('✅ Hit: Complete token removal');
    });
  });
});