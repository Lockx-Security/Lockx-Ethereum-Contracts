import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('Targeted Line Coverage for 100%', function () {
  let lockx: any;
  let mockToken: any;
  let mockNFT: any;
  let owner: any;
  let lockboxKey: any;
  let recipient: any;

  beforeEach(async function () {
    [owner, lockboxKey, recipient] = await ethers.getSigners();

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const ERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await ERC20Factory.deploy();

    const ERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await ERC721Factory.deploy();

    // Mint test tokens
    await mockToken.mint(owner.address, ethers.parseEther('1000'));
    await mockNFT.mint(owner.address, 2);
    await mockNFT.mint(owner.address, 3);
    await mockNFT.mint(owner.address, 4);
  });

  describe('Deposits.sol Lines 167-168 - Batch deposit edge cases', function () {
    it('should handle batch deposit with all zero amounts', async function () {
      // Create lockbox first
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0; // First minted token

      // Try batch deposit with all zero amounts - should hit zero amount check
      await expect(
        lockx.batchDeposit(
          tokenId,
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          ethers.encodeBytes32String('batch')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });

         it('should handle NFT deposit with existing key', async function () {
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

       // Try to deposit same NFT again (this should be allowed and hits lines 167-168)
       await mockNFT.approve(await lockx.getAddress(), 3);
       await lockx.depositERC721(
         tokenId,
         await mockNFT.getAddress(),
         3,
         ethers.encodeBytes32String('test2')
       );

       // Verify both NFTs are in lockbox
       const lockboxData = await lockx.getFullLockbox(tokenId);
       expect(lockboxData.nftContracts.length).to.equal(2);
     });
  });

    describe('Withdrawals.sol Lines 459-461 - getFullLockbox with gaps', function () {
    it('should handle getFullLockbox with multiple NFTs', async function () {
      // Create lockbox with multiple NFTs to test the array counting logic
      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

      // Add more NFTs to trigger the counting loop in getFullLockbox
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        3,
        ethers.encodeBytes32String('test2')
      );

      await mockNFT.approve(await lockx.getAddress(), 4);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        4,
        ethers.encodeBytes32String('test3')
      );

      // Call getFullLockbox - this hits lines 459-461 with NFT counting and array construction
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(3);
      
      // Verify all NFTs are present
      const nftIds = lockboxData.nftContracts.map((nft: any) => Number(nft.nftTokenId));
      expect(nftIds).to.include(2);
      expect(nftIds).to.include(3);
      expect(nftIds).to.include(4);
    });
  });

  describe('Withdrawal Array Length Validation', function () {
    it('should handle batch withdrawal array length mismatch', async function () {
      // Create lockbox with ERC20
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('10'));
      await lockx.createLockboxWithERC20(
        owner.address,
        lockboxKey.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.encodeBytes32String('test')
      );

      const tokenId = 0;

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
      const value = {
        tokenId,
        amountETH: 0,
        tokenAddresses: [await mockToken.getAddress()],
        tokenAmounts: [ethers.parseEther('5')],
        nftContracts: [await mockNFT.getAddress()], // Length 1
        nftTokenIds: [], // Length 0 - mismatch!
        recipient: recipient.address,
        referenceId: ethers.encodeBytes32String('batch'),
        caller: owner.address,
        expiry,
        operationType: 4
      };

      const signature = await lockboxKey.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This should trigger MismatchedInputs error
      await expect(
        lockx.batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0,
          [await mockToken.getAddress()],
          [ethers.parseEther('5')],
          [await mockNFT.getAddress()], // Length 1
          [], // Length 0 - mismatch
          recipient.address,
          ethers.encodeBytes32String('batch'),
          expiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });
  });
}); 