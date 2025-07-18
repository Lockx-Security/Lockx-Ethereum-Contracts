import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721, Lockx } from '../typechain-types';

describe('Swap Functionality Tests - Updated', () => {
  let lockx: Lockx;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let mockRouter: any;
  let lockboxKeypair: any;

  const OPERATION_TYPE = {
    ROTATE_KEY: 0,
    WITHDRAW_ETH: 1,
    WITHDRAW_ERC20: 2,
    WITHDRAW_NFT: 3,
    BURN_LOCKBOX: 4,
    SET_TOKEN_URI: 5,
    BATCH_WITHDRAW: 6,
    SWAP_ASSETS: 7,
  };

  async function buildDomain(verifyingContract: string) {
    const { chainId } = await ethers.provider.getNetwork();
    return {
      name: 'Lockx',
      version: '2',
      chainId,
      verifyingContract,
    };
  }

  const types = {
    Operation: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'opType', type: 'uint8' },
      { name: 'dataHash', type: 'bytes32' },
    ],
  };

  beforeEach(async () => {
    [owner, user] = await ethers.getSigners();

    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy() as Lockx;

    // Deploy mock tokens
    const ERC20 = await ethers.getContractFactory('MockERC20');
    tokenA = await ERC20.deploy() as MockERC20;
    await tokenA.initialize('Token A', 'TKA');
    tokenB = await ERC20.deploy() as MockERC20;
    await tokenB.initialize('Token B', 'TKB');

    // Deploy mock router
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Mint tokens
    await tokenA.mint(user.address, ethers.parseEther('10000'));
    await tokenB.mint(mockRouter.getAddress(), ethers.parseEther('10000'));

    // Approve Lockx
    await tokenA.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);

    // Create lockbox keypair
    lockboxKeypair = ethers.Wallet.createRandom();
  });

  describe('swapInLockbox', () => {
    let tokenId: number;

    beforeEach(async () => {
      // Create lockbox with tokenA
      await lockx.connect(user).createLockboxWithERC20(
        user.address,
        lockboxKeypair.address,
        await tokenA.getAddress(),
        ethers.parseEther('1000'),
        ethers.ZeroHash
      );
      tokenId = 0;
    });

    it('should execute ERC20 to ERC20 swap with slippage protection', async () => {
      const amountIn = ethers.parseEther('100');
      const expectedOut = ethers.parseEther('95'); // Mock router will give 95% rate
      const minAmountOut = ethers.parseEther('90'); // 90% slippage protection
      
      // Build swap data
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        expectedOut,
        await lockx.getAddress()
      ]);

      // Build signature data
      const domain = await buildDomain(await lockx.getAddress());
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
          [
            tokenId,
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            ethers.keccak256(swapData),
            ethers.ZeroHash,
            user.address,
            signatureExpiry
          ]
        )
      );

      const message = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.SWAP_ASSETS,
        dataHash
      };

      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);

      // Execute swap
      await lockx.connect(user).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        minAmountOut,
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Check balances
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      const tokenAAddress = await tokenA.getAddress();
      const tokenBAddress = await tokenB.getAddress();
      
      // Token A should be reduced
      const tokenABalance = lockboxData.erc20Tokens.find(
        t => t.tokenAddress === tokenAAddress
      );
      expect(tokenABalance?.balance).to.equal(ethers.parseEther('900'));
      
      // Token B should be added
      const tokenBBalance = lockboxData.erc20Tokens.find(
        t => t.tokenAddress === tokenBAddress
      );
      expect(tokenBBalance?.balance).to.equal(expectedOut);
    });

    it('should execute ETH to ERC20 swap', async () => {
      // First deposit ETH
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, {
        value: ethers.parseEther('1')
      });

      const amountIn = ethers.parseEther('0.5');
      const expectedOut = ethers.parseEther('475'); // Mock router gives tokens for ETH
      const minAmountOut = ethers.parseEther('450'); // Min out for slippage protection
      
      const swapData = mockRouter.interface.encodeFunctionData('swapETHForTokens', [
        await tokenB.getAddress(),
        expectedOut,
        await lockx.getAddress()
      ]);

      const domain = await buildDomain(await lockx.getAddress());
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
          [
            tokenId,
            ethers.ZeroAddress, // ETH input
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            ethers.keccak256(swapData),
            ethers.ZeroHash,
            user.address,
            signatureExpiry
          ]
        )
      );

      const message = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.SWAP_ASSETS,
        dataHash
      };

      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);

      // Execute swap
      await lockx.connect(user).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        ethers.ZeroAddress,
        await tokenB.getAddress(),
        amountIn,
        minAmountOut,
        await mockRouter.getAddress(),
        swapData,
        ethers.ZeroHash,
        signatureExpiry
      );

      // Check balances
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      const tokenBAddress = await tokenB.getAddress();
      
      // ETH should be reduced
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('0.5'));
      
      // Token B should be added
      const tokenBBalance = lockboxData.erc20Tokens.find(
        t => t.tokenAddress === tokenBAddress
      );
      expect(tokenBBalance?.balance).to.equal(expectedOut);
    });

    it('should revert when slippage exceeds minAmountOut', async () => {
      const amountIn = ethers.parseEther('100');
      const expectedOut = ethers.parseEther('95'); // Mock router will give 95% rate
      const minAmountOut = ethers.parseEther('96'); // Higher than expected out, should fail
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        expectedOut,
        await lockx.getAddress()
      ]);

      const domain = await buildDomain(await lockx.getAddress());
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
          [
            tokenId,
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            ethers.keccak256(swapData),
            ethers.ZeroHash,
            user.address,
            signatureExpiry
          ]
        )
      );

      const message = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.SWAP_ASSETS,
        dataHash
      };

      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);

      // Execute swap should fail
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          swapData,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'SlippageExceeded');
    });

    it('should revert on insufficient balance', async () => {
      const amountIn = ethers.parseEther('2000'); // More than deposited
      const minAmountOut = ethers.parseEther('1800'); // Min out for slippage protection
      
      const swapData = mockRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        amountIn,
        ethers.parseEther('1900'),
        await lockx.getAddress()
      ]);

      const domain = await buildDomain(await lockx.getAddress());
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const dataHash = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
          [
            tokenId,
            await tokenA.getAddress(),
            await tokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            ethers.keccak256(swapData),
            ethers.ZeroHash,
            user.address,
            signatureExpiry
          ]
        )
      );

      const message = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.SWAP_ASSETS,
        dataHash
      };

      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);

      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          await tokenA.getAddress(),
          await tokenB.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          swapData,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
    });
  });
});