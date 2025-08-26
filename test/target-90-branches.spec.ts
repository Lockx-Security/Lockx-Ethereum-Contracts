import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 TARGET 90% - SPECIFIC UNCOVERED BRANCHES', () => {
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

  describe('🔥 DEPOSITS.SOL - Target 90% Branch Coverage', () => {
    it('should hit _removeERC20Token array reordering when idx != arrayLength', async () => {
      // Create lockbox with 3 tokens to ensure middle removal
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

      // Withdraw middle token (mockToken2 at index 1) to trigger reordering
      // This makes mockToken3 move from index 2 to index 1
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

      // Verify array was reordered
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(2);
      
      console.log('✅ DEPOSITS: _removeERC20Token array reordering (idx != arrayLength)');
    });

    it('should hit _removeNFTKey array reordering when idx != arrayLength', async () => {
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

      // Withdraw middle NFT to trigger reordering
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

      // Verify array was reordered
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[2].length).to.equal(2); // index 2 is nftContracts
      
      console.log('✅ DEPOSITS: _removeNFTKey array reordering (idx != arrayLength)');
    });

    it('should hit fee token received amount calculation branches', async () => {
      // Create lockbox with fee token that takes 10% fee
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await feeToken.getAddress(),
        ethers.parseEther('1000'), // Will receive 900 after 10% fee
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Check balance is 900 (1000 - 10% fee)
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      // getFullLockbox returns (ethBalance, erc20Tokens[], nftContracts[])
      expect(lockboxData[1][0].balance).to.equal(ethers.parseEther('900'));

      // Deposit more fee tokens
      await lockx.connect(user1).depositERC20(
        tokenId,
        await feeToken.getAddress(),
        ethers.parseEther('500'), // Will receive 450 after fee
        ethers.ZeroHash
      );

      // Check total balance is 900 + 450 = 1350
      const lockboxData2 = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData2[1][0].balance).to.equal(ethers.parseEther('1350'));
      
      console.log('✅ DEPOSITS: Fee token received amount calculation');
    });

    it('should hit _depositERC20 new token registration branch', async () => {
      // Create empty lockbox
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      const tokenId = 0;

      // First deposit - new token registration (if branch)
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );

      // Second deposit of same token - existing token (else branch)
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('50'),
        ethers.ZeroHash
      );

      // Third deposit - another new token
      await lockx.connect(user1).depositERC20(
        tokenId,
        await mockToken2.getAddress(),
        ethers.parseEther('75'),
        ethers.ZeroHash
      );

      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(2); // 2 different tokens
      // erc20Tokens array contains token data
      expect(lockboxData[1][0].balance).to.equal(ethers.parseEther('150')); // 100 + 50
      expect(lockboxData[1][1].balance).to.equal(ethers.parseEther('75'));
      
      console.log('✅ DEPOSITS: New token registration branches');
    });

    it('should hit _depositERC721 new NFT registration branch', async () => {
      // Create empty lockbox
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      const tokenId = 0;

      // First NFT deposit - new NFT registration (if branch)
      await lockx.connect(user1).depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        3,
        ethers.ZeroHash
      );

      // Second NFT from same contract - existing contract
      await lockx.connect(user1).depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        4,
        ethers.ZeroHash
      );

      // Third NFT from different contract - new registration
      await lockx.connect(user1).depositERC721(
        tokenId,
        await mockNFT2.getAddress(),
        2,
        ethers.ZeroHash
      );

      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[2].length).to.equal(3); // 3 NFTs total (index 2 is nftContracts)
      
      console.log('✅ DEPOSITS: New NFT registration branches');
    });
  });

  describe('🔥 WITHDRAWALS.SOL - Target 90% Branch Coverage', () => {
    it('should hit complete token removal triggering cleanup', async () => {
      // Create lockbox with 2 tokens
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [await mockToken.getAddress(), await mockToken2.getAddress()],
        [ethers.parseEther('500'), ethers.parseEther('300')],
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

      // Withdraw all of first token - triggers complete removal
      const nonce = await lockx.connect(user1).getNonce(tokenId);
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

      // Verify token was completely removed
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(1); // Only mockToken2 left
      
      console.log('✅ WITHDRAWALS: Complete token removal');
    });

    it('should hit complete NFT removal triggering cleanup', async () => {
      // Create lockbox with 2 NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT2.getAddress()],
        [5, 3],
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

      // Withdraw NFT - triggers removal
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockNFT.getAddress(), 5, user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        5,
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Verify NFT was removed - getFullLockbox returns tuple
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      // Index 3 should be the NFT array
      const nfts = lockboxData[2]; // index 2 is nftContracts
      expect(nfts.length).to.equal(1); // Only mockNFT2 left
      
      console.log('✅ WITHDRAWALS: Complete NFT removal');
    });
  });
});