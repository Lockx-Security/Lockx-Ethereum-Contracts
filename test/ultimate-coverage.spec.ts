import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721 } from '../typechain-types';

/**
 * Primary coverage tests targeting easily achievable branches
 */
describe('Primary Coverage Tests', () => {
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
    for (let i = 1; i <= 100; i++) {
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

  describe('🎯 BRANCH COVERAGE', () => {
    it('Array mismatch branches - both types in createLockboxWithBatch', async () => {
      const key = ethers.Wallet.createRandom();
      
      // Test each mismatch condition separately to hit different branches
      
      // Branch A: First condition true (tokenAddresses.length != tokenAmounts.length)
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address, key.address, ethers.parseEther('1'),
          [await erc20.getAddress(), await erc20B.getAddress()], // 2 addresses
          [ethers.parseEther('10')], // 1 amount - FIRST CONDITION TRUE
          [], [], // Empty NFT arrays - SECOND CONDITION FALSE
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Branch B: Second condition true (nftContracts.length != nftTokenIds.length)
      await expect(
        lockx.connect(user).createLockboxWithBatch(
          user.address, key.address, ethers.parseEther('1'),
          [], [], // Empty token arrays - FIRST CONDITION FALSE
          [await nft.getAddress(), await nft.getAddress()], // 2 contracts
          [1], // 1 tokenId - SECOND CONDITION TRUE
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      // Branch C: Normal successful case
      await lockx.connect(user).createLockboxWithBatch(
        user.address, key.address, ethers.parseEther('1'),
        [await erc20.getAddress()], // 1 address
        [ethers.parseEther('10')], // 1 amount - MATCH
        [await nft.getAddress()], // 1 contract
        [1], // 1 tokenId - MATCH
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      expect(await lockx.balanceOf(user.address)).to.equal(1);
    });

    it('Batch deposit array mismatch branches', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Branch A: tokenAddresses.length != tokenAmounts.length
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, ethers.parseEther('1'),
          [await erc20.getAddress(), await erc20B.getAddress()], // 2 addresses
          [ethers.parseEther('10')], // 1 amount - MISMATCH
          [], [], // Empty NFT arrays
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

      // Branch B: nftContracts.length != nftTokenIds.length
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, ethers.parseEther('1'),
          [], [], // Empty token arrays
          [await nft.getAddress(), await nft.getAddress()], // 2 contracts
          [1], // 1 tokenId - MISMATCH
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

      // Branch C: Empty batch (all conditions true)
      await expect(
        lockx.connect(user).batchDeposit(
          tokenId, 0, // amountETH = 0
          [], [], // tokenAddresses.length = 0
          [], [], // nftContracts.length = 0
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');

      // Branch D: Successful batch deposit
      await lockx.connect(user).batchDeposit(
        tokenId, ethers.parseEther('1'),
        [await erc20.getAddress()],
        [ethers.parseEther('100')],
        [await nft.getAddress()],
        [2],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
    });

    it('TokenURI branches - all paths', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Branch A: No URI set (should revert)
      await expect(lockx.tokenURI(tokenId)).to.be.revertedWithCustomError(lockx, 'NoURI');

      // Branch B: Default URI only (bytes(custom).length == 0 && bytes(default).length > 0)
      const defaultURI = "https://default.metadata.uri/";
      await lockx.connect(owner).setDefaultMetadataURI(defaultURI);
      
      const uri = await lockx.tokenURI(tokenId);
      expect(uri).to.equal(defaultURI);

      // Branch C: Non-existent token
      await expect(lockx.tokenURI(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('Interface support branches - comprehensive', async () => {
      // Branch A: ERC5192 interface (specific check)
      const erc5192InterfaceId = "0xb45a3c0e";
      expect(await lockx.supportsInterface(erc5192InterfaceId)).to.be.true;

      // Branch B: ERC165 interface 
      expect(await lockx.supportsInterface('0x01ffc9a7')).to.be.true;

      // Branch C: ERC721 interface
      expect(await lockx.supportsInterface('0x80ac58cd')).to.be.true;

      // Branch D: ERC721Metadata interface
      expect(await lockx.supportsInterface('0x5b5e139f')).to.be.true;

      // Branch E: ERC721Receiver interface
      expect(await lockx.supportsInterface('0x150b7a02')).to.be.true;

      // Branch F: Unknown interface (false case)
      expect(await lockx.supportsInterface('0x12345678')).to.be.false;
    });

    it('Error condition branches - zero amounts and addresses', async () => {
      const key = ethers.Wallet.createRandom();

      // Creation error branches
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

      await expect(
        lockx.connect(user).createLockboxWithERC721(user.address, key.address, ethers.ZeroAddress, 1, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');

      // Self-mint only error
      await expect(
        lockx.connect(user2).createLockboxWithETH(user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

      // Create lockbox for deposit tests
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Deposit error branches
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

      // Non-owner access
      await expect(
        lockx.connect(user2).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      await expect(
        lockx.connect(user2).getFullLockbox(tokenId)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      // Non-existent token operations
      await expect(lockx.locked(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
      await expect(lockx.connect(user).getFullLockbox(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('NFT error branch - nonexistent token', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Try to deposit non-existent NFT (hits catch block in _requireExists)
      await expect(
        lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 999999, ethers.ZeroHash)
      ).to.be.reverted; // Will trigger the catch block
    });

    it('Soulbound mechanics branches', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Soulbound branches
      expect(await lockx.locked(tokenId)).to.be.true;

      await expect(
        lockx.connect(user).transferFrom(user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');

      await expect(
        lockx.connect(user).safeTransferFrom(user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
    });

    it('Complex array operations for removal branch coverage', async () => {
      const key = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
      );
      const tokenId = 0;

      // Add multiple tokens and NFTs to create scenarios for array operations
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      await lockx.connect(user).depositERC20(tokenId, await erc20B.getAddress(), ethers.parseEther('200'), ethers.ZeroHash);
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('50'), ethers.ZeroHash); // Add more to first token

      // Add multiple NFTs from same contract to test NFT array operations
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 2, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 3, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 4, ethers.ZeroHash);

      // Test batch operations with existing tokens/NFTs
      await lockx.connect(user).batchDeposit(
        tokenId, ethers.parseEther('2'),
        [await erc20.getAddress(), await erc20B.getAddress()], // Add to existing tokens
        [ethers.parseEther('25'), ethers.parseEther('75')],
        [await nft.getAddress(), await nft.getAddress()], // Add more NFTs
        [5, 6],
        ethers.ZeroHash,
        { value: ethers.parseEther('2') }
      );

      // Verify complex state
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('3')); // 1 + 2
      expect(lockboxData.erc20Tokens.length).to.equal(2);
      expect(lockboxData.nftContracts.length).to.equal(6); // 4 + 2
      
      // Verify token balances accumulated correctly
      const erc20Address = await erc20.getAddress();
      const token = lockboxData.erc20Tokens.find((t: any) => t.tokenAddress === erc20Address);
      expect(token.balance).to.equal(ethers.parseEther('175')); // 100 + 50 + 25
    });

    it('Multi-user comprehensive scenario', async () => {
      const users = [user, user2];
      const keys = [ethers.Wallet.createRandom(), ethers.Wallet.createRandom()];

      // Each user creates different types of lockboxes
      for (let i = 0; i < users.length; i++) {
        if (i === 0) {
          // User 1: Batch creation
          await lockx.connect(users[i]).createLockboxWithBatch(
            users[i].address, keys[i].address, ethers.parseEther('5'),
            [await erc20.getAddress(), await erc20B.getAddress()],
            [ethers.parseEther('500'), ethers.parseEther('300')],
            [await nft.getAddress(), await nft.getAddress()],
            [i + 1, i + 2],
            ethers.ZeroHash,
            { value: ethers.parseEther('5') }
          );
        } else {
          // User 2: ERC721 creation
          await lockx.connect(users[i]).createLockboxWithERC721(
            users[i].address, keys[i].address, await nft.getAddress(), i + 101, ethers.ZeroHash
          );
          
          // Additional deposits
          await lockx.connect(users[i]).depositETH(1, ethers.ZeroHash, { value: ethers.parseEther('3') });
          await lockx.connect(users[i]).depositERC20(1, await erc20.getAddress(), ethers.parseEther('750'), ethers.ZeroHash);
        }
      }

      // Cross-user access attempts (should fail)
      await expect(
        lockx.connect(user2).depositETH(0, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      await expect(
        lockx.connect(user).getFullLockbox(1)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');

      // Verify each user has their lockbox
      expect(await lockx.balanceOf(user.address)).to.equal(1);
      expect(await lockx.balanceOf(user2.address)).to.equal(1);
      expect(await lockx.ownerOf(0)).to.equal(user.address);
      expect(await lockx.ownerOf(1)).to.equal(user2.address);

      // Verify lockbox contents
      const lockbox0 = await lockx.connect(user).getFullLockbox(0);
      expect(lockbox0.lockboxETH).to.equal(ethers.parseEther('5'));
      expect(lockbox0.erc20Tokens.length).to.equal(2);
      expect(lockbox0.nftContracts.length).to.equal(2);

      const lockbox1 = await lockx.connect(user2).getFullLockbox(1);
      expect(lockbox1.lockboxETH).to.equal(ethers.parseEther('3'));
      expect(lockbox1.erc20Tokens.length).to.equal(1);
      expect(lockbox1.nftContracts.length).to.equal(1);
    });
  });

  describe('🏆 FINAL VERIFICATION', () => {
    it('Branch coverage verification', async () => {
      // Create comprehensive test scenario hitting as many branches as possible
      const key = ethers.Wallet.createRandom();
      
      // Test all creation methods
      await lockx.connect(user).createLockboxWithETH(
        user.address, key.address, ethers.ZeroHash, { value: ethers.parseEther('10') }
      );
      
      const key2 = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithERC20(
        user.address, key2.address, await erc20.getAddress(), ethers.parseEther('1000'), ethers.ZeroHash
      );
      
      const key3 = ethers.Wallet.createRandom();
      await lockx.connect(user).createLockboxWithERC721(
        user.address, key3.address, await nft.getAddress(), 10, ethers.ZeroHash
      );

      // Test all deposit methods on first lockbox
      const tokenId = 0;
      await lockx.connect(user).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('5') });
      await lockx.connect(user).depositERC20(tokenId, await erc20.getAddress(), ethers.parseEther('500'), ethers.ZeroHash);
      await lockx.connect(user).depositERC20(tokenId, await erc20B.getAddress(), ethers.parseEther('300'), ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 1, ethers.ZeroHash);
      await lockx.connect(user).depositERC721(tokenId, await nft.getAddress(), 2, ethers.ZeroHash);

      // Test batch deposit
      await lockx.connect(user).batchDeposit(
        tokenId, ethers.parseEther('3'),
        [await erc20.getAddress()],
        [ethers.parseEther('200')],
        [await nft.getAddress()],
        [3],
        ethers.ZeroHash,
        { value: ethers.parseEther('3') }
      );

      // Verify comprehensive state
      expect(await lockx.balanceOf(user.address)).to.equal(3);
      
      const lockboxData = await lockx.connect(user).getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('18')); // 10 + 5 + 3
      expect(lockboxData.erc20Tokens.length).to.equal(2);
      expect(lockboxData.nftContracts.length).to.equal(3);

      // Verify individual token balances
      const erc20Address = await erc20.getAddress();
      const erc20Token = lockboxData.erc20Tokens.find((t: any) => t.tokenAddress === erc20Address);
      expect(erc20Token.balance).to.equal(ethers.parseEther('700')); // 500 + 200

      const erc20BAddress = await erc20B.getAddress();
      const erc20BToken = lockboxData.erc20Tokens.find((t: any) => t.tokenAddress === erc20BAddress);
      expect(erc20BToken.balance).to.equal(ethers.parseEther('300'));

      // Verify soulbound mechanics still work
      expect(await lockx.locked(tokenId)).to.be.true;
      await expect(
        lockx.connect(user).transferFrom(user.address, user2.address, tokenId)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');

      // Verify interface support
      expect(await lockx.supportsInterface('0xb45a3c0e')).to.be.true; // ERC5192
    });
  });
});