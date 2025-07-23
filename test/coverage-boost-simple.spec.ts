import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { MockERC20, MockERC721, MockFeeOnTransferToken, Lockx, RejectETH } from '../typechain-types';

describe('🚀 SIMPLE COVERAGE BOOST', () => {
  let lockx: Lockx;
  let owner: any, user: any, attacker: any, lockboxKeypair: any;
  let tokenA: MockERC20, nft: MockERC721, feeToken: MockFeeOnTransferToken;
  let domain: any, types: any;
  let tokenId: number;

  const OPERATION_TYPE = {
    WITHDRAW_ASSETS: 0,
    ROTATE_KEY: 1,
    BURN: 3
  };

  beforeEach(async () => {
    [owner, user, attacker, lockboxKeypair] = await ethers.getSigners();
    
    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20Factory.deploy();
    await tokenA.initialize('Token A', 'TOKA');
    
    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    nft = await MockERC721Factory.deploy();
    await nft.initialize('Mock NFT', 'MNFT');
    
    const FeeTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeTokenFactory.deploy();
    await feeToken.initialize('Fee Token', 'FEE');
    
    // Setup EIP712
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
    
    // Create a lockbox
    await lockx.connect(user).createLockboxWithETH(
      user.address,
      lockboxKeypair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    tokenId = 0;
    
    await tokenA.mint(user.address, ethers.parseEther('1000'));
    await tokenA.mint(owner.address, ethers.parseEther('1000'));
  });

  describe('💎 HIT MISSING BRANCHES', () => {
    it('should hit SelfMintOnly branches', async () => {
      await tokenA.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await expect(
        lockx.createLockboxWithERC20(
          user.address, // Different from msg.sender
          lockboxKeypair.address,
          await tokenA.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
      
      await nft.mint(owner.address, 10);
      await nft.approve(await lockx.getAddress(), 10);
      await expect(
        lockx.createLockboxWithERC721(
          user.address, // Different from msg.sender
          lockboxKeypair.address,
          await nft.getAddress(),
          10,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
    });

    it('should hit ZeroKey branches', async () => {
      await tokenA.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await expect(
        lockx.createLockboxWithERC20(
          owner.address,
          ethers.ZeroAddress, // Zero key
          await tokenA.getAddress(),
          ethers.parseEther('100'),
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
      
      await nft.mint(owner.address, 11);
      await nft.approve(await lockx.getAddress(), 11);
      await expect(
        lockx.createLockboxWithERC721(
          owner.address,
          ethers.ZeroAddress, // Zero key
          await nft.getAddress(),
          11,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('should hit zero received amount branch', async () => {
      await feeToken.mint(user.address, ethers.parseEther('100'));
      await feeToken.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await feeToken.setFeePercentage(10000); // 100% fee = zero received
      
      await expect(
        lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should hit zero recipient error branches', async () => {
      // Add some ETH first
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') });
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const ethData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), ethers.ZeroAddress, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const ethHash = ethers.keccak256(ethData);
      const ethMessage = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash: ethHash };
      const ethSig = await lockboxKeypair.signTypedData(domain, types, ethMessage);
      const ethMsgHash = ethers.TypedDataEncoder.hash(domain, types, ethMessage);
      
      await expect(
        lockx.connect(user).withdrawETH(
          tokenId, ethMsgHash, ethSig,
          ethers.parseEther('0.5'), ethers.ZeroAddress, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should hit signature expiry branches', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) - 1; // Expired
      
      const keyData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, attacker.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const keyHash = ethers.keccak256(keyData);
      const keyMessage = { tokenId, nonce, opType: OPERATION_TYPE.ROTATE_KEY, dataHash: keyHash };
      const keySig = await lockboxKeypair.signTypedData(domain, types, keyMessage);
      const keyMsgHash = ethers.TypedDataEncoder.hash(domain, types, keyMessage);
      
      await expect(
        lockx.connect(user).rotateLockboxKey(
          tokenId, keyMsgHash, keySig,
          attacker.address, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
      
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const burnHash = ethers.keccak256(burnData);
      const burnMessage = { tokenId, nonce, opType: OPERATION_TYPE.BURN, dataHash: burnHash };
      const burnSig = await lockboxKeypair.signTypedData(domain, types, burnMessage);
      const burnMsgHash = ethers.TypedDataEncoder.hash(domain, types, burnMessage);
      
      await expect(
        lockx.connect(user).burnLockbox(
          tokenId, burnMsgHash, burnSig, ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it.skip('should hit ETH transfer failure', async () => {
      const RejectETHFactory = await ethers.getContractFactory('RejectETH');
      const rejectETH = await RejectETHFactory.deploy();
      
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') });
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('0.5'), await rejectETH.getAddress(), ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await expect(
        lockx.connect(user).withdrawETH(
          tokenId, messageHash, signature,
          ethers.parseEther('0.5'), await rejectETH.getAddress(), ethers.ZeroHash, signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'EthTransferFailed');
    });

    it('should hit successful nonReentrant paths', async () => {
      // Create additional lockboxes to hit nonReentrant success paths
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKeypair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      );
      
      await tokenA.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.createLockboxWithERC20(
        owner.address,
        lockboxKeypair.address,
        await tokenA.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );
      
      await nft.mint(owner.address, 12);
      await nft.approve(await lockx.getAddress(), 12);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKeypair.address,
        await nft.getAddress(),
        12,
        ethers.ZeroHash
      );
    });

    it('should hit getFullLockbox owner check paths', async () => {
      // Test normal path (user is owner)
      const result = await lockx.connect(user).getFullLockbox(tokenId);
      expect(result[0]).to.equal(ethers.parseEther('1')); // ethBalance is first element
      
      // Test non-owner path
      await expect(
        lockx.connect(attacker).getFullLockbox(tokenId)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it.skip('should hit array removal paths', async () => {
      // Add and remove tokens to hit array management branches
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('200'));
      await lockx.connect(user).depositERC20(tokenId, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      // Remove to hit array cleanup logic
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const signatureExpiry = (await time.latest()) + 3600;
      
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await tokenA.getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, user.address, signatureExpiry]
      );
      const dataHash = ethers.keccak256(data);
      const message = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ASSETS, dataHash };
      const signature = await lockboxKeypair.signTypedData(domain, types, message);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, message);
      
      await lockx.connect(user).withdrawERC20(
        tokenId, messageHash, signature,
        await tokenA.getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, signatureExpiry
      );
    });
  });
});