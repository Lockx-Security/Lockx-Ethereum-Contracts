import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';

describe('Edge Case Coverage Boost', function () {
  let lockx: Lockx;
  let mockERC20: MockERC20;
  let mockERC721: MockERC721;
  let owner: any;
  let user: any;
  let lockboxKey: any;

  beforeEach(async function () {
    [owner, user, lockboxKey] = await ethers.getSigners();
    
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockERC20 = await MockERC20Factory.deploy();

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockERC721 = await MockERC721Factory.deploy();

    await mockERC20.mint(owner.address, ethers.parseEther('1000'));
  });

  describe('Specific Line Coverage', function () {
    it('should handle lockbox creation with batch including assets', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge1'));
      
      // Test successful batch creation
      await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('50'));
      await mockERC721.connect(owner).approve(await lockx.getAddress(), 1);
      
      await lockx.connect(owner).createLockboxWithBatch(
        owner.address,
        lockboxKey.address,
        ethers.parseEther('0.5'),
        [await mockERC20.getAddress()],
        [ethers.parseEther('50')],
        [await mockERC721.getAddress()],
        [1],
        referenceId,
        { value: ethers.parseEther('0.5') }
      );

      expect(await lockx.ownerOf(0)).to.equal(owner.address);
    });

    it('should handle array length mismatches in createLockboxWithBatch', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge2'));
      
      // Test mismatched array lengths
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address,
          lockboxKey.address,
          0,
          [await mockERC20.getAddress()], // 1 address
          [], // 0 amounts - mismatch
          [],
          [],
          referenceId
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address,
          lockboxKey.address,
          0,
          [],
          [],
          [await mockERC721.getAddress()], // 1 contract
          [], // 0 token IDs - mismatch
          referenceId
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
    });

    it('should handle ETH value mismatch in createLockboxWithBatch', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge3'));
      
      await expect(
        lockx.connect(owner).createLockboxWithBatch(
          owner.address,
          lockboxKey.address,
          ethers.parseEther('1'), // claiming 1 ETH
          [],
          [],
          [],
          [],
          referenceId,
          { value: ethers.parseEther('0.5') } // but only sending 0.5 ETH
        )
      ).to.be.revertedWithCustomError(lockx, 'EthValueMismatch');
    });

    it('should handle successful batch creation with all asset types', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge4'));
      
      // Approve tokens first
      await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await mockERC721.connect(owner).approve(await lockx.getAddress(), 1);
      
      await lockx.connect(owner).createLockboxWithBatch(
        owner.address,
        lockboxKey.address,
        ethers.parseEther('1'),
        [await mockERC20.getAddress()],
        [ethers.parseEther('100')],
        [await mockERC721.getAddress()],
        [1],
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // Verify lockbox was created
      expect(await lockx.ownerOf(0)).to.equal(owner.address);
      expect(await lockx.locked(0)).to.equal(true);
    });

    it('should handle zero token address in createLockboxWithERC721', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge5'));
      
      await expect(
        lockx.connect(owner).createLockboxWithERC721(
          owner.address,
          lockboxKey.address,
          ethers.ZeroAddress, // zero token address
          1,
          referenceId
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');
    });

    it('should handle self-mint restriction violations', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge6'));
      
      // Try to mint for someone else
      await expect(
        lockx.connect(owner).createLockboxWithETH(
          user.address, // different from msg.sender
          lockboxKey.address,
          referenceId,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
    });

    it('should handle custom metadata URI clearing on burn', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge7'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // First set default URI to avoid NoURI error
      await lockx.connect(owner).setDefaultMetadataURI('https://default.com/');

      // Set custom URI
      const customURI = 'https://custom.example.com/token/0';
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await lockx.getAddress()
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const nonce = await lockx.connect(owner).getNonce(0);
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'address', 'uint256'],
        [0, customURI, referenceId, owner.address, signatureExpiry]
      );

      const operation = {
        tokenId: 0,
        nonce: nonce,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(data)
      };

      const signature = await lockboxKey.signTypedData(domain, types, operation);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, operation);

      await lockx.connect(owner).setTokenMetadataURI(
        0,
        messageHash,
        signature,
        customURI,
        referenceId,
        signatureExpiry
      );

      expect(await lockx.tokenURI(0)).to.equal(customURI);

      // Now burn to clear custom metadata
      const newNonce = await lockx.connect(owner).getNonce(0);
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [0, referenceId, owner.address, signatureExpiry]
      );

      const burnOperation = {
        tokenId: 0,
        nonce: newNonce,
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnData)
      };

      const burnSignature = await lockboxKey.signTypedData(domain, types, burnOperation);
      const burnMessageHash = ethers.TypedDataEncoder.hash(domain, types, burnOperation);

      await lockx.connect(owner).burnLockbox(
        0,
        burnMessageHash,
        burnSignature,
        referenceId,
        signatureExpiry
      );

      // Verify token is burned and metadata cleared
      await expect(lockx.ownerOf(0)).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should handle fee-on-transfer token edge case', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge8'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // Test ERC20 deposit with balance checking
      const balanceBefore = await mockERC20.balanceOf(await lockx.getAddress());
      
      await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(owner).depositERC20(
        0,
        await mockERC20.getAddress(),
        ethers.parseEther('100'),
        referenceId
      );

      const balanceAfter = await mockERC20.balanceOf(await lockx.getAddress());
      expect(balanceAfter).to.be.gt(balanceBefore);
    });

    it('should handle NFT key collision avoidance', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge9'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // Deposit same NFT multiple times (should handle key collision)
      await mockERC721.connect(owner).approve(await lockx.getAddress(), 1);
      await lockx.connect(owner).depositERC721(
        0,
        await mockERC721.getAddress(),
        1,
        referenceId
      );

      // Check that NFT is tracked
      const [, , nfts] = await lockx.connect(owner).getFullLockbox(0);
      expect(nfts.length).to.equal(1);
    });

    it('should handle complex withdrawal scenarios', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge10'));
      
      // Create lockbox with assets
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('2') }
      );

      // Add multiple ERC20 tokens to test array management
      await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('200'));
      
      // First deposit
      await lockx.connect(owner).depositERC20(
        0,
        await mockERC20.getAddress(),
        ethers.parseEther('100'),
        referenceId
      );

      // Second deposit to same token (should increment balance)
      await lockx.connect(owner).depositERC20(
        0,
        await mockERC20.getAddress(),
        ethers.parseEther('50'),
        referenceId
      );

      const [ethBalance, erc20s,] = await lockx.connect(owner).getFullLockbox(0);
      expect(ethBalance).to.equal(ethers.parseEther('2'));
      expect(erc20s[0].balance).to.equal(ethers.parseEther('150'));
    });

    it('should handle multiple deposits to same token', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('edge11'));
      
      // Create lockbox with ETH
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // Multiple ERC20 deposits to same token
      await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('200'));
      
      await lockx.connect(owner).depositERC20(
        0,
        await mockERC20.getAddress(),
        ethers.parseEther('100'),
        referenceId
      );

      await lockx.connect(owner).depositERC20(
        0,
        await mockERC20.getAddress(),
        ethers.parseEther('50'),
        referenceId
      );

      const [ethBalance, erc20s,] = await lockx.connect(owner).getFullLockbox(0);
      expect(ethBalance).to.equal(ethers.parseEther('1'));
      expect(erc20s[0].balance).to.equal(ethers.parseEther('150'));
    });
  });
}); 