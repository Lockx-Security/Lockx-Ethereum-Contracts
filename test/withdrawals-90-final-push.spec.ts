import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('WITHDRAWALS - Final Push to 90% Branch Coverage', () => {
  let lockx, mockToken, mockNFT, owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock', 'MCK');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('NFT', 'NFT');

    await mockToken.transfer(user1.address, ethers.parseEther('1000'));
    for (let i = 1; i <= 5; i++) {
      await mockNFT.mint(user1.address, i);
    }
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
  });

  describe('Invalid recipient branches', () => {
    it.skip('should revert when recipient is contract itself', async () => {
      // Create lockbox with ETH
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

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

      // Try to withdraw ETH to the contract itself
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), await lockx.getAddress(), ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const withdrawValue = {
        tokenId,
        nonce: 1,
        opType: 1, // WITHDRAW_ETH
        dataHash: ethers.keccak256(withdrawData)
      };

      const withdrawSig = await keyPair.signTypedData(domain, types, withdrawValue);
      const withdrawHash = ethers.TypedDataEncoder.hash(domain, types, withdrawValue);

      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          withdrawHash,
          withdrawSig,
          ethers.parseEther('0.5'),
          await lockx.getAddress(), // Invalid recipient
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidRecipient');
      
      console.log('✅ Hit InvalidRecipient branch');
    });

    it('should revert when batch withdraw recipient is zero address', async () => {
      // Create lockbox with assets
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('1'),
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

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

      // Try batch withdraw with zero address recipient
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), [], [], [], [], ethers.ZeroAddress, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const batchValue = {
        tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(batchData)
      };

      const batchSig = await keyPair.signTypedData(domain, types, batchValue);
      const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          batchHash,
          batchSig,
          ethers.parseEther('0.5'),
          [],
          [],
          [],
          [],
          ethers.ZeroAddress, // Invalid recipient
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
      
      console.log('✅ Hit ZeroAddress recipient branch');
    });
  });

  describe('Insufficient balance branches', () => {
    it('should revert when insufficient ETH balance', async () => {
      // Create lockbox with small ETH amount
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

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

      // Try to withdraw more ETH than available
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), [], [], [], [], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const batchValue = {
        tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(batchData)
      };

      const batchSig = await keyPair.signTypedData(domain, types, batchValue);
      const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          batchHash,
          batchSig,
          ethers.parseEther('1'), // More than available
          [],
          [],
          [],
          [],
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
      
      console.log('✅ Hit NoETHBalance branch');
    });

    it('should revert when insufficient token balance', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

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

      // Try to withdraw more tokens than available
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [await mockToken.getAddress()], [ethers.parseEther('100')], [], [], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const batchValue = {
        tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(batchData)
      };

      const batchSig = await keyPair.signTypedData(domain, types, batchValue);
      const batchHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          batchHash,
          batchSig,
          0,
          [await mockToken.getAddress()],
          [ethers.parseEther('100')], // More than available
          [],
          [],
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
      
      console.log('✅ Hit InsufficientTokenBalance branch');
    });
  });
});