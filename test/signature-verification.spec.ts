import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20 } from '../typechain-types';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { domain as buildDomain, types } from './utils/eip712';

describe('SignatureVerification Extended', function () {
  let lockx: Lockx;
  let mockERC20: MockERC20;
  let owner: SignerWithAddress;
  let lockboxSigner: SignerWithAddress;
  let recipient: SignerWithAddress;

  const OPERATION_TYPE = {
    WITHDRAW_ETH: 1,
  };

  async function signWithdrawETH(
    tokenId: bigint,
    amount: bigint,
    recipient: string,
    referenceId: string,
    signatureExpiry: bigint,
    caller: string
  ) {
    const nonce = await lockx.getNonce(tokenId);
    const data = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, amount, recipient, referenceId, caller, signatureExpiry]
    );
    const dataHash = ethers.keccak256(data);

    const opStruct = {
      tokenId,
      nonce,
      opType: OPERATION_TYPE.WITHDRAW_ETH,
      dataHash,
    };

    const dom = await buildDomain(await lockx.getAddress());
    const messageHash = ethers.TypedDataEncoder.hash(dom, types, opStruct);
    const sig = await lockboxSigner.signTypedData(dom, types, opStruct);
    return { messageHash, sig };
  }

  beforeEach(async function () {
    [owner, lockboxSigner, recipient] = await ethers.getSigners();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockERC20 = await MockERC20Factory.deploy();

    // Create a lockbox with ETH
    const referenceId = ethers.id('test');
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxSigner.address,
      referenceId,
      { value: ethers.parseEther('2') }
    );
  });

  describe('Signature Format Validation', function () {
    it('should reject empty signature', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.5');
      const blk = await ethers.provider.getBlock('latest');
      const signatureExpiry = BigInt(blk!.timestamp) + 3600n;

      // Create proper messageHash but use empty signature
      const { messageHash } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        signatureExpiry,
        owner.address
      );

      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          '0x',
          amount,
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ECDSAInvalidSignatureLength');
    });

    it('should reject signature with wrong length', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.5');
      const blk = await ethers.provider.getBlock('latest');
      const signatureExpiry = BigInt(blk!.timestamp) + 3600n;

      const { messageHash } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        signatureExpiry,
        owner.address
      );

      // Wrong length signature
      const wrongSig = '0x' + '12'.repeat(64); // 64 bytes instead of 65

      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          wrongSig,
          amount,
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ECDSAInvalidSignatureLength');
    });

    it('should reject signature from wrong signer', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.5');
      const blk = await ethers.provider.getBlock('latest');
      const signatureExpiry = BigInt(blk!.timestamp) + 3600n;

      // Sign with owner instead of lockboxSigner
      const nonce = await lockx.getNonce(0n);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [0n, amount, recipient.address, referenceId, owner.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);

      const opStruct = {
        tokenId: 0n,
        nonce,
        opType: OPERATION_TYPE.WITHDRAW_ETH,
        dataHash,
      };

      const dom = await buildDomain(await lockx.getAddress());
      const messageHash = ethers.TypedDataEncoder.hash(dom, types, opStruct);
      const wrongSig = await owner.signTypedData(dom, types, opStruct); // Wrong signer

      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          wrongSig,
          amount,
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });
  });

  describe('Signature Expiry', function () {
    it('should reject expired signatures', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.1');
      
      // Use expired timestamp
      const expiredTimestamp = 1000n; // Very old timestamp

      const { messageHash, sig } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        expiredTimestamp,
        owner.address
      );

      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          sig,
          amount,
          recipient.address,
          referenceId,
          expiredTimestamp
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should accept valid future expiry', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.1');
      const blk = await ethers.provider.getBlock('latest');
      const futureExpiry = BigInt(blk!.timestamp) + 3600n; // 1 hour from now

      const { messageHash, sig } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        futureExpiry,
        owner.address
      );

      // Should not revert with valid future expiry
      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          sig,
          amount,
          recipient.address,
          referenceId,
          futureExpiry
        )
      ).to.not.be.reverted;
    });
  });

  describe('Balance Validation', function () {
    it('should reject withdrawal of more ETH than balance', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('10'); // More than the 2 ETH deposited
      const blk = await ethers.provider.getBlock('latest');
      const signatureExpiry = BigInt(blk!.timestamp) + 3600n;

      const { messageHash, sig } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        signatureExpiry,
        owner.address
      );

      await expect(
        lockx.withdrawETH(
          0n,
          messageHash,
          sig,
          amount,
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');
    });
  });

  describe('Message Hash Validation', function () {
    it('should reject mismatched message hash', async function () {
      const referenceId = ethers.id('test');
      const amount = ethers.parseEther('0.1');
      const blk = await ethers.provider.getBlock('latest');
      const signatureExpiry = BigInt(blk!.timestamp) + 3600n;

      const { sig } = await signWithdrawETH(
        0n,
        amount,
        recipient.address,
        referenceId,
        signatureExpiry,
        owner.address
      );

      // Create a different message hash manually
      const wrongHash = ethers.keccak256(ethers.toUtf8Bytes('wrong'));

      await expect(
        lockx.withdrawETH(
          0n,
          wrongHash, // Wrong message hash
          sig,
          amount,
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InvalidMessageHash');
    });
  });
}); 