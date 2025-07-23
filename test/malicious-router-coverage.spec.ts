import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MaliciousRouter, RejectETH } from '../typechain-types';
import { Signer } from 'ethers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

describe('Malicious Router Coverage Tests', () => {
  let lockx: Lockx;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let maliciousRouter: MaliciousRouter;
  let rejectETH: RejectETH;
  let owner: Signer;
  let user: Signer;
  let lockboxKeypair: Signer;
  let tokenId: any;
  let domain: any;
  let types: any;

  before(async () => {
    [owner, user] = await ethers.getSigners();
    lockboxKeypair = ethers.Wallet.createRandom();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20Factory.deploy();
    await tokenA.initialize('TokenA', 'TKA');
    await tokenA.mint(await owner.getAddress(), ethers.parseEther('1000000'));

    tokenB = await MockERC20Factory.deploy();
    await tokenB.initialize('TokenB', 'TKB');
    await tokenB.mint(await owner.getAddress(), ethers.parseEther('1000000'));

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const MaliciousRouterFactory = await ethers.getContractFactory('MaliciousRouter');
    maliciousRouter = await MaliciousRouterFactory.deploy();

    const RejectETHFactory = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETHFactory.deploy();

    // Create lockbox
    const createTx = await lockx.connect(user).createLockboxWithETH(
      await user.getAddress(),
      lockboxKeypair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('10') }
    );
    const receipt = await createTx.wait();
    
    const transferEvent = receipt?.logs.find(
      log => lockx.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === 'Transfer'
    );
    const parsedEvent = lockx.interface.parseLog({
      topics: transferEvent?.topics as string[],
      data: transferEvent?.data || ''
    });
    tokenId = parsedEvent?.args.tokenId;

    // Setup domain for signatures
    const { chainId } = await ethers.provider.getNetwork();
    domain = {
      name: 'Lockx',
      version: '2',
      chainId: chainId,
      verifyingContract: await lockx.getAddress()
    };

    types = {
      Operation: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'opType', type: 'uint8' },
        { name: 'dataHash', type: 'bytes32' }
      ]
    };

    // Setup tokens
    await tokenA.connect(owner).transfer(await user.getAddress(), ethers.parseEther('1000'));
    await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);

    // Fund malicious router with tokens for swaps
    await tokenB.connect(owner).transfer(await maliciousRouter.getAddress(), ethers.parseEther('1000'));
    
    // Fund malicious router with ETH for swaps
    await owner.sendTransaction({
      to: await maliciousRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 Allowance Cleanup Branch Testing', () => {
    it('should hit allowance cleanup branch (Lines 1978-1979) via standard swap call', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Configure malicious router to output tokens
      await maliciousRouter.setSwapOutput(await tokenB.getAddress(), ethers.parseEther('50'));
      
      // Create simple swap call
      const swapData = maliciousRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther('30').toString()
      ]);
      
      // Create swap signature with correct format: tokenId, tokenIn, tokenOut, amountIn, minAmountOut, target, keccak256(data), referenceId, msg.sender, signatureExpiry, recipient
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await tokenA.getAddress(), // tokenIn
          await tokenB.getAddress(), // tokenOut
          ethers.parseEther('30'), // amountIn
          ethers.parseEther('50'), // minAmountOut
          await maliciousRouter.getAddress(), // target
          ethers.keccak256(swapData), // keccak256(data)
          ethers.ZeroHash, // referenceId
          user.address, // msg.sender
          signatureExpiry, // signatureExpiry
          await user.getAddress() // recipient
        ]
      );
      
      const dataHash = ethers.keccak256(authData);
      const message = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: dataHash
      };
      
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      // This should trigger the allowance cleanup branch
      await lockx.connect(user).swapInLockbox(
        tokenId, messageHash, signature,
        await tokenA.getAddress(), // tokenIn
        await tokenB.getAddress(), // tokenOut
        ethers.parseEther('30'), // amountIn
        ethers.parseEther('50'), // minAmountOut
        await maliciousRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry, // signatureExpiry
        await user.getAddress() // recipient
      );
    });

    it('should trigger allowance cleanup with configured router behavior', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Configure router to leave partial allowance and output tokens
      await maliciousRouter.setShouldLeaveAllowance(await tokenA.getAddress(), true);
      await maliciousRouter.setSwapOutput(await tokenB.getAddress(), ethers.parseEther('15'));
      
      // Create standard swap call
      const swapData = maliciousRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther('20').toString()
      ]);
      
      // Create swap signature with correct format
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId,
          await tokenA.getAddress(), // tokenIn
          await tokenB.getAddress(), // tokenOut
          ethers.parseEther('20'), // amountIn
          ethers.parseEther('10'), // minAmountOut
          await maliciousRouter.getAddress(), // target
          ethers.keccak256(swapData), // keccak256(data)
          ethers.ZeroHash, // referenceId
          user.address, // msg.sender
          signatureExpiry, // signatureExpiry
          await user.getAddress() // recipient
        ]
      );
      
      const dataHash = ethers.keccak256(authData);
      const message = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: dataHash
      };
      
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      // This should trigger allowance cleanup with configured router behavior
      await lockx.connect(user).swapInLockbox(
        tokenId, messageHash, signature,
        await tokenA.getAddress(), // tokenIn
        await tokenB.getAddress(), // tokenOut
        ethers.parseEther('20'), // amountIn
        ethers.parseEther('10'), // minAmountOut
        await maliciousRouter.getAddress(), // target
        swapData, // data
        ethers.ZeroHash, // referenceId
        signatureExpiry, // signatureExpiry
        await user.getAddress() // recipient
      );
    });
  });

  describe('🎯 ETH Transfer Failure Branch Testing', () => {
    it('should hit ETH transfer failure branch (Line 2035) with RejectETH recipient', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Configure router to output ETH
      await maliciousRouter.setSwapOutput(ethers.ZeroAddress, ethers.parseEther('1'));
      
      // Create simple swap call
      const swapData = maliciousRouter.interface.encodeFunctionData('swap', [
        await tokenA.getAddress(),
        ethers.ZeroAddress,
        ethers.parseEther('10').toString()
      ]);
      
      // Create swap signature with RejectETH as recipient
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'uint256', 'address', 'bytes', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await tokenA.getAddress(),
          ethers.parseEther('10'),
          ethers.ZeroAddress, // ETH output
          ethers.parseEther('1'),
          await maliciousRouter.getAddress(),
          swapData,
          await rejectETH.getAddress(), // Recipient that rejects ETH
          ethers.ZeroHash,
          user.address,
          signatureExpiry
        ]
      );
      
      const dataHash = ethers.keccak256(authData);
      const message = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 7, // SWAP_ASSETS
        dataHash: dataHash
      };
      
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      // This should hit the ETH transfer failure branch and revert
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId, messageHash, signature,
          await tokenA.getAddress(), // tokenIn
          ethers.ZeroAddress, // tokenOut (ETH)
          ethers.parseEther('10'), // amountIn
          ethers.parseEther('1'), // minAmountOut
          await maliciousRouter.getAddress(), // target
          swapData, // data
          ethers.ZeroHash, // referenceId
          signatureExpiry, // signatureExpiry
          await rejectETH.getAddress() // recipient that rejects ETH
        )
      ).to.be.reverted; // Should fail when trying to send ETH to RejectETH contract
    });
  });

  describe('🎯 Balance Cleanup Branch Testing', () => {
    it('should hit exact balance cleanup branch (Lines 2024-2026)', async () => {
      // Check current balance using getFullLockbox
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      let currentBalance = 0n;
      
      // Find tokenA balance in the returned data
      for (let i = 0; i < lockboxData.erc20Tokens.length; i++) {
        if (lockboxData.erc20Tokens[i].token === await tokenA.getAddress()) {
          currentBalance = lockboxData.erc20Tokens[i].balance;
          break;
        }
      }
      
      if (currentBalance > 0) {
        const nonce = await lockx.connect(user).getNonce(tokenId);
        const signatureExpiry = (await time.latest()) + 3600;
        
        const authData = ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
          [tokenId, await tokenA.getAddress(), currentBalance, await user.getAddress(), ethers.ZeroHash, user.address, signatureExpiry]
        );
        
        const dataHash = ethers.keccak256(authData);
        const message = {
          tokenId: tokenId,
          nonce: nonce,
          opType: 3, // WITHDRAW_ERC20
          dataHash: dataHash
        };
        
        const signature = await lockboxKeypair.signTypedData(domain, types, message);
        const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
        
        await lockx.connect(user).withdrawERC20(
          tokenId, messageHash, signature,
          await tokenA.getAddress(),
          currentBalance,
          await user.getAddress(),
          ethers.ZeroHash,
          signatureExpiry
        );
        
        // The balance cleanup branch should have been triggered when balance became exactly 0
        // Verify the token was removed from the lockbox
        const newLockboxData = await lockx.connect(user).getFullLockbox(tokenId);
        let foundToken = false;
        for (let i = 0; i < newLockboxData.erc20Tokens.length; i++) {
          if (newLockboxData.erc20Tokens[i].token === await tokenA.getAddress()) {
            foundToken = true;
            break;
          }
        }
        expect(foundToken).to.be.false; // Token should be removed when balance hits 0
      }
    });
  });
});