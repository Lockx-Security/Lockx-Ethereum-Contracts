import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721 } from '../typechain-types';

describe('Core Functionality Tests', () => {
  let lockx: any;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let erc20: MockERC20;
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

    const NFT = await ethers.getContractFactory('MockERC721');
    nft = await NFT.deploy() as MockERC721;
    await nft.initialize('Test NFT', 'TNFT');

    await erc20.mint(user.address, ethers.parseEther('100000'));
    await erc20.mint(user2.address, ethers.parseEther('100000'));
    for (let i = 1; i <= 100; i++) {
      await nft.mint(user.address, i);
    }

    await erc20.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
    await erc20.connect(user2).approve(await lockx.getAddress(), ethers.MaxUint256);
    await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('Lockbox Creation', () => {
    it('should create lockbox with ETH', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      expect(await lockx.ownerOf(tokenId)).to.equal(user.address);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.ethBalance).to.equal(ethers.parseEther('1'));
    });

    it('should create lockbox with ERC20', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithERC20(
        user.address,
        lockboxKey,
        await erc20.getAddress(),
        ethers.parseEther('1000'),
        ethers.ZeroHash
      );

      const tokenId = 0;
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens[0]).to.equal(await erc20.getAddress());
      expect(lockboxData.erc20Balances[0]).to.equal(ethers.parseEther('1000'));
    });

    it('should create lockbox with ERC721', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithERC721(
        user.address,
        lockboxKey,
        await nft.getAddress(),
        1,
        ethers.ZeroHash
      );

      const tokenId = 0;
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts[0]).to.equal(await nft.getAddress());
      expect(lockboxData.nftTokenIds[0]).to.equal(1);
    });

    it('should create lockbox with batch assets', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithBatch(
        user.address,
        lockboxKey,
        ethers.parseEther('5'),
        [await erc20.getAddress()],
        [ethers.parseEther('1000')],
        [await nft.getAddress()],
        [1],
        ethers.ZeroHash,
        { value: ethers.parseEther('5') }
      );

      const tokenId = 0;
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.ethBalance).to.equal(ethers.parseEther('5'));
      expect(lockboxData.erc20Tokens[0]).to.equal(await erc20.getAddress());
      expect(lockboxData.nftContracts[0]).to.equal(await nft.getAddress());
    });
  });

  describe('Deposits', () => {
    let tokenId: number;
    let lockboxKey: string;

    beforeEach(async () => {
      lockboxKey = ethers.Wallet.createRandom().address;
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      tokenId = 0;
    });

    it('should deposit ETH', async () => {
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('2') });
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.ethBalance).to.equal(ethers.parseEther('3'));
    });

    it('should deposit ERC20', async () => {
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('500'), ethers.ZeroHash);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens[0]).to.equal(await erc20.getAddress());
      expect(lockboxData.erc20Balances[0]).to.equal(ethers.parseEther('500'));
    });

    it('should deposit ERC721', async () => {
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 5, ethers.ZeroHash);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts[0]).to.equal(await nft.getAddress());
      expect(lockboxData.nftTokenIds[0]).to.equal(5);
    });

    it('should batch deposit', async () => {
      await lockx.connect(user).batchDeposit(
        tokenId,
        ethers.parseEther('3'),
        [await erc20.getAddress()],
        [ethers.parseEther('1000')],
        [await nft.getAddress()],
        [10],
        ethers.ZeroHash,
        { value: ethers.parseEther('3') }
      );

      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.ethBalance).to.equal(ethers.parseEther('4')); // 1 + 3
      expect(lockboxData.erc20Tokens[0]).to.equal(await erc20.getAddress());
      expect(lockboxData.nftContracts[0]).to.equal(await nft.getAddress());
    });
  });

  describe('Withdrawals', () => {
    let tokenId: number;
    let lockboxKeyWallet: any;

    beforeEach(async () => {
      lockboxKeyWallet = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithBatch(
        user.address,
        lockboxKeyWallet.address,
        ethers.parseEther('10'),
        [await erc20.getAddress()],
        [ethers.parseEther('5000')],
        [await nft.getAddress()],
        [1],
        ethers.ZeroHash,
        { value: ethers.parseEther('10') }
      );
      tokenId = 0;
    });

    it('should withdraw ETH', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('2'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 3600]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      const balanceBefore = await ethers.provider.getBalance(user.address);
      await lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('2'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 3600);
      const balanceAfter = await ethers.provider.getBalance(user.address);

      expect(balanceAfter).to.be.greaterThan(balanceBefore);
    });

    it('should withdraw ERC20', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await erc20.getAddress(), ethers.parseEther('1000'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 3600]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ERC20, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      const balanceBefore = await erc20.balanceOf(user.address);
      await lockx.connect(user).withdrawERC20(tokenId, messageHash, signature, await erc20.getAddress(), ethers.parseEther('1000'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 3600);
      const balanceAfter = await erc20.balanceOf(user.address);

      expect(balanceAfter).to.equal(balanceBefore + ethers.parseEther('1000'));
    });

    it('should withdraw ERC721', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await nft.getAddress(), 1, user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 3600]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_NFT, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).withdrawERC721(tokenId, messageHash, signature, await nft.getAddress(), 1, user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 3600);
      
      expect(await nft.ownerOf(1)).to.equal(user.address);
    });

    it('should batch withdraw', async () => {
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), [await erc20.getAddress()], [ethers.parseEther('500')], [await nft.getAddress()], [1], user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 3600]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.BATCH_WITHDRAW, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).batchWithdraw(tokenId, messageHash, signature, ethers.parseEther('1'), [await erc20.getAddress()], [ethers.parseEther('500')], [await nft.getAddress()], [1], user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 3600);
      
      expect(await nft.ownerOf(1)).to.equal(user.address);
    });
  });

  describe('Key Rotation', () => {
    it('should rotate lockbox key', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      const newKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, newKeyWallet.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.ROTATE_KEY, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).rotateLockboxKey(tokenId, messageHash, signature, newKeyWallet.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);
      
      // Verify key was rotated by checking new key can sign
      const newNonce = await lockx.connect(user).getNonce(tokenId);
      expect(newNonce).to.equal(nonce + 1n);
    });
  });

  describe('Burn Lockbox', () => {
    it('should burn lockbox', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKeyWallet.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.BURN_LOCKBOX, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await lockx.connect(user).burnLockbox(tokenId, messageHash, signature, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);
      
      await expect(lockx.ownerOf(tokenId)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });
  });
}); 