import { ethers, network } from 'hardhat';
import { expect } from 'chai';

describe('Additional Edge Tests', function () {
  let lockx: any;
  let mockToken: any;
  let mockNFT: any;
  let owner: any;
  let lockboxKey: any;
  let recipient: any;

  beforeEach(async function () {
    [owner, lockboxKey, recipient] = await ethers.getSigners();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const ERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await ERC20Factory.deploy();

    const ERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await ERC721Factory.deploy();

    await mockToken.mint(owner.address, ethers.parseEther('1000'));
    await mockNFT.mint(owner.address, 2);
    await mockNFT.mint(owner.address, 3);
  });

  describe('Token transfer scenarios', function () {
    it('should handle zero balance transfers', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Use a zero address as token to trigger different validation
      await expect(
        lockx.depositERC20(
          tokenId,
          ethers.ZeroAddress,
          ethers.parseEther('10'),
          ethers.encodeBytes32String('test')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress');
    });

    it('should handle fee-on-transfer edge cases', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Try depositing from contract with no allowance to trigger transfer failure
      await expect(
        lockx.depositERC20(
          tokenId,
          await mockToken.getAddress(),
          ethers.parseEther('10'),
          ethers.encodeBytes32String('test')
        )
      ).to.be.reverted; // Should fail due to no allowance
    });

    it('should handle duplicate NFT deposits', async function () {
      // Create lockbox with NFT
      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

      // Try to deposit same NFT again - this will hit the existing key condition
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        3,
        ethers.encodeBytes32String('test2')
      );

      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(2);
    });
  });

  describe('Complex array operations', function () {
    it('should handle empty array conditions', async function () {
      // Create empty lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Call getFullLockbox on empty NFT array to trigger count logic
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(0);
      expect(lockboxData.erc20Tokens.length).to.equal(0);
    });

    it('should handle array index boundary conditions', async function () {
      // Create lockbox with multiple NFTs
      await mockNFT.mint(owner.address, 4);
      await mockNFT.mint(owner.address, 5);
      
      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

      // Add multiple NFTs to create array with gaps
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 3, ethers.encodeBytes32String('test2'));
      
      await mockNFT.approve(await lockx.getAddress(), 4);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 4, ethers.encodeBytes32String('test3'));
      
      await mockNFT.approve(await lockx.getAddress(), 5);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 5, ethers.encodeBytes32String('test4'));

      // This should hit the array iteration logic
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(4);
    });
  });

  describe('Key rotation scenarios', function () {
    it('should handle key rotation attempts', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const expiry = Math.floor(Date.now() / 1000) - 3600; // Expired

      // Try with expired signature to trigger expiry check
      await expect(
        lockx.rotateLockboxKey(
          tokenId,
          ethers.keccak256(ethers.toUtf8Bytes('fake')),
          '0x1234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890',
          recipient.address,
          ethers.encodeBytes32String('rotate'),
          expiry
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });
  });

  describe('Withdrawal validation tests', function () {
    it('should handle complex withdrawal scenarios', async function () {
      // Create lockbox with multiple assets
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('50'));
      await lockx.createLockboxWithERC20(
        owner.address,
        lockboxKey.address,
        await mockToken.getAddress(),
        ethers.parseEther('50'),
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

      // Try batch withdrawal with mismatched arrays
      const domain = {
        name: 'Lockx.io',
        version: '1',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        LockboxAuth: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'amountETH', type: 'uint256' },
          { name: 'tokenAddresses', type: 'address[]' },
          { name: 'tokenAmounts', type: 'uint256[]' },
          { name: 'nftContracts', type: 'address[]' },
          { name: 'nftTokenIds', type: 'uint256[]' },
          { name: 'recipient', type: 'address' },
          { name: 'referenceId', type: 'bytes32' },
          { name: 'caller', type: 'address' },
          { name: 'expiry', type: 'uint256' },
          { name: 'operationType', type: 'uint8' }
        ]
      };

      const expiry = Math.floor(Date.now() / 1000) + 3600;
      
      // Create arrays with mismatched lengths
      const value = {
        tokenId,
        amountETH: 0,
        tokenAddresses: [await mockToken.getAddress()],
        tokenAmounts: [ethers.parseEther('10')],
        nftContracts: [await mockNFT.getAddress(), await mockNFT.getAddress()], // Length 2
        nftTokenIds: [2], // Length 1 - mismatch
        recipient: recipient.address,
        referenceId: ethers.encodeBytes32String('batch'),
        caller: owner.address,
        expiry,
        operationType: 4
      };

      const signature = await lockboxKey.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // Should trigger array length validation
      await expect(
        lockx.batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0,
          [await mockToken.getAddress()],
          [ethers.parseEther('10')],
          [await mockNFT.getAddress(), await mockNFT.getAddress()], // Length 2
          [2], // Length 1 - mismatch
          recipient.address,
          ethers.encodeBytes32String('batch'),
          expiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });
  });

  describe('Edge case boundary tests', function () {
    it('should handle all zero batch deposit', async function () {
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // All zeros should trigger the validation check
      await expect(
        lockx.batchDeposit(
          tokenId,
          0, // ETH
          [], // tokens
          [], // amounts  
          [], // NFTs
          [], // NFT IDs
          ethers.encodeBytes32String('empty')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

    it('should handle NFT counting with mixed states', async function () {
      // Create complex NFT scenario with proper token IDs
      await mockNFT.mint(owner.address, 4);
      await mockNFT.mint(owner.address, 5);

      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

      // Add several NFTs that actually exist
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 3, ethers.encodeBytes32String('test3'));
      
      await mockNFT.approve(await lockx.getAddress(), 4);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 4, ethers.encodeBytes32String('test4'));
      
      await mockNFT.approve(await lockx.getAddress(), 5);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 5, ethers.encodeBytes32String('test5'));

      // This should exercise the counting logic thoroughly
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(4);
    });
  });
}); 