import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';

describe('Edge Cases and Error Scenarios', () => {
  let lockx: any;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let erc20: MockERC20;
  let feeToken: MockFeeOnTransferToken;
  let nft: MockERC721;

  const OPERATION_TYPE = {
    WITHDRAW_ETH: 1,
    WITHDRAW_ERC20: 2,
    WITHDRAW_NFT: 3,
    BURN_LOCKBOX: 4,
    ROTATE_KEY: 5,
    BATCH_WITHDRAW: 6,
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
    [owner, user, user2] = await ethers.getSigners();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const ERC20 = await ethers.getContractFactory('MockERC20');
    erc20 = await ERC20.deploy() as MockERC20;
    await erc20.initialize('Test Token', 'TEST');

    const FeeToken = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeToken.deploy() as MockFeeOnTransferToken;
    await feeToken.initialize('Fee Token', 'FEE');

    const NFT = await ethers.getContractFactory('MockERC721');
    nft = await NFT.deploy() as MockERC721;
    await nft.initialize('Test NFT', 'TNFT');

    await erc20.mint(user.address, ethers.parseEther('100000'));
    await feeToken.mint(user.address, ethers.parseEther('100000'));
    for (let i = 1; i <= 100; i++) {
      await nft.mint(user.address, i);
    }

    await erc20.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
    await feeToken.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
    await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('Signature and Authentication Edge Cases', () => {
    it('should handle signature expiry edge cases', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Test signature exactly at expiry time
      const exactExpiryTime = Math.floor(Date.now() / 1000);
      
      // Wait a moment to ensure block.timestamp > signatureExpiry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, user.address, exactExpiryTime]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, exactExpiryTime)
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should test invalid signature scenarios', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      const wrongKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      
      // Sign with wrong key
      const wrongSignature = await wrongKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, wrongSignature, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });

    it('should test nonce reuse scenarios', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('2') }
      );
      const tokenId = 0;

      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      // First withdrawal should succeed
      await lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);

      // Second withdrawal with same nonce should fail
      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });
  });

  describe('Ownership and Access Control Edge Cases', () => {
    it('should test non-existent token operations', async () => {
      const nonExistentTokenId = 999;

      await expect(
        lockx.connect(user).depositETH(nonExistentTokenId, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken');

      await expect(
        lockx.connect(user).getFullLockbox(nonExistentTokenId)
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should test ownership validation', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // User2 should not be able to deposit
      await expect(
        lockx.connect(user2).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      await expect(
        lockx.connect(user2).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });
  });

  describe('Array and State Management Edge Cases', () => {
    it('should handle single element array operations', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithERC20(
        user.address,
        lockboxKeyWallet.address,
        await erc20.getAddress(),
        ethers.parseEther('1000'),
        ethers.ZeroHash
      );
      const tokenId = 0;

      // Withdraw the only token (should clean up arrays)
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await erc20.getAddress(), ethers.parseEther('1000'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ERC20, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).withdrawERC20(tokenId, messageHash, signature, await erc20.getAddress(), ethers.parseEther('1000'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);

      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens.length).to.equal(0);
    });

    it('should handle maximum array operations', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Add many tokens to test array limits
      const tokens = [];
      for (let i = 0; i < 20; i++) {
        const Token = await ethers.getContractFactory('MockERC20');
        const token = await Token.deploy() as MockERC20;
        await token.initialize(`MaxToken${i}`, `MT${i}`);
        await token.mint(user.address, ethers.parseEther('1000'));
        await token.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
        tokens.push(token);
        
        await lockx.connect(user).depositERC20(tokenId, await token.getAddress(), ethers.parseEther('10'), ethers.ZeroHash);
      }

      // Add many NFTs
      for (let i = 1; i <= 50; i++) {
        await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), i, ethers.ZeroHash);
      }

      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens.length).to.equal(20);
      expect(lockboxData.nftContracts.length).to.equal(50);
    });
  });

  describe('Fee-on-Transfer Token Edge Cases', () => {
    it('should handle various fee percentages', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Test 0% fee
      await feeToken.setFeePercentage(0);
      await lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);

      // Test 50% fee
      await feeToken.setFeePercentage(5000);
      await lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);

      // Test 99.99% fee (should still work with minimal amount)
      await feeToken.setFeePercentage(9999);
      await lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);

      // Test 100% fee (should fail)
      await feeToken.setFeePercentage(10000);
      await expect(
        lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });
  });

  describe('ETH Transfer Failure Scenarios', () => {
    it('should handle ETH transfer to contracts that reject ETH', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('5') }
      );
      const tokenId = 0;

      // Deploy contract that rejects ETH
      const RejectETH = await ethers.getContractFactory('RejectETH');
      const rejectETH = await RejectETH.deploy();

      // Test single ETH withdrawal failure
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), await rejectETH.getAddress(), ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('1'), await rejectETH.getAddress(), ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'EthTransferFailed');
    });
  });

  describe('Complex State Transitions', () => {
    it('should handle key rotation scenarios', async () => {
      const lockboxKeyWallet1 = ethers.Wallet.createRandom();
      const lockboxKeyWallet2 = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet1.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Key rotation
      let nonce = await lockx.connect(user).getNonce(tokenId);
      let data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, lockboxKeyWallet2.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      let dataHash = ethers.keccak256(data);
      let opStruct = { tokenId, nonce, opType: OPERATION_TYPE.ROTATE_KEY, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      let signature = await lockboxKeyWallet1.signTypedData(domain, types, opStruct);
      let messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).rotateLockboxKey(tokenId, messageHash, signature, lockboxKeyWallet2.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);

      // Verify old key no longer works
      nonce = await lockx.connect(user).getNonce(tokenId);
      data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      dataHash = ethers.keccak256(data);
      opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const oldSignature = await lockboxKeyWallet1.signTypedData(domain, types, opStruct);
      messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, oldSignature, ethers.parseEther('0.1'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'InvalidSignature');
    });
  });
}); 