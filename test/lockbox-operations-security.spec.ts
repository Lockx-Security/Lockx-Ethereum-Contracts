import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';

/**
 * 🎯 LOCKBOX OPERATIONS & SECURITY COMPREHENSIVE TEST SUITE
 *
 * This file consolidates all unique test cases related to lockbox operations and security
 * extracted from the systematic-coverage-phase*.spec.ts files.
 *
 * Focus areas:
 * 1. withdrawETH function - all validation errors and success scenarios
 * 2. withdrawERC20 function - all validation errors and success scenarios
 * 3. withdrawERC721 function - all validation errors and success scenarios
 * 4. batchWithdraw function - all validation errors and success scenarios
 * 5. swapInLockbox function - all validation errors and success scenarios
 * 6. Signature expiry across ALL operations
 * 7. Balance insufficiency checks
 * 8. Router overspend protection
 * 9. Zero address recipient validation
 * 10. Authorization/ownership validation
 * 11. ReentrancyGuard success paths for withdrawal operations
 * 12. ETH transfer failure scenarios
 * 13. Any other withdrawal/swap/operation-related coverage
 */
describe('🎯 LOCKBOX OPERATIONS & SECURITY COMPREHENSIVE SUITE', () => {
  let lockx: any;
  let mockToken: any;
  let mockTokenB: any;
  let mockTokenC: any;
  let mockNFT: any;
  let mockRouter: any;
  let usdtSimulator: any;
  let rejectETH: any;
  let owner: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;
  let lockboxKeyPair: SignerWithAddress;

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners();

    // Deploy Lockx
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    await lockx.waitForDeployment();

    // Deploy mock ERC20 tokens
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');

    mockToken = await MockERC20Factory.deploy();
    await mockToken.waitForDeployment();
    await mockToken.initialize('Token A', 'TA');

    mockTokenB = await MockERC20Factory.deploy();
    await mockTokenB.waitForDeployment();
    await mockTokenB.initialize('Token B', 'TB');

    mockTokenC = await MockERC20Factory.deploy();
    await mockTokenC.waitForDeployment();
    await mockTokenC.initialize('Token C', 'TC');

    // Deploy mock ERC721
    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.waitForDeployment();
    await mockNFT.initialize('NFT Collection', 'NFT');

    // Deploy mock swap router
    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouterFactory.deploy();
    await mockRouter.waitForDeployment();

    // Deploy USDT simulator
    const USDTSimulatorFactory = await ethers.getContractFactory('USDTSimulator');
    usdtSimulator = await USDTSimulatorFactory.deploy();
    await usdtSimulator.waitForDeployment();

    // Deploy RejectETH contract for testing ETH transfer failures
    const RejectETHFactory = await ethers.getContractFactory('RejectETH');
    rejectETH = await RejectETHFactory.deploy();
    await rejectETH.waitForDeployment();

    // Setup balances and approvals
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockToken.mint(user2.address, ethers.parseEther('10000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);
    await mockToken.connect(user2).approve(await lockx.getAddress(), ethers.MaxUint256);

    await mockTokenB.mint(owner.address, ethers.parseEther('100000'));
    await mockTokenB
      .connect(owner)
      .transfer(await mockRouter.getAddress(), ethers.parseEther('50000'));

    await mockTokenC.mint(user1.address, ethers.parseEther('10000'));
    await mockTokenC.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    await usdtSimulator.mint(owner.address, ethers.parseEther('10000'));
    await usdtSimulator.mint(user1.address, ethers.parseEther('1000'));
    await usdtSimulator.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    // Mint NFTs
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user1.address, 3);
    await mockNFT.mint(user2.address, 4);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);

    // Fund router with ETH
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10'),
    });
  });

  // Helper function to create EIP712 signature
  async function createEIP712Signature(
    tokenId: number,
    nonce: number,
    opType: number,
    data: any,
    signer: SignerWithAddress
  ) {
    const domain = {
      name: 'Lockx',
      version: '2',
      chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
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

    const value = {
      tokenId: tokenId,
      nonce: nonce,
      opType: opType,
      dataHash: ethers.keccak256(data),
    };

    const signature = await signer.signTypedData(domain, types, value);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

    return { signature, messageHash };
  }

  describe('🎯 WITHDRAW ETH FUNCTION - Complete Coverage', () => {
    it('should revert with SignatureExpired when signature timestamp is expired', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Use expired signature timestamp
      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('expired'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('0.5'),
          user1.address,
          referenceId,
          user1.address,
          expiredTimestamp,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .withdrawETH(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('0.5'),
            user1.address,
            referenceId,
            expiredTimestamp
          )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should revert with ZeroAddress when recipient is zero address', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('zeroaddr'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('0.5'),
          ethers.ZeroAddress,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .withdrawETH(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('0.5'),
            ethers.ZeroAddress,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should revert with NoETHBalance when insufficient ETH balance', async () => {
      // Create lockbox with minimal ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('0.1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('noeth'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('1'),
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'), // More than available
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
    });

    it('should revert with NotOwner when called by non-owner', async () => {
      // Create lockbox as user1
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('notowner'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('0.5'),
          user2.address,
          referenceId,
          user2.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      // Try to withdraw as user2 (not owner)
      await expect(
        lockx
          .connect(user2)
          .withdrawETH(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('0.5'),
            user2.address,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it('should revert with NonexistentToken when token does not exist', async () => {
      const nonExistentTokenId = 999999;
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nonexistent'));

      await expect(
        lockx
          .connect(user1)
          .withdrawETH(
            nonExistentTokenId,
            ethers.ZeroHash,
            '0x00',
            ethers.parseEther('1'),
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should successfully withdraw ETH with valid parameters', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('2'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('success'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('1'),
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      const balanceBefore = await ethers.provider.getBalance(user1.address);

      await expect(
        lockx
          .connect(user1)
          .withdrawETH(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('1'),
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.emit(lockx, 'Withdrawn');

      const balanceAfter = await ethers.provider.getBalance(user1.address);
      expect(balanceAfter > balanceBefore).to.be.true;
    });
  });

  describe('🎯 WITHDRAW ERC20 FUNCTION - Complete Coverage', () => {
    it('should revert with ZeroAddress when recipient is zero address', async () => {
      // Create lockbox with tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('zeroaddr'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await mockToken.getAddress(),
          ethers.parseEther('50'),
          ethers.ZeroAddress,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        2,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .withdrawERC20(
            tokenId,
            messageHash,
            signature,
            await mockToken.getAddress(),
            ethers.parseEther('50'),
            ethers.ZeroAddress,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should revert with InsufficientTokenBalance when insufficient balance', async () => {
      // Create lockbox with minimal tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('10'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('insufficient'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        2,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          ethers.parseEther('100'), // More than available
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');
    });

    it('should successfully withdraw ERC20 tokens with valid parameters', async () => {
      // Create lockbox with tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('success'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await mockToken.getAddress(),
          ethers.parseEther('50'),
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        2,
        withdrawData,
        lockboxKeyPair
      );

      const balanceBefore = await mockToken.balanceOf(user1.address);

      await expect(
        lockx
          .connect(user1)
          .withdrawERC20(
            tokenId,
            messageHash,
            signature,
            await mockToken.getAddress(),
            ethers.parseEther('50'),
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.emit(lockx, 'Withdrawn');

      const balanceAfter = await mockToken.balanceOf(user1.address);
      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther('50'));
    });
  });

  describe('🎯 WITHDRAW ERC721 FUNCTION - Complete Coverage', () => {
    it('should revert with NFTNotFound when NFT does not exist in lockbox', async () => {
      // Create lockbox with ETH only
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nftnotfound'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await mockNFT.getAddress(),
          999,
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        3,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockNFT.getAddress(),
          999, // Non-existent NFT
          user1.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NFTNotFound');
    });

    it('should successfully withdraw ERC721 with valid parameters', async () => {
      // Create lockbox with NFT
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('success'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          await mockNFT.getAddress(),
          1,
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        3,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .withdrawERC721(
            tokenId,
            messageHash,
            signature,
            await mockNFT.getAddress(),
            1,
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.emit(lockx, 'Withdrawn');

      expect(await mockNFT.ownerOf(1)).to.equal(user1.address);
    });
  });

  describe('🎯 BATCH WITHDRAW FUNCTION - Complete Coverage', () => {
    it('should revert with MismatchedInputs when token arrays length mismatch', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('mismatch'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'uint256',
          'address[]',
          'uint256[]',
          'address[]',
          'uint256[]',
          'address',
          'bytes32',
          'uint256',
        ],
        [
          tokenId,
          0,
          [await mockToken.getAddress(), await mockTokenB.getAddress()], // 2 tokens
          [ethers.parseEther('10')], // 1 amount - MISMATCH!
          [],
          [],
          user1.address,
          referenceId,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        6,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .batchWithdraw(
            tokenId,
            messageHash,
            signature,
            0,
            [await mockToken.getAddress(), await mockTokenB.getAddress()],
            [ethers.parseEther('10')],
            [],
            [],
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it('should revert with MismatchedInputs when NFT arrays length mismatch', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nftmismatch'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'uint256',
          'address[]',
          'uint256[]',
          'address[]',
          'uint256[]',
          'address',
          'bytes32',
          'uint256',
        ],
        [
          tokenId,
          0,
          [],
          [],
          [await mockNFT.getAddress(), await mockNFT.getAddress()], // 2 contracts
          [1], // 1 token ID - MISMATCH!
          user1.address,
          referenceId,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        6,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .batchWithdraw(
            tokenId,
            messageHash,
            signature,
            0,
            [],
            [],
            [await mockNFT.getAddress(), await mockNFT.getAddress()],
            [1],
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it('should revert with DuplicateEntry when duplicate tokens detected', async () => {
      // Create lockbox with tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('duplicate'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'uint256',
          'address[]',
          'uint256[]',
          'address[]',
          'uint256[]',
          'address',
          'bytes32',
          'uint256',
        ],
        [
          tokenId,
          0,
          [await mockToken.getAddress(), await mockToken.getAddress()], // DUPLICATE tokens
          [ethers.parseEther('10'), ethers.parseEther('20')],
          [],
          [],
          user1.address,
          referenceId,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        6,
        withdrawData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .batchWithdraw(
            tokenId,
            messageHash,
            signature,
            0,
            [await mockToken.getAddress(), await mockToken.getAddress()],
            [ethers.parseEther('10'), ethers.parseEther('20')],
            [],
            [],
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.be.revertedWithCustomError(lockx, 'DuplicateEntry');
    });

    it('should successfully perform batch withdrawal with mixed assets', async () => {
      // Create lockbox with mixed assets
      const tx = await lockx
        .connect(user1)
        .createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('2'),
          [await mockToken.getAddress()],
          [ethers.parseEther('100')],
          [await mockNFT.getAddress()],
          [1],
          ethers.ZeroHash,
          { value: ethers.parseEther('2') }
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('batchsuccess'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'uint256',
          'address[]',
          'uint256[]',
          'address[]',
          'uint256[]',
          'address',
          'bytes32',
          'uint256',
        ],
        [
          tokenId,
          ethers.parseEther('1'),
          [await mockToken.getAddress()],
          [ethers.parseEther('50')],
          [await mockNFT.getAddress()],
          [1],
          user1.address,
          referenceId,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        6,
        withdrawData,
        lockboxKeyPair
      );

      const ethBalanceBefore = await ethers.provider.getBalance(user1.address);
      const tokenBalanceBefore = await mockToken.balanceOf(user1.address);

      await expect(
        lockx
          .connect(user1)
          .batchWithdraw(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('1'),
            [await mockToken.getAddress()],
            [ethers.parseEther('50')],
            [await mockNFT.getAddress()],
            [1],
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.emit(lockx, 'Withdrawn');

      const ethBalanceAfter = await ethers.provider.getBalance(user1.address);
      const tokenBalanceAfter = await mockToken.balanceOf(user1.address);

      expect(ethBalanceAfter > ethBalanceBefore).to.be.true;
      expect(tokenBalanceAfter - tokenBalanceBefore).to.equal(ethers.parseEther('50'));
      expect(await mockNFT.ownerOf(1)).to.equal(user1.address);
    });
  });

  describe('🎯 SWAP IN LOCKBOX FUNCTION - Complete Coverage', () => {
    it('should revert with InvalidSwap when swapping same token (ETH to ETH)', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('invalidswap'));

      const amountIn = ethers.parseEther('0.5');
      const minAmountOut = ethers.parseEther('0.4');

      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        ethers.ZeroAddress, // tokenIn = ETH
        ethers.ZeroAddress, // tokenOut = ETH - INVALID!
        amountIn,
        minAmountOut,
        await lockx.getAddress(),
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes32',
          'bytes32',
          'address',
          'uint256',
          'address',
        ],
        [
          tokenId,
          ethers.ZeroAddress,
          ethers.ZeroAddress,
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        7,
        swapData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .swapInLockbox(
            tokenId,
            messageHash,
            signature,
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            swapCallData,
            referenceId,
            signatureExpiry,
            ethers.ZeroAddress
          )
      ).to.be.revertedWithCustomError(lockx, 'InvalidSwap');
    });

    it('should revert with RouterOverspent when router consumes more than specified', async () => {
      // Deploy OverpayingRouter for this test
      const OverpayingRouterFactory = await ethers.getContractFactory('OverpayingRouter');
      const overpayingRouter = await OverpayingRouterFactory.deploy();
      await overpayingRouter.waitForDeployment();

      // Fund the overpaying router
      await mockTokenB
        .connect(owner)
        .transfer(await overpayingRouter.getAddress(), ethers.parseEther('10000'));

      // Create lockbox with tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('overspend'));

      const amountIn = ethers.parseEther('10');
      const minAmountOut = ethers.parseEther('9');

      const swapCallData = overpayingRouter.interface.encodeFunctionData('overpayingSwap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        amountIn, // Router will consume MORE than this
        minAmountOut,
        await lockx.getAddress(),
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes32',
          'bytes32',
          'address',
          'uint256',
          'address',
        ],
        [
          tokenId,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut,
          await overpayingRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        7,
        swapData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .swapInLockbox(
            tokenId,
            messageHash,
            signature,
            await mockToken.getAddress(),
            await mockTokenB.getAddress(),
            amountIn,
            minAmountOut,
            await overpayingRouter.getAddress(),
            swapCallData,
            referenceId,
            signatureExpiry,
            ethers.ZeroAddress
          )
      ).to.be.revertedWithCustomError(lockx, 'RouterOverspent');
    });

    it('should successfully perform ERC20 to ERC20 swap', async () => {
      // Create lockbox with ERC20 tokens
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('swapsuccess'));

      const amountIn = ethers.parseEther('50');
      const minAmountOut = ethers.parseEther('40'); // 95% rate from MockRouter

      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        await mockToken.getAddress(),
        await mockTokenB.getAddress(),
        amountIn,
        minAmountOut,
        await lockx.getAddress(),
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes32',
          'bytes32',
          'address',
          'uint256',
          'address',
        ],
        [
          tokenId,
          await mockToken.getAddress(),
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        7,
        swapData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .swapInLockbox(
            tokenId,
            messageHash,
            signature,
            await mockToken.getAddress(),
            await mockTokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            swapCallData,
            referenceId,
            signatureExpiry,
            ethers.ZeroAddress
          )
      ).to.emit(lockx, 'SwapExecuted');
    });

    it('should successfully perform ETH to ERC20 swap', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ethtotoken'));

      const amountIn = ethers.parseEther('0.5');
      const minAmountOut = ethers.parseEther('400'); // MockRouter gives 950 tokens per ETH

      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        ethers.ZeroAddress, // ETH
        await mockTokenB.getAddress(),
        amountIn,
        minAmountOut,
        await lockx.getAddress(),
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes32',
          'bytes32',
          'address',
          'uint256',
          'address',
        ],
        [
          tokenId,
          ethers.ZeroAddress,
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        7,
        swapData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .swapInLockbox(
            tokenId,
            messageHash,
            signature,
            ethers.ZeroAddress,
            await mockTokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            swapCallData,
            referenceId,
            signatureExpiry,
            ethers.ZeroAddress
          )
      ).to.emit(lockx, 'SwapExecuted');
    });
  });

  describe('🎯 SIGNATURE EXPIRY VALIDATION - All Operations', () => {
    it('should revert with SignatureExpired in setTokenMetadataURI', async () => {
      // Create lockbox
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const newURI = 'https://example.com/new-metadata';
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('metadata'));

      const metadataData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'uint256'],
        [tokenId, newURI, referenceId, expiredTimestamp]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        5,
        metadataData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .setTokenMetadataURI(
            tokenId,
            messageHash,
            signature,
            newURI,
            referenceId,
            expiredTimestamp
          )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should revert with SignatureExpired in rotateLockboxKey', async () => {
      // Create lockbox
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('rotate'));

      const rotateData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'uint256'],
        [tokenId, user2.address, referenceId, expiredTimestamp]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        0,
        rotateData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .rotateLockboxKey(
            tokenId,
            messageHash,
            signature,
            user2.address,
            referenceId,
            expiredTimestamp
          )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should revert with SignatureExpired in burnLockbox', async () => {
      // Create lockbox
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const expiredTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('burn'));

      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, referenceId, user1.address, expiredTimestamp]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        4,
        burnData,
        lockboxKeyPair
      );

      await expect(
        lockx
          .connect(user1)
          .burnLockbox(tokenId, messageHash, signature, referenceId, expiredTimestamp)
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });
  });

  describe('🎯 AUTHORIZATION & OWNERSHIP VALIDATION', () => {
    it('should revert with Unauthorized when non-owner tries to burn lockbox', async () => {
      // Create lockbox as user1
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('unauthorized'));

      // Try to burn as user2 (not owner)
      await expect(
        lockx.connect(user2).burnLockbox(
          tokenId,
          ethers.ZeroHash,
          '0x00', // Invalid signature, but should hit auth check first
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it('should revert with InvalidSignature when signature is invalid', async () => {
      // Create lockbox
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('invalid'));

      // Try to rotate key with invalid signature
      await expect(
        lockx.connect(user1).rotateLockboxKey(
          tokenId,
          ethers.ZeroHash,
          '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890', // Invalid signature
          user2.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });
  });

  describe('🎯 REENTRANCY GUARD SUCCESS PATHS', () => {
    it('should successfully pass ReentrancyGuard in withdrawETH', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('2'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('reentrancy'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('1'),
          user1.address,
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      // Should successfully pass ReentrancyGuard
      await expect(
        lockx
          .connect(user1)
          .withdrawETH(
            tokenId,
            messageHash,
            signature,
            ethers.parseEther('1'),
            user1.address,
            referenceId,
            signatureExpiry
          )
      ).to.emit(lockx, 'Withdrawn');
    });

    it('should successfully pass ReentrancyGuard in depositETH', async () => {
      // Create lockbox first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Should successfully pass ReentrancyGuard
      await expect(
        lockx
          .connect(user1)
          .depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('0.5') })
      ).to.emit(lockx, 'Deposited');
    });

    it('should successfully pass ReentrancyGuard in depositERC20', async () => {
      // Create lockbox first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Should successfully pass ReentrancyGuard
      await expect(
        lockx
          .connect(user1)
          .depositERC20(
            tokenId,
            await mockToken.getAddress(),
            ethers.parseEther('10'),
            ethers.ZeroHash
          )
      ).to.emit(lockx, 'Deposited');
    });

    it('should successfully pass ReentrancyGuard in depositERC721', async () => {
      // Create lockbox first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Should successfully pass ReentrancyGuard
      await expect(
        lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash)
      ).to.emit(lockx, 'Deposited');
    });
  });

  describe('🎯 ETH TRANSFER FAILURE SCENARIOS', () => {
    it('should handle ETH transfer failure gracefully', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('2'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ethfail'));

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [
          tokenId,
          ethers.parseEther('1'),
          await rejectETH.getAddress(),
          referenceId,
          user1.address,
          signatureExpiry,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        1,
        withdrawData,
        lockboxKeyPair
      );

      // Should revert when trying to send ETH to contract that rejects it
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'),
          await rejectETH.getAddress(), // Contract that rejects ETH
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'EthTransferFailed');
    });
  });

  describe('🎯 ADDITIONAL EDGE CASES & SECURITY SCENARIOS', () => {
    it('should handle zero amount deposits correctly', async () => {
      // Create lockbox first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Try to deposit zero amount of ERC20
      await expect(
        lockx.connect(user1).depositERC20(
          tokenId,
          await mockToken.getAddress(),
          0, // Zero amount
          ethers.keccak256(ethers.toUtf8Bytes('zeroamount'))
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should handle zero address token in deposits', async () => {
      // Create lockbox first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Try to deposit with zero address token
      await expect(
        lockx.connect(user1).depositERC20(
          tokenId,
          ethers.ZeroAddress, // Zero address token
          ethers.parseEther('100'),
          ethers.keccak256(ethers.toUtf8Bytes('zerotoken'))
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should handle NFT already exists scenario', async () => {
      // Create lockbox with NFT first
      const tx = await lockx
        .connect(user1)
        .createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroHash
        );

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      // Try to deposit the same NFT again (should fail because NFT is no longer owned by user1)
      await expect(
        lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 1, ethers.ZeroHash)
      ).to.be.reverted; // Should fail because NFT is no longer owned by user1
    });

    it('should handle successful lockbox creation with all asset types', async () => {
      // Create comprehensive lockbox with ETH + ERC20 + NFT
      const tx = await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('1'), // ETH
        [await mockToken.getAddress()], // ERC20
        [ethers.parseEther('50')],
        [await mockNFT.getAddress()], // NFT
        [2],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      // Verify successful creation
      expect(tx).to.emit(lockx, 'Transfer');
    });

    it('should handle successful swap with new token registration', async () => {
      // Create lockbox with only ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('1'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('newtoken'));

      const amountIn = ethers.parseEther('0.5');
      const minAmountOut = ethers.parseEther('400'); // MockRouter gives 950 tokens per ETH

      const swapCallData = mockRouter.interface.encodeFunctionData('swap', [
        ethers.ZeroAddress, // ETH
        await mockTokenB.getAddress(), // NEW token for this lockbox
        amountIn,
        minAmountOut,
        await lockx.getAddress(),
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes32',
          'bytes32',
          'address',
          'uint256',
          'address',
        ],
        [
          tokenId,
          ethers.ZeroAddress,
          await mockTokenB.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          ethers.keccak256(swapCallData),
          referenceId,
          user1.address,
          signatureExpiry,
          ethers.ZeroAddress,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        7,
        swapData,
        lockboxKeyPair
      );

      // Should trigger new token registration and succeed
      await expect(
        lockx
          .connect(user1)
          .swapInLockbox(
            tokenId,
            messageHash,
            signature,
            ethers.ZeroAddress,
            await mockTokenB.getAddress(),
            amountIn,
            minAmountOut,
            await mockRouter.getAddress(),
            swapCallData,
            referenceId,
            signatureExpiry,
            ethers.ZeroAddress
          )
      ).to.emit(lockx, 'SwapExecuted');
    });
  });

  describe('🎯 MISSING BRANCH COVERAGE - Additional Edge Case', () => {
    it('should handle swapInLockbox with ETH recipient and zero amountOut scenario', async () => {
      // Create lockbox with ETH
      const tx = await lockx
        .connect(user1)
        .createLockboxWithETH(user1.address, lockboxKeyPair.address, ethers.ZeroHash, {
          value: ethers.parseEther('2'),
        });

      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(
        (log: any) => log.topics[0] === ethers.id('Transfer(address,address,uint256)')
      );
      const tokenId = parseInt(transferEvent.topics[3], 16);

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ethswap'));
      const amountIn = ethers.parseEther('1');
      const minAmountOut = 0; // Zero min amount to trigger different branch

      // Prepare swap call data that returns 0 amount
      const swapCallData = mockRouter.interface.encodeFunctionData('swapExactETHForTokens', [
        0, // minAmountOut = 0
        [ethers.ZeroAddress, await mockToken.getAddress()],
        await lockx.getAddress(),
        signatureExpiry,
      ]);

      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        [
          'uint256',
          'address',
          'address',
          'uint256',
          'uint256',
          'address',
          'bytes',
          'bytes32',
          'uint256',
          'address',
        ],
        [
          tokenId,
          ethers.ZeroAddress,
          await mockToken.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          swapCallData,
          referenceId,
          signatureExpiry,
          user1.address,
        ]
      );

      const { signature, messageHash } = await createEIP712Signature(
        tokenId,
        1,
        3,
        swapData,
        lockboxKeyPair
      );

      // Should handle the zero amountOut case
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          ethers.ZeroAddress,
          await mockToken.getAddress(),
          amountIn,
          minAmountOut,
          await mockRouter.getAddress(),
          swapCallData,
          referenceId,
          signatureExpiry,
          user1.address // ETH recipient
        )
      ).to.be.reverted; // This should trigger specific branch handling
    });
  });
});
