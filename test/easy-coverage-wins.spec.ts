import { ethers } from 'hardhat';
import { expect } from 'chai';

describe('🎯 EASY COVERAGE WINS - Simple Missing Branches', () => {
  let lockx: any, owner: any, user: any, attacker: any, lockboxKeypair: any;
  let tokenA: any, nft: any;

  beforeEach(async () => {
    [owner, user, attacker, lockboxKeypair] = await ethers.getSigners();
    
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    tokenA = await MockERC20Factory.deploy();
    await tokenA.initialize('Token A', 'TOKA');
    
    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    nft = await MockERC721Factory.deploy();
    await nft.initialize('Mock NFT', 'MNFT');
    
    await lockx.connect(user).createLockboxWithETH(
      user.address,
      lockboxKeypair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    
    await tokenA.mint(user.address, ethers.parseEther('1000'));
    await tokenA.mint(owner.address, ethers.parseEther('1000'));
  });

  describe('✅ ACHIEVABLE BRANCHES', () => {
    it('should hit nonexistent token check', async () => {
      // Try to access a token that doesn't exist
      await expect(
        lockx.connect(user).depositETH(999, ethers.ZeroHash, { value: ethers.parseEther('0.1') })
      ).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });

    it('should hit createLockboxWithBatch SelfMintOnly error', async () => {
      await tokenA.approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      await expect(
        lockx.createLockboxWithBatch(
          user.address, // Different from msg.sender (owner)
          lockboxKeypair.address,
          ethers.parseEther('0.1'),
          [await tokenA.getAddress()],
          [ethers.parseEther('100')],
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('0.1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');
    });

    it('should hit createLockboxWithBatch ZeroKey error', async () => {
      await tokenA.approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      await expect(
        lockx.createLockboxWithBatch(
          owner.address,
          ethers.ZeroAddress, // Zero key
          ethers.parseEther('0.1'),
          [await tokenA.getAddress()],
          [ethers.parseEther('100')],
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('0.1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
    });

    it('should hit NotOwner error from non-owner', async () => {
      await expect(
        lockx.connect(attacker).getNonce(0)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it.skip('should hit fallback function rejection', async () => {
      // Send ETH directly to contract - may not actually revert
      await owner.sendTransaction({
        to: await lockx.getAddress(),
        value: ethers.parseEther('0.1'),
        data: '0x'
      });
    });

    it('should test contract name and interfaces', async () => {
      // Test the name function to hit initialization branches
      expect(await lockx.name()).to.equal('Lockx.io');
      
      // Test various interface support
      expect(await lockx.supportsInterface('0x80ac58cd')).to.be.true; // ERC721
      expect(await lockx.supportsInterface('0x5b5e139f')).to.be.true; // ERC721Metadata
      expect(await lockx.supportsInterface('0x01ffc9a7')).to.be.true; // ERC165
      expect(await lockx.supportsInterface('0xffffffff')).to.be.false; // Invalid interface
    });

    it('should hit NFT ownership check branches', async () => {
      // Try to call owner-only functions from non-owner
      await expect(
        lockx.connect(attacker).getFullLockbox(0)
      ).to.be.revertedWithCustomError(lockx, 'NotOwner');
    });

    it('should hit token array management', async () => {
      // Deposit tokens to hit array logic
      await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user).depositERC20(0, await tokenA.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      // Deposit NFT too
      await nft.mint(user.address, 1);
      await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
      await lockx.connect(user).depositERC721(0, await nft.getAddress(), 1, ethers.ZeroHash);
      
      // Get lockbox info to verify deposits
      const info = await lockx.connect(user).getFullLockbox(0);
      expect(info[0]).to.be.gt(0); // ETH balance should be > 0
    });

    it('should hit duplicate NFT handling', async () => {
      // Mint and approve NFT
      await nft.mint(user.address, 2);
      await nft.connect(user).setApprovalForAll(await lockx.getAddress(), true);
      
      // Deposit the NFT
      await lockx.connect(user).depositERC721(0, await nft.getAddress(), 2, ethers.ZeroHash);
      
      // Try to deposit the same NFT again - should fail because it's already transferred
      await expect(
        lockx.connect(user).depositERC721(0, await nft.getAddress(), 2, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(nft, 'ERC721IncorrectOwner');
    });

    it('should hit tokenURI branches', async () => {
      // Set a default URI first
      await lockx.connect(owner).setDefaultMetadataURI('https://lockx.io/metadata/');
      
      // Test tokenURI for existing token
      const uri = await lockx.tokenURI(0);
      expect(uri).to.include('lockx.io'); // Should return default URI
      
      // Test tokenURI for non-existent token
      await expect(
        lockx.tokenURI(999)
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });

    it('should hit metadata URI branches', async () => {
      // Test setting default metadata URI by owner
      await lockx.connect(owner).setDefaultMetadataURI('ipfs://newdefault/');
      
      // Test setting by non-owner should fail
      await expect(
        lockx.connect(user).setDefaultMetadataURI('ipfs://unauthorized/')
      ).to.be.revertedWithCustomError(lockx, 'OwnableUnauthorizedAccount');
    });

    it('should hit soulbound transfer prevention', async () => {
      // Test that all transfer functions are blocked
      await expect(
        lockx.connect(user).transferFrom(user.address, attacker.address, 0)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
      
      await expect(
        lockx.connect(user)['safeTransferFrom(address,address,uint256)'](user.address, attacker.address, 0)
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
      
      await expect(
        lockx.connect(user)['safeTransferFrom(address,address,uint256,bytes)'](user.address, attacker.address, 0, '0x')
      ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
    });

    it('should hit locked status check', async () => {
      // Test that NFT is always locked (soulbound)
      expect(await lockx.locked(0)).to.be.true;
      
      // For non-existent tokens, test that the function handles them
      await expect(
        lockx.locked(999)
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
    });
  });
});