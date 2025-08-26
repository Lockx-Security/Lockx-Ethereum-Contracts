import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockSwapRouter } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 FIX UNCOVERED BRANCHES - TARGET 90%+', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockToken2: MockERC20;
  let mockNFT: MockERC721;
  let mockRouter: MockSwapRouter;
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

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouterFactory.deploy();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(user1.address, ethers.parseEther('10000'));
    await mockToken2.mint(await mockRouter.getAddress(), ethers.parseEther('10000'));
    
    for(let i = 1; i <= 5; i++) {
      await mockNFT.mint(user1.address, i);
    }

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('🔥 DEPOSITS.SOL - _removeERC20Token & _removeNFTKey idx==0 branches', () => {
    it('should hit idx == 0 branch in _removeERC20Token', async () => {
      // Create lockbox with a token
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('1000'),
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Setup signature for withdrawal
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

      // Withdraw all tokens to trigger removal
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;
      const referenceId = ethers.ZeroHash;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('1000'), user1.address, referenceId, user1.address, signatureExpiry]
      );

      const opValue = {
        tokenId,
        nonce,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };

      const signature = await keyPair.signTypedData(domain, types, opValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

      // This withdrawal removes the token completely, triggering _removeERC20Token
      await lockx.connect(user1).withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(),
        ethers.parseEther('1000'),
        user1.address,
        referenceId,
        signatureExpiry
      );

      // Verify token was removed
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      expect(lockboxData[1].length).to.equal(0);
      
      console.log('✅ DEPOSITS: _removeERC20Token idx==0 branch hit');
    });

    it('should hit idx == 0 branch in _removeNFTKey', async () => {
      // Create lockbox with an NFT
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        keyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Setup signature for withdrawal
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

      // Withdraw the NFT to trigger removal
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;
      const referenceId = ethers.ZeroHash;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockNFT.getAddress(), 1, user1.address, referenceId, user1.address, signatureExpiry]
      );

      const opValue = {
        tokenId,
        nonce,
        opType: 3, // WITHDRAW_ERC721
        dataHash: ethers.keccak256(withdrawData)
      };

      const signature = await keyPair.signTypedData(domain, types, opValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

      // This withdrawal removes the NFT, triggering _removeNFTKey
      await lockx.connect(user1).withdrawERC721(
        tokenId,
        messageHash,
        signature,
        await mockNFT.getAddress(),
        1,
        user1.address,
        referenceId,
        signatureExpiry
      );

      // Verify NFT was removed
      const lockboxData = await lockx.connect(user1).getFullLockbox(tokenId);
      // getFullLockbox returns (uint256 ethBalance, erc20Tokens[], nftContracts[])
      expect(lockboxData[2].length).to.equal(0); // index 2 is nftContracts
      
      console.log('✅ DEPOSITS: _removeNFTKey idx==0 branch hit');
    });

    it('should hit array reordering branches when removing middle elements', async () => {
      // Create lockbox with multiple tokens to test middle removal
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [await mockToken.getAddress(), await mockToken2.getAddress()],
        [ethers.parseEther('500'), ethers.parseEther('700')],
        [await mockNFT.getAddress(), await mockNFT.getAddress()],
        [2, 3],
        ethers.ZeroHash,
        { value: 0 }
      );
      const tokenId = 0;

      // Add a third token
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      const mockToken3 = await MockERC20Factory.deploy();
      await mockToken3.initialize('Mock Token 3', 'MOCK3');
      await mockToken3.mint(user1.address, ethers.parseEther('1000'));
      await mockToken3.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
      
      await lockx.connect(user1).depositERC20(tokenId, await mockToken3.getAddress(), ethers.parseEther('300'), ethers.ZeroHash);

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

      // Withdraw the middle token (mockToken2) to trigger array reordering
      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;
      const referenceId = ethers.ZeroHash;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken2.getAddress(), ethers.parseEther('700'), user1.address, referenceId, user1.address, signatureExpiry]
      );

      const opValue = {
        tokenId,
        nonce,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };

      const signature = await keyPair.signTypedData(domain, types, opValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

      // This triggers array reordering in _removeERC20Token
      await lockx.connect(user1).withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken2.getAddress(),
        ethers.parseEther('700'),
        user1.address,
        referenceId,
        signatureExpiry
      );

      console.log('✅ DEPOSITS: Array reordering branches hit');
    });
  });

  describe('🔥 WITHDRAWALS.SOL - Uncovered swap branches', () => {
    it('should hit token to ETH swap branches', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('1000'),
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Setup ETH in router for swap
      await owner.sendTransaction({
        to: await mockRouter.getAddress(),
        value: ethers.parseEther('5')
      });

      // Setup signature for swap
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

      const nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('token_to_eth'));

      // Encode swap from token to ETH
      const swapCallData = mockRouter.interface.encodeFunctionData('swapTokensForETH', [
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.parseEther('0.09'),
        await lockx.getAddress()
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await mockToken.getAddress(),
          ethers.ZeroAddress, // ETH output
          ethers.parseEther('100'),
          ethers.parseEther('0.09'),
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress // Credit to lockbox
        ]
      );

      const opValue = {
        tokenId,
        nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };

      const signature = await keyPair.signTypedData(domain, types, opValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

      await lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(),
        ethers.ZeroAddress,
        ethers.parseEther('100'),
        ethers.parseEther('0.09'),
        await mockRouter.getAddress(),
        swapCallData,
        referenceId,
        signatureExpiry,
        ethers.ZeroAddress
      );

      console.log('✅ WITHDRAWALS: Token to ETH swap branches hit');
    });
  });

  describe('🔥 LOCKX.SOL - Lines 433-435 NFT cleanup', () => {
    it('should hit NFT cleanup lines 433-435 with multiple NFTs', async () => {
      // Create lockbox with multiple NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress()],
        [4, 5],
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

      // Withdraw all NFTs
      let nonce = await lockx.connect(user1).getNonce(tokenId);
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock!.timestamp + 3600;

      // Batch withdraw both NFTs
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [4, 5], user1.address, ethers.ZeroHash, user1.address, signatureExpiry]
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
        [4, 5],
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Now burn the empty lockbox - this hits lines 433-435
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

      console.log('✅ LOCKX: Lines 433-435 NFT cleanup hit');
    });
  });
});