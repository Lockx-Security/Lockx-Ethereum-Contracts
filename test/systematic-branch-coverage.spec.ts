import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Branch Coverage Tests - Target Specific Missing Branches', () => {
  let lockx: any, owner: any, user: any, attacker: any, lockboxKeypair: any;
  let tokenA: any, tokenB: any, nft: any, mockRouter: any, rejectETH: any;
  let domain: any, types: any;
  let tokenId = 0;

  const OPERATION_TYPE = {
    WITHDRAW_ASSETS: 0,
    SWAP_ASSETS: 7
  };

  beforeEach(async () => {
    [owner, user, attacker, lockboxKeypair] = await ethers.getSigners();
    
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20Factory.deploy();
    await tokenA.initialize('Token A', 'TOKA');
    
    tokenB = await MockERC20Factory.deploy();
    await tokenB.initialize('Token B', 'TOKB');
    
    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    nft = await MockERC721Factory.deploy();
    await nft.initialize('Mock NFT', 'MNFT');
    
    const MockRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockRouterFactory.deploy();
    
    const RejectETHFactory = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETHFactory.deploy();
    
    const { chainId } = await ethers.provider.getNetwork();
    domain = {
      name: 'Lockx.io',
      version: '1',
      chainId: chainId,
      verifyingContract: await lockx.getAddress()
    };
    
    types = {
      Operation: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'nonce', type: 'uint128' },
        { name: 'opType', type: 'uint8' },
        { name: 'dataHash', type: 'bytes32' }
      ]
    };
    
    await lockx.connect(user).createLockboxWithETH(
      user.address,
      lockboxKeypair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('2') }
    );
    
    await tokenA.mint(user.address, ethers.parseEther('1000'));
    await tokenA.mint(await lockx.getAddress(), ethers.parseEther('1000'));
    await tokenB.mint(await lockx.getAddress(), ethers.parseEther('1000'));
  });

  describe('🎯 HIGH PRIORITY - Input Validation Branches', () => {
    it('should hit zero recipient in withdrawERC20 (Line 1645)', async () => {
      // First deposit some tokens
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await tokenA.getAddress(), ethers.parseEther('50'), ethers.ZeroAddress, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).withdrawERC20(
          tokenId, messageHash, signature,
          await tokenA.getAddress(), ethers.parseEther('50'), ethers.ZeroAddress, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should hit zero recipient in withdrawERC721 (Line 1716)', async () => {
      // First deposit an NFT
      await nft.mint(user.address, 1);
      await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await nft.getAddress(), 1, ethers.ZeroAddress, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).withdrawERC721(
          tokenId, messageHash, signature,
          await nft.getAddress(), 1, ethers.ZeroAddress, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should hit zero recipient in batchWithdraw (Line 1787)', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), [], [], [], [], ethers.ZeroAddress, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          ethers.parseEther('0.1'), [], [], [], [],
          ethers.ZeroAddress, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should hit NFT array length mismatch in batchWithdraw (Line 1791)', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Different length arrays: 2 contracts, 1 token ID
      const nftContracts = [await nft.getAddress(), await nft.getAddress()];
      const nftTokenIds = [1]; // Mismatched length
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], nftContracts, nftTokenIds, user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, [], [], nftContracts, nftTokenIds,
          user.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it.skip('should hit insufficient ETH in batchWithdraw (Line 1819)', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Try to withdraw more ETH than available (lockbox has 2 ETH, try to withdraw 5)
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('5'), [], [], [], [], user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          ethers.parseEther('5'), [], [], [], [],
          user.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
    });

    it.skip('should hit duplicate ERC20 tokens in batchWithdraw (Line 1830)', async () => {
      // First deposit some tokens
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Use same token address twice
      const duplicateTokens = [await tokenA.getAddress(), await tokenA.getAddress()];
      const amounts = [ethers.parseEther('25'), ethers.parseEther('25')];
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, duplicateTokens, amounts, [], [], user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, duplicateTokens, amounts, [], [],
          user.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });

    it.skip('should hit insufficient ERC20 balance in batchWithdraw (Line 1841)', async () => {
      // Deposit only 50 tokens
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('50'));
      await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('50'), ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Try to withdraw 100 tokens (more than deposited)
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [await tokenA.getAddress()], [ethers.parseEther('100')], [], [], user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, [await tokenA.getAddress()], [ethers.parseEther('100')], [], [],
          user.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
    });

    it.skip('should hit duplicate NFTs in batchWithdraw (Line 1861-1862)', async () => {
      // First deposit NFTs
      await nft.mint(user.address, 1);
      await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Use same NFT twice
      const duplicateNFTs = [await nft.getAddress(), await nft.getAddress()];
      const duplicateIds = [1, 1]; // Same contract and token ID
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], duplicateNFTs, duplicateIds, user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, [], [], duplicateNFTs, duplicateIds,
          user.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });
  });

  describe('🎯 MEDIUM PRIORITY - Swap Function Branches', () => {
    it.skip('should hit insufficient ETH in swap (Line 1953)', async () => {
      // Try to swap more ETH than available
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        ethers.ZeroAddress, await tokenA.getAddress(),
        ethers.parseEther('5'), ethers.parseEther('4'), await lockx.getAddress()
      ]);
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address', 'address', 'uint256'],
        [tokenId, ethers.ZeroAddress, await tokenA.getAddress(), ethers.parseEther('5'),
         ethers.parseEther('4'), await mockRouter.getAddress(), swapData, ethers.ZeroHash,
         signatureExpiry, user.address, ethers.ZeroAddress, 0]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.SWAP_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId, messageHash, signature,
          ethers.ZeroAddress, await tokenA.getAddress(), ethers.parseEther('5'),
          ethers.parseEther('4'), await mockRouter.getAddress(), swapData,
          ethers.ZeroHash, signatureExpiry, ethers.ZeroAddress
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientBalance');
    });

    it.skip('should hit ETH transfer failure in swap (Line 2034)', async () => {
      // Deposit tokens to swap for ETH
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(), ethers.ZeroAddress,
        ethers.parseEther('50'), ethers.parseEther('0.4'), await lockx.getAddress()
      ]);
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'bytes32', 'uint256', 'address', 'address', 'uint256'],
        [tokenId, await tokenA.getAddress(), ethers.ZeroAddress, ethers.parseEther('50'),
         ethers.parseEther('0.4'), await mockRouter.getAddress(), swapData, ethers.ZeroHash,
         signatureExpiry, user.address, await rejectETH.getAddress(), 0]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.SWAP_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId, messageHash, signature,
          await tokenA.getAddress(), ethers.ZeroAddress, ethers.parseEther('50'),
          ethers.parseEther('0.4'), await mockRouter.getAddress(), swapData,
          ethers.ZeroHash, signatureExpiry, await rejectETH.getAddress()
        )
      ).to.be.revertedWithCustomError(lockx, 'EthTransferFailed');
    });
  });

  describe('🎯 LOWER PRIORITY - Edge Cases', () => {
    it('should hit fallback function (Line 1035)', async () => {
      // Send transaction with invalid function selector
      await expect(
        owner.sendTransaction({
          to: await lockx.getAddress(),
          data: '0x12345678', // Invalid function selector
          value: 0
        })
      ).to.be.revertedWithCustomError(lockx, 'FallbackNotAllowed');
    });
  });
});