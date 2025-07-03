import { ethers } from 'hardhat';
import { expect } from 'chai';
import { domain as buildDomain, types } from './utils/eip712';

describe('Final Line Coverage - Hit Remaining Lines', function () {
  let lockx: any;
  let mockToken: any;
  let feeToken: any;
  let owner: any;
  let lockboxKey: any;
  let newKey: any;

  const OPERATION_TYPE = {
    ROTATE_KEY: 0,
    WITHDRAW_ETH: 1,
    WITHDRAW_ERC20: 2,
    WITHDRAW_NFT: 3,
    BURN_LOCKBOX: 4,
    SET_TOKEN_URI: 5,
    BATCH_WITHDRAW: 6,
  };

  beforeEach(async function () {
    [owner, lockboxKey, newKey] = await ethers.getSigners();

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    await lockx.waitForDeployment();

    const ERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await ERC20Factory.deploy();
    await mockToken.waitForDeployment();

    const FeeTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeTokenFactory.deploy();
    await feeToken.waitForDeployment();

    // Mint test tokens
    await mockToken.mint(owner.address, ethers.parseEther('1000'));
    await feeToken.mint(owner.address, ethers.parseEther('1000'));
  });

  describe('SignatureVerification.sol Line 80 - Explicit Key Update', function () {
    it('should explicitly hit the key update line with proper conditions', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Get current key to verify change
      const oldKey = await lockx.getActiveLockboxPublicKeyForToken(tokenId);
      expect(oldKey).to.equal(lockboxKey.address);

      // Create key rotation signature with explicit non-zero address
      const nonce = await lockx.getNonce(tokenId);
      const referenceId = ethers.encodeBytes32String('explicit-rotation');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      const rotationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, newKey.address, referenceId, owner.address, signatureExpiry]
      );

      const dataHash = ethers.keccak256(rotationData);
      const opStruct = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.ROTATE_KEY,
        dataHash,
      };

      const domain = await buildDomain(await lockx.getAddress());
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
      const signature = await lockboxKey.signTypedData(domain, types, opStruct);

      // Execute key rotation - this MUST hit line 80
      await lockx.rotateLockboxKey(
        tokenId,
        messageHash,
        signature,
        newKey.address, // Explicit non-zero address
        referenceId,
        signatureExpiry
      );

      // Verify the actual key change happened
      const updatedKey = await lockx.getActiveLockboxPublicKeyForToken(tokenId);
      expect(updatedKey).to.equal(newKey.address);
      expect(updatedKey).to.not.equal(oldKey);
    });
  });

  describe('Deposits.sol Lines 63,90,91,93,94 - Internal Function Paths', function () {
    it('should hit line 63: _requireExists with exception handling', async function () {
      // Try to access a completely non-existent token
      // This should hit the catch block in _requireExists
      await expect(
        lockx.getFullLockbox(999999)
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('should hit lines 90,91,93,94: Complete _depositERC20 internal flow', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Test normal token deposit - hits all internal _depositERC20 lines
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('100'));

      // This should execute all lines in _depositERC20:
      // Line 90: before balance check
      // Line 91: safeTransferFrom call
      // Line 93: received amount validation
      // Line 94: token registration logic
      await lockx.depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('internal-deposit')
      );

      // Test with fee token to hit zero received validation
      await feeToken.setFeePercentage(100); // 100% fee = zero received
      await feeToken.approve(await lockx.getAddress(), ethers.parseEther('100'));

      // This should hit the zero received check
      await expect(
        lockx.depositERC20(
          tokenId,
          await feeToken.getAddress(),
          ethers.parseEther('100'),
          ethers.encodeBytes32String('zero-received')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should test direct depositETH to hit basic deposit lines', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Direct ETH deposit - should hit depositETH function lines
      await lockx.depositETH(
        tokenId,
        ethers.encodeBytes32String('direct-eth'),
        { value: ethers.parseEther('0.5') }
      );

      // Verify deposit
      const data = await lockx.getFullLockbox(tokenId);
      expect(data.lockboxETH).to.equal(ethers.parseEther('1.5'));
    });

    it('should test edge case scenarios for complete line coverage', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Test zero ETH deposit (should fail)
      await expect(
        lockx.depositETH(tokenId, ethers.encodeBytes32String('zero-eth'), { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test zero address token (should fail)
      await expect(
        lockx.depositERC20(
          tokenId,
          ethers.ZeroAddress,
          ethers.parseEther('100'),
          ethers.encodeBytes32String('zero-addr')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      // Test zero amount token (should fail)
      await expect(
        lockx.depositERC20(
          tokenId,
          await mockToken.getAddress(),
          0,
          ethers.encodeBytes32String('zero-amount')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });
  });

  describe('Complete Function Path Coverage', function () {
    it('should test all deposit function paths systematically', async function () {
      // Test depositETH function completely
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('complete'),
        { value: ethers.parseEther('2') }
      );

      const tokenId = 0;

      // Test successful depositERC20 flow
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('200'));
      
      // First deposit - new token registration
      await lockx.depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('new-token')
      );

      // Second deposit - existing token addition
      await lockx.depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('existing-token')
      );

      // Verify final state
      const finalData = await lockx.getFullLockbox(tokenId);
      expect(finalData.erc20Tokens[0].balance).to.equal(ethers.parseEther('200'));
      expect(finalData.lockboxETH).to.equal(ethers.parseEther('2'));
    });
  });
}); 