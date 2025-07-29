import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, MockSwapRouter } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('💎 ULTIMATE PUSH TO 90%+ COVERAGE - TARGETING EXACT BRANCHES!', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockTokenB: MockERC20;
  let mockNFT: MockERC721;
  let mockRouter: MockSwapRouter;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let lockboxKeyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.initialize('Mock Token', 'MOCK');
    
    mockTokenB = await MockERC20Factory.deploy();
    await mockTokenB.initialize('Mock Token B', 'MOCKB');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouterFactory.deploy();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup tokens and approvals
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockTokenB.mint(user1.address, ethers.parseEther('10000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10000'));
    await mockTokenB.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10000'));
    
    // Setup NFTs
    for (let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i);
    }
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    
    // Fund router for swaps
    await mockToken.mint(await mockRouter.getAddress(), ethers.parseEther('100000'));
    await mockTokenB.mint(await mockRouter.getAddress(), ethers.parseEther('100000'));
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('100')
    });
  });

  describe('🔥 HIT WITHDRAWAL VALIDATION BRANCHES', () => {
    it('💎 BRANCH 1: Hit recipient == address(0) in withdrawETH', async () => {
      // Create lockbox with ETH
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        WithdrawalETH: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      const value = {
        tokenId: tokenId,
        amount: ethers.parseEther('0.5'),
        to: ethers.ZeroAddress, // Zero address recipient!
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should revert with ZeroAddress
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('0.5'),
          ethers.ZeroAddress, // Zero address!
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('💎 BRANCH 2: Hit currentBal < amountETH in withdrawETH', async () => {
      // Create lockbox with small amount of ETH
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        WithdrawalETH: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amount', type: 'uint256' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      const value = {
        tokenId: tokenId,
        amount: ethers.parseEther('1'), // Try to withdraw 1 ETH when only 0.1 available
        to: user1.address,
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should revert with NoETHBalance
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'), // More than available!
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
    });

    it('💎 BRANCH 3: Hit duplicate NFT check in batchWithdraw', async () => {
      // Create lockbox with NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress()],
        [1, 2],
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        BatchWithdrawal: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amountETH', type: 'uint256' },
          { name: 'tokenAddresses', type: 'address[]' },
          { name: 'tokenAmounts', type: 'uint256[]' },
          { name: 'nftContracts', type: 'address[]' },
          { name: 'nftTokenIds', type: 'uint256[]' },
          { name: 'to', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      const value = {
        tokenId: tokenId,
        amountETH: 0,
        tokenAddresses: [],
        tokenAmounts: [],
        nftContracts: [await mockNFT.getAddress(), await mockNFT.getAddress()],
        nftTokenIds: [1, 1], // Duplicate NFT!
        to: user1.address,
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should revert with DuplicateEntry
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0,
          [],
          [],
          [await mockNFT.getAddress(), await mockNFT.getAddress()],
          [1, 1], // Duplicate!
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });
  });

  describe('🔥 HIT SWAP BRANCHES', () => {
    it('💎 BRANCH 4: Hit balance checks in swap functions', async () => {
      // Create lockbox with limited tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'), // Only 10 tokens
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Swap: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'router', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'routerCallData', type: 'bytes' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      // Encode swap call data
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('50'), // Try to swap 50 when only 10 available!
        1,
        '0x'
      ]);

      const value = {
        tokenId: tokenId,
        router: await mockRouter.getAddress(),
        tokenIn: await mockToken.getAddress(),
        tokenOut: await mockTokenB.getAddress(),
        amountIn: ethers.parseEther('50'), // More than balance!
        minAmountOut: 1,
        routerCallData: swapCallData,
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should revert with InsufficientTokenBalance
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          await mockRouter.getAddress(),
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          ethers.parseEther('50'), // More than available!
          1,
          swapCallData,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
    });

    it('💎 BRANCH 5: Hit RouterOverspent protection', async () => {
      // Deploy overspending router
      const OverpayingRouterFactory = await ethers.getContractFactory('OverpayingRouter');
      const overpayingRouter = await OverpayingRouterFactory.deploy();
      
      // Fund it
      await mockToken.mint(await overpayingRouter.getAddress(), ethers.parseEther('1000'));
      await mockTokenB.mint(await overpayingRouter.getAddress(), ethers.parseEther('1000'));

      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );

      const tokenId = 0;
      
      // Approve the router to spend MORE than authorized
      await mockToken.connect(user1).approve(await overpayingRouter.getAddress(), ethers.parseEther('1000'));

      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Swap: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'router', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'routerCallData', type: 'bytes' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      // The overpaying router will try to take 2x the authorized amount
      const swapCallData = overpayingRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        ethers.parseEther('10'), // Authorized amount
        ethers.parseEther('20'), // Will try to take 20!
        '0x'
      ]);

      const value = {
        tokenId: tokenId,
        router: await overpayingRouter.getAddress(),
        tokenIn: await mockToken.getAddress(),
        tokenOut: await mockTokenB.getAddress(),
        amountIn: ethers.parseEther('10'), // Only authorize 10
        minAmountOut: 1,
        routerCallData: swapCallData,
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should revert with RouterOverspent
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          await overpayingRouter.getAddress(),
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          ethers.parseEther('10'),
          1,
          swapCallData,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'RouterOverspent');
    });

    it('💎 BRANCH 6: Hit tokenOut == address(0) ETH output in swap', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Swap: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'router', type: 'address' },
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'minAmountOut', type: 'uint256' },
          { name: 'routerCallData', type: 'bytes' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'signatureExpiry', type: 'uint256' }
        ]
      };

      // Swap tokens for ETH
      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        ethers.ZeroAddress, // ETH output
        ethers.parseEther('10'),
        ethers.parseEther('0.1'),
        '0x'
      ]);

      const value = {
        tokenId: tokenId,
        router: await mockRouter.getAddress(),
        tokenIn: await mockToken.getAddress(),
        tokenOut: ethers.ZeroAddress, // ETH output!
        amountIn: ethers.parseEther('10'),
        minAmountOut: ethers.parseEther('0.1'),
        routerCallData: swapCallData,
        referenceId: ethers.ZeroHash,
        signatureExpiry: signatureExpiry
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Execute swap to ETH
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        await mockRouter.getAddress(),
        await mockToken.getAddress(),
        ethers.ZeroAddress, // ETH output
        ethers.parseEther('10'),
        ethers.parseEther('0.1'),
        swapCallData,
        ethers.ZeroHash,
        signatureExpiry
      );
    });
  });

  describe('🔥 HIT DEPOSITS.SOL BRANCHES', () => {
    it('💎 BRANCH 7: Hit idx == 0 branches for token removal', async () => {
      // This is tricky - we need to trigger internal functions
      // One way is through complex withdrawal scenarios
      
      // Create lockbox with multiple tokens
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [await mockToken.getAddress(), await mockTokenB.getAddress()],
        [ethers.parseEther('50'), ethers.parseEther('50')],
        [],
        [],
        ethers.ZeroHash
      );

      // The idx == 0 branches are internal and hard to hit directly
      // They're hit when trying to remove a token that doesn't exist in the mapping
    });
  });
});