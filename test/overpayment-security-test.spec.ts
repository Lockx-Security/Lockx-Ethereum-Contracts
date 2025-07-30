import { ethers } from 'hardhat';
import { expect } from 'chai';
import { Lockx, MockERC20, MockSwapRouter, LockxStateHarness } from '../typechain-types';

describe('🔒 OVERPAYMENT SECURITY TESTS - COMPREHENSIVE COVERAGE', () => {
  let lockx: LockxStateHarness;
  let tokenA: MockERC20;
  let tokenB: MockERC20;
  let owner: any, alice: any, bob: any, attacker: any;
  let mockRouter: MockSwapRouter;
  let overpayingRouter: any;

  beforeEach(async () => {
    [owner, alice, bob, attacker] = await ethers.getSigners();

    // Deploy contracts with test harness for balance access
    const Lockx = await ethers.getContractFactory('LockxStateHarness');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20.deploy();
    await tokenA.initialize('TokenA', 'TKA');
    tokenB = await MockERC20.deploy();
    await tokenB.initialize('TokenB', 'TKB');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();

    // Deploy overpaying router
    const OverpayingRouter = await ethers.getContractFactory('OverpayingRouter');
    overpayingRouter = await OverpayingRouter.deploy();

    // Setup: Mint tokens
    await tokenA.mint(alice.address, ethers.parseEther('1000'));
    await tokenA.mint(bob.address, ethers.parseEther('1000'));
    await tokenB.mint(await mockRouter.getAddress(), ethers.parseEther('100000'));
    await tokenB.mint(await overpayingRouter.getAddress(), ethers.parseEther('100000')); // Give router extra tokens

    // Create lockboxes for Alice and Bob
    await tokenA.connect(alice).approve(await lockx.getAddress(), ethers.parseEther('500'));
    await lockx.connect(alice).createLockboxWithERC20(
      alice.address, alice.address, await tokenA.getAddress(), 
      ethers.parseEther('500'), ethers.ZeroHash
    );
    
    await tokenA.connect(bob).approve(await lockx.getAddress(), ethers.parseEther('500'));
    await lockx.connect(bob).createLockboxWithERC20(
      bob.address, bob.address, await tokenA.getAddress(), 
      ethers.parseEther('500'), ethers.ZeroHash
    );
  });

  describe('Overpayment Scenarios', () => {
    it('Should handle router overpayment correctly without affecting other users', async () => {
      const aliceTokenId = 0;
      const bobTokenId = 1;
      
      // Initial state
      expect(await lockx.getERC20Bal(aliceTokenId, await tokenA.getAddress())).to.equal(ethers.parseEther('500'));
      expect(await lockx.getERC20Bal(bobTokenId, await tokenA.getAddress())).to.equal(ethers.parseEther('500'));
      
      // Total contract balance
      const contractBalanceBefore = await tokenA.balanceOf(await lockx.getAddress());
      expect(contractBalanceBefore).to.equal(ethers.parseEther('1000')); // 500 + 500
      
      // Alice swaps 100 TokenA using overpaying router
      // Router will send 200 TokenB instead of 95 TokenB
      const swapData = overpayingRouter.interface.encodeFunctionData('overpayingSwap', [
        await tokenA.getAddress(),
        await tokenB.getAddress(),
        ethers.parseEther('100'),
        ethers.parseEther('90'), // minAmountOut
        await lockx.getAddress()
      ]);
      
      const nonce = await lockx.connect(alice).getNonce(aliceTokenId);
      const expiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256'],
        [aliceTokenId, await tokenA.getAddress(), await tokenB.getAddress(), ethers.parseEther('100'), ethers.parseEther('90'), await overpayingRouter.getAddress(), ethers.keccak256(swapData), ethers.ZeroHash, alice.address, expiry]
      );
      const dataHash = ethers.keccak256(authData);
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress(),
      };
      
      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' },
        ],
      };
      
      const message = { tokenId: aliceTokenId, nonce, opType: 7, dataHash };
      const signature = await alice.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      // Execute swap
      await lockx.connect(alice).swapInLockbox(
        aliceTokenId, messageHash, signature,
        await tokenA.getAddress(), await tokenB.getAddress(),
        ethers.parseEther('100'), ethers.parseEther('90'),
        await overpayingRouter.getAddress(), swapData,
        ethers.ZeroHash, expiry
      );
      
      // Check results
      // Alice should have 400 TokenA left (500 - 100)
      expect(await lockx.getERC20Bal(aliceTokenId, await tokenA.getAddress())).to.equal(ethers.parseEther('400'));
      
      // Alice should have 200 TokenB (router overpaid!)
      expect(await lockx.getERC20Bal(aliceTokenId, await tokenB.getAddress())).to.equal(ethers.parseEther('200'));
      
      // Bob's balance should be UNCHANGED
      expect(await lockx.getERC20Bal(bobTokenId, await tokenA.getAddress())).to.equal(ethers.parseEther('500'));
      
      // Total contract TokenA balance should be 900 (1000 - 100)
      const contractBalanceAfter = await tokenA.balanceOf(await lockx.getAddress());
      expect(contractBalanceAfter).to.equal(ethers.parseEther('900'));
      
      console.log('✅ Router overpayment credited correctly to Alice without affecting Bob');
    });

    it('Should prevent any cross-contamination between lockboxes', async () => {
      // Even if contract receives unexpected tokens, they shouldn't affect accounting
      const aliceTokenId = 0;
      const bobTokenId = 1;
      
      // Someone randomly sends 1000 TokenB to the contract
      await tokenB.mint(await lockx.getAddress(), ethers.parseEther('1000'));
      
      // Check that neither Alice nor Bob have any TokenB credited
      expect(await lockx.getERC20Bal(aliceTokenId, await tokenB.getAddress())).to.equal(0);
      expect(await lockx.getERC20Bal(bobTokenId, await tokenB.getAddress())).to.equal(0);
      
      // The tokens are in the contract but not assigned to anyone
      expect(await tokenB.balanceOf(await lockx.getAddress())).to.equal(ethers.parseEther('1000'));
      
      console.log('✅ Random token deposits do not affect user balances');
    });

    it('Should ensure sum of internal balances never exceeds contract balance', async () => {
      const aliceTokenId = 0;
      const bobTokenId = 1;
      
      // Get all balances
      const aliceBalanceA = await lockx.getERC20Bal(aliceTokenId, await tokenA.getAddress());
      const bobBalanceA = await lockx.getERC20Bal(bobTokenId, await tokenA.getAddress());
      const contractBalance = await tokenA.balanceOf(await lockx.getAddress());
      
      // Sum of internal balances should equal contract balance
      expect(aliceBalanceA + bobBalanceA).to.equal(contractBalance);
      
      // Try to withdraw all funds from both users
      // Alice withdraws her full balance
      const withdrawAmount = aliceBalanceA;
      
      // Create withdrawal signature for Alice
      const nonce = await lockx.connect(alice).getNonce(aliceTokenId);
      const expiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [aliceTokenId, await tokenA.getAddress(), withdrawAmount, alice.address, ethers.ZeroHash, alice.address, expiry]
      );
      const dataHash = ethers.keccak256(authData);
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress(),
      };
      
      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' },
        ],
      };
      
      const message = { tokenId: aliceTokenId, nonce, opType: 2, dataHash }; // WITHDRAW_ERC20 = 2
      const signature = await alice.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await lockx.connect(alice).withdrawERC20(
        aliceTokenId, messageHash, signature,
        await tokenA.getAddress(), withdrawAmount,
        alice.address, ethers.ZeroHash, expiry
      );
      
      // Bob can still withdraw his full balance
      const bobNonce = await lockx.connect(bob).getNonce(bobTokenId);
      const bobAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [bobTokenId, await tokenA.getAddress(), bobBalanceA, bob.address, ethers.ZeroHash, bob.address, expiry]
      );
      const bobDataHash = ethers.keccak256(bobAuthData);
      const bobMessage = { tokenId: bobTokenId, nonce: bobNonce, opType: 2, dataHash: bobDataHash };
      const bobSignature = await bob.signTypedData(domain, types, bobMessage);
      const bobMessageHash = ethers.TypedDataEncoder.hash(domain, types, bobMessage);
      
      await lockx.connect(bob).withdrawERC20(
        bobTokenId, bobMessageHash, bobSignature,
        await tokenA.getAddress(), bobBalanceA,
        bob.address, ethers.ZeroHash, expiry
      );
      
      // Contract should now have 0 balance
      expect(await tokenA.balanceOf(await lockx.getAddress())).to.equal(0);
      
      console.log('✅ Sum of internal balances always matches contract balance');
    });

    it('Should handle fee-on-transfer tokens correctly without overcrediting', async () => {
      // Deploy fee-on-transfer token (2% fee)
      const FeeToken = await ethers.getContractFactory('MockFeeOnTransferToken');
      const feeToken = await FeeToken.deploy();
      await feeToken.initialize('FeeToken', 'FEE');
      await feeToken.setFeePercentage(200); // 2% = 200/10000
      
      // Mint to Alice
      await feeToken.mint(alice.address, ethers.parseEther('1000'));
      await feeToken.connect(alice).approve(await lockx.getAddress(), ethers.parseEther('1000'));
      
      const aliceTokenId = 0;
      
      // Deposit 100 tokens (98 will arrive due to 2% fee)
      await lockx.connect(alice).depositERC20(
        aliceTokenId,
        await feeToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );
      
      // Alice should only be credited with 98 tokens (what actually arrived)
      expect(await lockx.getERC20Bal(aliceTokenId, await feeToken.getAddress())).to.equal(ethers.parseEther('98'));
      
      console.log('✅ Fee-on-transfer tokens credited correctly (no overcredit)');
    });
  });
});

// Contract for overpaying router
const OVERPAYING_ROUTER = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract OverpayingRouter {
    function overpayingSwap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient
    ) external {
        // Pull tokenIn from caller
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        
        // Send DOUBLE the expected amount (200% instead of 95%)
        uint256 amountOut = amountIn * 2;
        require(amountOut >= minAmountOut, "Slippage");
        
        // Send tokenOut to recipient
        IERC20(tokenOut).transfer(recipient, amountOut);
    }
}
`;