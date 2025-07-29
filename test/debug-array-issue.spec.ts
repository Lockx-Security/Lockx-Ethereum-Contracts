const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🔧 DEBUG ARRAY ISSUE', () => {
  let lockx, mockNFT, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('NFT Collection', 'NFT');
    
    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Mint NFTs
    await mockNFT.connect(owner).mint(user1.address, 1);
  });

  it('🔧 DEBUG: Test batchWithdraw array parameters', async () => {
    // First, let's test if we can call batchWithdraw with empty arrays
    console.log('Testing batchWithdraw with empty arrays...');
    
    try {
      // This should fail due to signature verification, but not due to array issues
      await lockx.connect(user1).batchWithdraw(
        1, // tokenId
        ethers.ZeroHash, // messageHash
        '0x00', // signature
        0, // amountETH
        [], // tokenAddresses - EMPTY
        [], // tokenAmounts - EMPTY  
        [], // nftContracts - EMPTY
        [], // nftTokenIds - EMPTY
        user1.address, // recipient
        ethers.ZeroHash, // referenceId
        Math.floor(Date.now() / 1000) + 3600 // signatureExpiry
      );
    } catch (error) {
      console.log('Empty arrays error:', error.message);
      // We expect this to fail, but not with array issues
    }
    
    // Now test with single-element arrays
    console.log('Testing batchWithdraw with single-element arrays...');
    const nftAddress = await mockNFT.getAddress();
    
    try {
      await lockx.connect(user1).batchWithdraw(
        1, // tokenId
        ethers.ZeroHash, // messageHash
        '0x00', // signature
        0, // amountETH
        [], // tokenAddresses - EMPTY
        [], // tokenAmounts - EMPTY
        [nftAddress], // nftContracts - SINGLE ELEMENT
        [1], // nftTokenIds - SINGLE ELEMENT
        user1.address, // recipient
        ethers.ZeroHash, // referenceId
        Math.floor(Date.now() / 1000) + 3600 // signatureExpiry
      );
    } catch (error) {
      console.log('Single element arrays error:', error.message);
    }
    
    console.log('✅ DEBUG: Array parameter test completed');
  });
});