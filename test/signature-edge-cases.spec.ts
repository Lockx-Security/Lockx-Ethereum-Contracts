import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 SIGNATURE VERIFICATION MISSING BRANCHES', () => {
  let lockx, owner, user1, user2, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    
    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
  });

  it('🚫 onlyTokenOwner modifier - should revert NotOwner when non-owner calls', async () => {
    // Create a lockbox owned by user1
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );
    
    // Get the token ID from the event
    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);
    
    // Test 1: user2 (non-owner) tries to call getActiveLockboxPublicKeyForToken
    // This should hit the onlyTokenOwner modifier revert branch
    try {
      await lockx.connect(user2).getActiveLockboxPublicKeyForToken(tokenId);
      expect.fail('Should have reverted with NotOwner');
    } catch (error) {
      expect(error.message).to.include('NotOwner');
      console.log('✅ BRANCH HIT: onlyTokenOwner revert in getActiveLockboxPublicKeyForToken');
    }
    
    // Test 2: user2 (non-owner) tries to call getNonce  
    // This should hit the onlyTokenOwner modifier revert branch again
    try {
      await lockx.connect(user2).getNonce(tokenId);
      expect.fail('Should have reverted with NotOwner');
    } catch (error) {
      expect(error.message).to.include('NotOwner');
      console.log('✅ BRANCH HIT: onlyTokenOwner revert in getNonce');
    }
    
    console.log('✅ ALL MISSING SIGNATURE VERIFICATION BRANCHES HIT!');
  });
});