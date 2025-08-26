import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('LOCKX - Final Push to 90% Branch Coverage', () => {
  let lockx, mockToken, mockNFT, owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock', 'MCK');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('NFT', 'NFT');

    await mockToken.transfer(user1.address, ethers.parseEther('1000'));
    for (let i = 1; i <= 5; i++) {
      await mockNFT.mint(user1.address, i);
    }
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
  });

  describe('Hit LockboxNotEmpty branches in burn', () => {
    it('should revert burn when lockbox has ERC20 tokens', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        keyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

      const domain = {
        name: 'Lockx',
        version: '4',
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

      // Try to burn with tokens still in lockbox
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const burnValue = {
        tokenId,
        nonce: 1,
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnData)
      };

      const burnSig = await keyPair.signTypedData(domain, types, burnValue);
      const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

      await expect(
        lockx.connect(user1).burnLockbox(
          tokenId,
          burnHash,
          burnSig,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'LockboxNotEmpty');
      
      console.log('✅ Hit LockboxNotEmpty branch for ERC20 tokens');
    });

    it('should revert burn when lockbox has NFTs', async () => {
      // Create lockbox with NFT
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        keyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      );

      const tokenId = 0;
      const currentBlock = await ethers.provider.getBlock('latest');
      const signatureExpiry = currentBlock.timestamp + 86400;

      const domain = {
        name: 'Lockx',
        version: '4',
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

      // Try to burn with NFT still in lockbox
      const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user1.address, signatureExpiry]
      );

      const burnValue = {
        tokenId,
        nonce: 1,
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnData)
      };

      const burnSig = await keyPair.signTypedData(domain, types, burnValue);
      const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

      await expect(
        lockx.connect(user1).burnLockbox(
          tokenId,
          burnHash,
          burnSig,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'LockboxNotEmpty');
      
      console.log('✅ Hit LockboxNotEmpty branch for NFTs');
    });
  });

  describe('Reentrancy guard branches', () => {
    it.skip('should deploy and test reentrancy attacker', async () => {
      // Deploy a reentrancy attacker contract
      const ReentrancyAttacker = await ethers.getContractFactory('ReentrancyAttacker');
      const attacker = await ReentrancyAttacker.deploy(await lockx.getAddress(), keyPair.address);

      // Fund the attacker
      await owner.sendTransaction({
        to: await attacker.getAddress(),
        value: ethers.parseEther('5')
      });

      // Create a lockbox from the attacker contract
      await attacker.createLockboxWithETH(keyPair.address, { value: ethers.parseEther('1') });
      
      // Try to trigger reentrancy (this will fail due to guard)
      await expect(
        attacker.attackWithdrawETH(0, keyPair.address)
      ).to.be.reverted;

      console.log('✅ Tested reentrancy guard branches');
    });
  });
});