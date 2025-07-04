import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';

describe('Comprehensive Branch Coverage Tests', () => {
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

  describe('Lockx.sol Branch Coverage', () => {
    it('should test all creation function error branches', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;

      // Test SelfMintOnly error branches
      await expect(
        lockx.connect(user).createLockboxWithETH(user2.address, lockboxKey, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      await expect(
        lockx.connect(user).createLockboxWithERC20(user2.address, lockboxKey, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      await expect(
        lockx.connect(user).createLockboxWithERC721(user2.address, lockboxKey, await nft.getAddress(), 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      // Test ZeroKey error branches
      await expect(
        lockx.connect(user).createLockboxWithETH(user.address, ethers.ZeroAddress, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');

      // Test ZeroAmount error branches
      await expect(
        lockx.connect(user).createLockboxWithETH(user.address, lockboxKey, ethers.ZeroHash, { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      await expect(
        lockx.connect(user).createLockboxWithERC20(user.address, lockboxKey, await erc20.getAddress(), 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test ZeroTokenAddress error branch
      await expect(
        lockx.connect(user).createLockboxWithERC20(user.address, lockboxKey, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');

      await expect(
        lockx.connect(user).createLockboxWithERC721(user.address, lockboxKey, ethers.ZeroAddress, 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');
    });

    it('should test createLockboxWithBatch array mismatch branches', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;

      // Test ArrayLengthMismatch for tokens
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address,
          lockboxKey,
          0,
          [await erc20.getAddress()],
          [ethers.parseEther('100'), ethers.parseEther('200')], // mismatched length
          [],
          [],
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Test ArrayLengthMismatch for NFTs
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address,
          lockboxKey,
          0,
          [],
          [],
          [await nft.getAddress()],
          [1, 2], // mismatched length
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Test EthValueMismatch
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address,
          lockboxKey,
          ethers.parseEther('5'),
          [],
          [],
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('3') } // mismatched value
        )
      ).to.be.revertedWithCustomError(lockx, 'EthValueMismatch');
    });

    it('should test metadata URI branches', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;

      // Test with custom URI
      const customURI = 'https://example.com/metadata/';
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.keccak256(ethers.toUtf8Bytes(customURI)),
        { value: ethers.parseEther('1') }
      );

      // Test with no URI (zero hash)
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
    });

    it('should test transfer restriction branches', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Test transfer restriction - should revert
      await expect(
        lockx.connect(user).transferFrom(user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');

      await expect(
        lockx.connect(user)['safeTransferFrom(address,address,uint256)'](user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
    });

    it('should test supportsInterface branches', async () => {
      // Test ERC721 interface
      expect(await lockx.supportsInterface('0x80ac58cd')).to.be.true;
      
      // Test ERC165 interface
      expect(await lockx.supportsInterface('0x01ffc9a7')).to.be.true;
      
      // Test unsupported interface
      expect(await lockx.supportsInterface('0x12345678')).to.be.false;
    });

    it('should test fallback and receive functions', async () => {
      // Test receive function
      await expect(
        user.sendTransaction({
          to: await lockx.getAddress(),
          value: ethers.parseEther('1')
        })
      ).to.be.revertedWithCustomError(lockx, 'UseDepositETH');

      // Test fallback function
      await expect(
        user.sendTransaction({
          to: await lockx.getAddress(),
          value: ethers.parseEther('1'),
          data: '0x12345678'
        })
      ).to.be.revertedWithCustomError(lockx, 'FallbackNotAllowed');
    });
  });

  describe('Withdrawals.sol Branch Coverage', () => {
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

    it('should test ETH withdrawal branches', async () => {
      // Test insufficient ETH balance
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('20'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('20'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance');

      // Test ETH transfer failure
      const RejectETH = await ethers.getContractFactory('RejectETH');
      const rejectETH = await RejectETH.deploy();

      const nonce2 = await lockx.connect(user).getNonce(tokenId);
      const data2 = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), await rejectETH.getAddress(), ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash2 = ethers.keccak256(data2);
      const opStruct2 = { tokenId, nonce: nonce2, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash: dataHash2 };
      const signature2 = await lockboxKeyWallet.signTypedData(domain, types, opStruct2);
      const messageHash2 = ethers.TypedDataEncoder.hash(domain, types, opStruct2);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash2, signature2, ethers.parseEther('1'), await rejectETH.getAddress(), ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'EthTransferFailed');
    });

    it('should test ERC20 withdrawal branches', async () => {
      // Test insufficient token balance
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await erc20.getAddress(), ethers.parseEther('10000'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ERC20, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawERC20(tokenId, messageHash, signature, await erc20.getAddress(), ethers.parseEther('10000'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance');

      // Test successful withdrawal with balance cleanup
      const nonce2 = await lockx.connect(user).getNonce(tokenId);
      const data2 = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await erc20.getAddress(), ethers.parseEther('5000'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash2 = ethers.keccak256(data2);
      const opStruct2 = { tokenId, nonce: nonce2, opType: OPERATION_TYPE.WITHDRAW_ERC20, dataHash: dataHash2 };
      const signature2 = await lockboxKeyWallet.signTypedData(domain, types, opStruct2);
      const messageHash2 = ethers.TypedDataEncoder.hash(domain, types, opStruct2);

      await lockx.connect(user).withdrawERC20(tokenId, messageHash2, signature2, await erc20.getAddress(), ethers.parseEther('5000'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);
    });

    it('should test NFT withdrawal branches', async () => {
      // Test NFT not found
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await nft.getAddress(), 999, user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_NFT, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawERC721(tokenId, messageHash, signature, await nft.getAddress(), 999, user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'NFTNotFound');
    });

    it('should test batch withdrawal branches', async () => {
      // Test array length mismatch
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [await erc20.getAddress()], [ethers.parseEther('100'), ethers.parseEther('200')], [], [], user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.BATCH_WITHDRAW, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).batchWithdraw(tokenId, messageHash, signature, 0, [await erc20.getAddress()], [ethers.parseEther('100'), ethers.parseEther('200')], [], [], user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000)
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it('should test signature expiry branches', async () => {
      const expiredTime = Math.floor(Date.now() / 1000) - 3600;
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), user.address, ethers.ZeroHash, user.address, expiredTime]
      );
      const dataHash = ethers.keccak256(data);
      const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ETH, dataHash };
      const domain = await buildDomain(await lockx.getAddress());
      const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

      await expect(
        lockx.connect(user).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('1'), user.address, ethers.ZeroHash, expiredTime)
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should test array removal branches', async () => {
      // Create multiple tokens for array manipulation testing
      const tokens = [];
      for (let i = 0; i < 5; i++) {
        const Token = await ethers.getContractFactory('MockERC20');
        const token = await Token.deploy() as MockERC20;
        await token.initialize(`Token${i}`, `TK${i}`);
        await token.mint(user.address, ethers.parseEther('1000'));
        await token.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
        tokens.push(token);
        
        await lockx.connect(user).depositERC20(tokenId, await token.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      }

      // Test removal from different positions to hit all array manipulation branches
      for (let i = 0; i < 3; i++) {
        const nonce = await lockx.connect(user).getNonce(tokenId);
        const data = ethers.AbiCoder.defaultAbiCoder().encode(
          ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
          [tokenId, await tokens[i].getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, user.address, Math.floor(Date.now() / 1000) + 36000]
        );
        const dataHash = ethers.keccak256(data);
        const opStruct = { tokenId, nonce, opType: OPERATION_TYPE.WITHDRAW_ERC20, dataHash };
        const domain = await buildDomain(await lockx.getAddress());
        const signature = await lockboxKeyWallet.signTypedData(domain, types, opStruct);
        const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);

        await lockx.connect(user).withdrawERC20(tokenId, messageHash, signature, await tokens[i].getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, Math.floor(Date.now() / 1000) + 36000);
      }
    });
  });

  describe('Deposits.sol Branch Coverage', () => {
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

    it('should test deposit validation branches', async () => {
      // Test zero amount
      await expect(
        lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      await expect(
        lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test zero address
      await expect(
        lockx.connect(user).depositERC20(tokenId, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      await expect(
        lockx.connect(user).depositERC721(tokenId, ethers.ZeroAddress, 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      // Test ownership validation
      await expect(
        lockx.connect(user2).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it('should test batch deposit branches', async () => {
      // Test ETH value mismatch
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId,
          ethers.parseEther('5'),
          [],
          [],
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('3') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ETHMismatch');

      // Test array length mismatch
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId,
          0,
          [await erc20.getAddress()],
          [ethers.parseEther('100'), ethers.parseEther('200')],
          [],
          [],
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

      // Test empty batch
      await expect(
        lockx.connect(user).batchDeposit(tokenId, 0, [], [], [], [], ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should test fee-on-transfer token branches', async () => {
      // Test 100% fee (zero received)
      await feeToken.setFeePercentage(10000);
      await expect(
        lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test partial fee
      await feeToken.setFeePercentage(5000); // 50% fee
      await lockx.connect(user).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Balances[0]).to.equal(ethers.parseEther('50')); // 50% received
    });

    it('should test new vs existing token branches', async () => {
      // First deposit - new token
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      // Second deposit - existing token
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('200'), ethers.ZeroHash);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Balances[0]).to.equal(ethers.parseEther('300'));
    });

    it('should test NFT deposit branches', async () => {
      // First NFT deposit - new key
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      
      // Second NFT deposit - existing key (should update)
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 2, ethers.ZeroHash);
      
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(2);
    });
  });

  describe('Complex Scenarios', () => {
    it('should test burnLockbox with complex cleanup', async () => {
      const lockboxKeyWallet = ethers.Wallet.createRandom();
      
      // Create complex lockbox
      await lockx.connect(user).createLockboxWithBatch(
        user.address,
        lockboxKeyWallet.address,
        ethers.parseEther('5'),
        [await erc20.getAddress()],
        [ethers.parseEther('1000')],
        [await nft.getAddress()],
        [1],
        ethers.ZeroHash,
        { value: ethers.parseEther('5') }
      );
      const tokenId = 0;

      // Add more assets
      for (let i = 0; i < 3; i++) {
        const Token = await ethers.getContractFactory('MockERC20');
        const token = await Token.deploy() as MockERC20;
        await token.initialize(`BurnToken${i}`, `BT${i}`);
        await token.mint(user.address, ethers.parseEther('1000'));
        await token.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
        
        await lockx.connect(user).depositERC20(tokenId, await token.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      }

      for (let i = 2; i <= 5; i++) {
        await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), i, ethers.ZeroHash);
      }

      // Burn lockbox
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
      
      await expect(lockx.getFullLockbox(tokenId)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('should test getFullLockbox with complex gaps', async () => {
      const lockboxKey = ethers.Wallet.createRandom().address;
      
      await lockx.connect(user).createLockboxWithETH(user.address, lockboxKey, ethers.ZeroHash, { value: ethers.parseEther('1') });
      const tokenId = 0;

      // Add many NFTs to create gaps
      for (let i = 1; i <= 20; i++) {
        await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), i, ethers.ZeroHash);
      }

      // Test getFullLockbox with complex counting logic
      const result = await lockx.getFullLockbox(tokenId);
      expect(result.nftContracts.length).to.equal(20);
      expect(result.nftTokenIds.length).to.equal(20);
    });
  });
}); 