import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721 } from '../typechain-types';

/**
 * TARGETED BRANCH FIXES
 * 
 * This file focuses on the achievable missing branches using correct function signatures
 */
describe('🎯 TARGETED BRANCH FIXES', () => {
  let lockx: any;
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;
  let erc20: MockERC20;
  let erc20B: MockERC20;
  let nft: MockERC721;

  beforeEach(async () => {
    [owner, user, user2] = await ethers.getSigners();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    // Deploy tokens
    const ERC20 = await ethers.getContractFactory('MockERC20');
    erc20 = await ERC20.deploy() as MockERC20;
    await erc20.initialize('Token1', 'TK1');
    
    erc20B = await ERC20.deploy() as MockERC20;
    await erc20B.initialize('Token2', 'TK2');

    const NFT = await ethers.getContractFactory('MockERC721');
    nft = await NFT.deploy() as MockERC721;
    await nft.initialize('NFT1', 'N1');

    // Mint tokens
    const mintAmount = ethers.parseEther('1000000');
    await erc20.mint(user.address, mintAmount);
    await erc20.mint(user2.address, mintAmount);
    await erc20B.mint(user.address, mintAmount);
    await erc20B.mint(user2.address, mintAmount);
    
    // Mint NFTs
    for (let i = 1; i <= 50; i++) {
      await nft.mint(user.address, i);
      await nft.mint(user2.address, i + 100);
    }

    // Approve all
    await erc20.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
    await erc20.connect(user2).approve(await lockx.getAddress(), ethers.MaxUint256);
    await erc20B.connect(user).approve(await lockx.getAddress(), ethers.MaxUint256);
    await erc20B.connect(user2).approve(await lockx.getAddress(), ethers.MaxUint256);
    await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
    await nft.connect(user2).setApprovalForAll(await lockx.getAddress(), true);
  });

  describe('🎯 ACHIEVABLE BRANCH COVERAGE', () => {
    it('Should hit array mismatch branches in createLockboxWithBatch', async () => {
      const key = ethers.Wallet.createRandom();
      
      // Separate conditions to ensure we hit different branches
      
      // Branch 1: tokenAddresses.length != tokenAmounts.length ONLY
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address, key.address, ethers.parseEther('1'),
          [await erc20.getAddress(), await erc20B.getAddress()], // 2 addresses
          [ethers.parseEther('10')], // 1 amount - MISMATCH!
          [], [], // Empty NFT arrays (equal length)
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Branch 2: nftContracts.length != nftTokenIds.length ONLY  
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address, key.address, ethers.parseEther('1'),
          [], [], // Empty token arrays (equal length)
          [await nft.getAddress(), await nft.getAddress()], // 2 contracts
          [1], // 1 tokenId - MISMATCH!
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('Should hit batchDeposit array mismatch branches', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Branch 1: tokenAddresses.length != tokenAmounts.length
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, ethers.parseEther('1'),
          [await erc20.getAddress(), await erc20B.getAddress()], // 2 addresses
          [ethers.parseEther('10')], // 1 amount - MISMATCH!
          [], [], // Equal NFT arrays
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

      // Branch 2: nftContracts.length != nftTokenIds.length
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, ethers.parseEther('1'),
          [], [], // Equal token arrays
          [await nft.getAddress(), await nft.getAddress()], // 2 contracts
          [1], // 1 tokenId - MISMATCH!
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it('Should hit completely empty batchDeposit branch', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // All conditions true: amountETH == 0 && tokenAddresses.length == 0 && nftContracts.length == 0
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, 0, // amountETH = 0
          [], [], // tokenAddresses.length = 0
          [], [], // nftContracts.length = 0
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('Should hit nonexistent NFT error branch', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Try to deposit non-existent NFT (should hit catch block in _requireExists)
      await expect(
        lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 999999, ethers.ZeroHash)
      ).to.be.reverted; // Will be either NonexistentToken or ERC721NonexistentToken
    });

    it('Should test tokenURI branches', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Test no URI set (should revert)
      await expect(lockx.tokenURI(tokenId)).to.be.revertedWithCustomError(lockx, 'NoURI');

      // Set default URI and test default path
      const defaultURI = "https://default.metadata.uri/";
      await lockx.connect(owner).setDefaultMetadataURI(defaultURI);
      
      const uri = await lockx.tokenURI(tokenId);
      expect(uri).to.equal(defaultURI);

      // Test non-existent token
      await expect(lockx.tokenURI(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('Should test interface support branches', async () => {
      // Test ERC5192 interface specifically
      const erc5192InterfaceId = "0xb45a3c0e";
      expect(await lockx.supportsInterface(erc5192InterfaceId)).to.be.true;

      // Test other interfaces
      expect(await lockx.supportsInterface('0x01ffc9a7')).to.be.true; // ERC165
      expect(await lockx.supportsInterface('0x80ac58cd')).to.be.true; // ERC721
      expect(await lockx.supportsInterface('0x5b5e139f')).to.be.true; // ERC721Metadata
      expect(await lockx.supportsInterface('0x150b7a02')).to.be.true; // ERC721Receiver

      // Test unknown interface
      expect(await lockx.supportsInterface('0x12345678')).to.be.false;
    });

    it('Should test key rotation with correct function name', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;
      
      const nonce = await lockx.connect(user).getNonce(tokenId);
      const expiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      
      // Test key rotation to zero address
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroAddress, ethers.ZeroHash, user.address, expiry]
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
      
      const opStruct = { tokenId, nonce, opType: 3, dataHash }; // ROTATE_KEY = 3
      const signature = await key.signTypedData(domain, types, opStruct);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
      
      // Use correct function name
      await lockx.connect(user).rotateLockboxKey(
        tokenId, messageHash, signature, ethers.ZeroAddress, ethers.ZeroHash, expiry
      );
      
      // Verify key was set to zero address
      const newKey = await lockx.getLockboxKey(tokenId);
      expect(newKey).to.equal(ethers.ZeroAddress);
    });

    it('Should test withdrawal functions with correct signatures', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('10') }
      );
      const tokenId = 0;

      // Add some ERC20 tokens
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('1000'), ethers.ZeroHash);

      const nonce = await lockx.connect(user).getNonce(tokenId);
      const expiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;

      // Test ETH withdrawal with correct signature
      const authDataETH = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.parseEther('1'), user.address, ethers.ZeroHash, user.address, expiry]
      );
      const dataHashETH = ethers.keccak256(authDataETH);
      
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
      
      const opStructETH = { tokenId, nonce, opType: 0, dataHash: dataHashETH };
      const signatureETH = await key.signTypedData(domain, types, opStructETH);
      const messageHashETH = ethers.TypedDataEncoder.hash(domain, types, opStructETH);

      // Withdraw ETH
      await lockx.connect(user).withdrawETH(
        tokenId, messageHashETH, signatureETH, ethers.parseEther('1'), user.address, ethers.ZeroHash, expiry
      );

      // Test ERC20 withdrawal (partial to leave balance > 0)
      const newNonce = await lockx.connect(user).getNonce(tokenId);
      const authDataERC20 = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await erc20.getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, user.address, expiry]
      );
      const dataHashERC20 = ethers.keccak256(authDataERC20);
      
      const opStructERC20 = { tokenId, nonce: newNonce, opType: 2, dataHash: dataHashERC20 };
      const signatureERC20 = await key.signTypedData(domain, types, opStructERC20);
      const messageHashERC20 = ethers.TypedDataEncoder.hash(domain, types, opStructERC20);

      // Withdraw partial ERC20 (100 out of 1000)
      await lockx.connect(user).withdrawERC20(
        tokenId, messageHashERC20, signatureERC20, await erc20.getAddress(), ethers.parseEther('100'), user.address, ethers.ZeroHash, expiry
      );

      // Verify partial withdrawal left balance > 0
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      const erc20Address = await erc20.getAddress();
      const token = lockboxData.erc20Tokens.find((t: any) => t.tokenAddress === erc20Address);
      expect(token.balance).to.equal(ethers.parseEther('900')); // 1000 - 100 = 900
    });

    it('Should test complex asset operations for array management', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Add multiple tokens and NFTs to test array operations
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      await lockx.connect(user).depositERC20(tokenId, await erc20B.getAddress(), ethers.parseEther('200'), ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 2, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 3, ethers.ZeroHash);

      // Test batch deposit to exercise more array logic
      await lockx.connect(user).batchDeposit(
        tokenId, ethers.parseEther('1'),
        [await erc20.getAddress()], // Add more to existing token
        [ethers.parseEther('50')],
        [await nft.getAddress()], // Add more NFTs
        [4],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      // Verify complex state
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('2')); // 1 + 1
      expect(lockboxData.erc20Tokens.length).to.equal(2);
      expect(lockboxData.nftContracts.length).to.equal(4); // 4 NFTs from same contract
    });

    it('Should test error conditions comprehensively', async () => {
      const key = ethers.Wallet.createRandom();

      // Test all the zero amount/address errors
      await expect(
        lockx.connect(user).createLockboxWithETH(user.address, ethers.ZeroAddress, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');

      await expect(
        lockx.connect(user).createLockboxWithETH(user.address, key.address, ethers.ZeroHash, { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      await expect(
        lockx.connect(user).createLockboxWithERC20(user.address, key.address, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');

      await expect(
        lockx.connect(user).createLockboxWithERC20(user.address, key.address, await erc20.getAddress(), 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Test self-mint only
      await expect(
        lockx.connect(user2).createLockboxWithETH(user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      // Create lockbox for further tests
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Test deposit errors
      await expect(
        lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      await expect(
        lockx.connect(user).depositERC20(tokenId, ethers.ZeroAddress, ethers.parseEther('100'), ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      await expect(
        lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), 0, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      await expect(
        lockx.connect(user).depositERC721(tokenId, ethers.ZeroAddress, 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');

      // Test non-owner access
      await expect(
        lockx.connect(user2).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      await expect(
        lockx.connect(user2).getFullLockbox(tokenId)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      // Test soulbound mechanics
      expect(await lockx.locked(tokenId)).to.be.true;

      await expect(
        lockx.connect(user).transferFrom(user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
    });
  });

  describe('🎯 FINAL COMPREHENSIVE TEST', () => {
    it('Should achieve maximum branch coverage with realistic operations', async () => {
      // Multi-user scenario with complex operations
      const users = [user, user2];
      const keys = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];

      for (let i = 0; i < users.length; i++) {
        // Create different types of lockboxes
        if (i === 0) {
          await lockx.connect(users[i]).createLockboxWithBatch(
            users[i].address, keys[i].address, ethers.parseEther('3'),
            [await erc20.getAddress(), await erc20B.getAddress()],
            [ethers.parseEther('500'), ethers.parseEther('300')],
            [await nft.getAddress(), await nft.getAddress()],
            [i + 1, i + 2],
            ethers.ZeroHash,
            { value: ethers.parseEther('3') }
          );
        } else {
          await lockx.connect(users[i]).createLockboxWithERC721(
            users[i].address, keys[i].address, await nft.getAddress(), i + 101, ethers.ZeroHash
          );
        }
      }

      // Additional operations on first lockbox
      const tokenId = 0;
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('2') });
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);

      // Verify final state
      expect(await lockx.balanceOf(user.address)).to.equal(1);
      expect(await lockx.balanceOf(user2.address)).to.equal(1);

      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('5')); // 3 + 2
      expect(lockboxData.erc20Tokens.length).to.equal(2);
      expect(lockboxData.nftContracts.length).to.equal(2);
    });
  });
});