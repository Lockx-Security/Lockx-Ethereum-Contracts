import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721, RejectETH, MockSwapRouter } from '../typechain-types';
import { Signer } from 'ethers';
import { time } from '@nomicfoundation/hardhat-network-helpers';

// Malicious contract that only partially consumes allowance
const MALICIOUS_ROUTER_CODE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';

contract PartialAllowanceConsumer {
    function partialSwap(address token, uint256 amount) external payable {
        // Only consume half the approved amount, leaving the rest
        uint256 halfAmount = amount / 2;
        IERC20(token).transferFrom(msg.sender, address(this), halfAmount);
        
        // Don't do anything with it - just consume partial allowance
        // This tests the currentAllowance != 0 branch in the cleanup
    }
    
    receive() external payable {}
}
`;

describe('Malicious Edge Case Coverage Tests', () => {
  let lockx: Lockx;
  let tokenA: MockERC20;
  let mockNft: MockERC721;
  let rejectETH: RejectETH;
  let router: MockSwapRouter;
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

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721Factory.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const RejectETHFactory = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETHFactory.deploy();

    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    router = await MockSwapRouterFactory.deploy();

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

    // Setup NFT
    await mockNft.mint(await user.getAddress(), 1);
    await mockNft.mint(await user.getAddress(), 2);
    await mockNft.connect(user).approve(await lockx.getAddress(), 1);
    await mockNft.connect(user).approve(await lockx.getAddress(), 2);
    await lockx.connect(user).depositERC721(tokenId, await mockNft.getAddress(), 1, ethers.ZeroHash);
    await lockx.connect(user).depositERC721(tokenId, await mockNft.getAddress(), 2, ethers.ZeroHash);
  });


  describe('🎯 Duplicate Entry Detection', () => {
    it('should hit duplicate NFT check in batchWithdraw (Lines 1862-1863)', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Create valid signature for batch withdraw with duplicate NFTs
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [await mockNft.getAddress(), await mockNft.getAddress()], // duplicate nftContracts
          [1, 1], // duplicate nftTokenIds
          await user.getAddress(), // recipient
          ethers.ZeroHash, // referenceId
          user.address, // msg.sender
          signatureExpiry
        ]
      );
      
      const dataHash = ethers.keccak256(authData);
      const message = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 6, // BATCH_WITHDRAW
        dataHash: dataHash
      };
      
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [await mockNft.getAddress(), await mockNft.getAddress()], // duplicate nftContracts
          [1, 1], // duplicate nftTokenIds
          await user.getAddress(), // recipient
          ethers.ZeroHash, // referenceId
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });

    it('should hit duplicate ERC20 check in batchWithdraw (Line 1831)', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      // Create valid signature for batch withdraw with duplicate ERC20 tokens
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          0, // amountETH
          [await tokenA.getAddress(), await tokenA.getAddress()], // duplicate tokenAddresses
          [ethers.parseEther('10'), ethers.parseEther('20')], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          await user.getAddress(), // recipient
          ethers.ZeroHash, // referenceId
          user.address, // msg.sender
          signatureExpiry
        ]
      );
      
      const dataHash = ethers.keccak256(authData);
      const message = {
        tokenId: tokenId,
        nonce: nonce,
        opType: 6, // BATCH_WITHDRAW
        dataHash: dataHash
      };
      
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).batchWithdraw(
          tokenId, messageHash, signature,
          0, // amountETH
          [await tokenA.getAddress(), await tokenA.getAddress()], // duplicate tokenAddresses
          [ethers.parseEther('10'), ethers.parseEther('20')], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          await user.getAddress(), // recipient
          ethers.ZeroHash, // referenceId
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });
  });

});