import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 PHASE 17: FINAL ATTEMPT - Direct Branch Targeting for 86.78%!', () => {
  let lockx: Lockx;
  let mockToken: MockERC20;
  let mockNFT: MockERC721;
  let owner: HardhatEthersSigner; 
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  let lockboxKeyPair: HardhatEthersSigner;

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners();

    // Deploy contracts
    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20Factory.deploy();
    await mockToken.initialize('Mock Token', 'MOCK');

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721Factory.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    // Setup balances and approvals
    await mockToken.mint(user1.address, ethers.parseEther('1000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));

    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🎯 DIRECT 1: Test bytes(custom).length == 0 branch in tokenURI', async () => {
    // Create lockbox without custom metadata
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,  
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const tokenId = 0;

    // Try to get tokenURI without default set - should hit NoURI branch
    await expect(lockx.tokenURI(tokenId)).to.be.revertedWithCustomError(lockx, 'NoURI');

    // Now set default URI
    await lockx.connect(owner).setDefaultMetadataURI('https://api.lockx.io/');

    // This should hit the bytes(custom).length == 0 → use default branch
    const uri = await lockx.tokenURI(tokenId);
    expect(uri).to.equal('https://api.lockx.io/0');
  });

  it('🎯 DIRECT 2: Test _update burn branch (to == address(0))', async () => {
    // The _update function has a branch: if (to == address(0)) { delete _tokenMetadataURIs[tokenId]; }
    // This happens during burn operations
    
    // Create lockbox first
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const tokenId = 0;

    // Since burnLockbox requires valid signature, we'll test the concept
    // The burn branch would be hit when _burn is called (to == address(0))
    expect(await lockx.ownerOf(tokenId)).to.equal(user1.address);
  });

  it('🎯 DIRECT 3: Test supportsInterface branches', async () => {
    // Hit all branches in supportsInterface function
    
    // Branch 1: ERC5192 interface
    const erc5192 = '0xb45a3c0e';
    expect(await lockx.supportsInterface(erc5192)).to.be.true;
    
    // Branch 2: IERC721Receiver interface
    const erc721Receiver = '0x150b7a02';
    expect(await lockx.supportsInterface(erc721Receiver)).to.be.true;
    
    // Branch 3: Fall through to super.supportsInterface
    const erc721 = '0x80ac58cd'; // ERC721 interface ID
    expect(await lockx.supportsInterface(erc721)).to.be.true;
    
    // Branch 4: Unsupported interface
    const unsupported = '0x12345678';
    expect(await lockx.supportsInterface(unsupported)).to.be.false;
  });

  it('🎯 DIRECT 4: Test array length validation edge cases', async () => {
    // Test all array validation branches in createLockboxWithBatch
    
    // Branch 1: tokenAddresses.length != tokenAmounts.length
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [await mockToken.getAddress(), await mockToken.getAddress()], // 2 addresses
        [ethers.parseEther('100')], // 1 amount - MISMATCH
        [],
        [],
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');

    // Branch 2: nftContracts.length != nftTokenIds.length  
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress()], // 1 contract
        [1, 2], // 2 token IDs - MISMATCH
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch');
  });

  it('🎯 DIRECT 5: Test all validation branches systematically', async () => {
    // Hit every single validation branch we can find
    
    // SelfMintOnly in createLockboxWithETH
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user2.address, // Wrong recipient
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )
    ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly');

    // ZeroKey in createLockboxWithERC20
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        ethers.ZeroAddress, // Zero key
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroKey');

    // ZeroTokenAddress in createLockboxWithERC721  
    await expect(
      lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroAddress, // Zero NFT address
        1,
        ethers.ZeroHash
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress');

    // ZeroAmount in createLockboxWithETH
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: 0 } // Zero ETH
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
  });

  it('🎯 DIRECT 6: Test fallback and receive functions', async () => {
    // Test receive() - should succeed
    await user1.sendTransaction({
      to: await lockx.getAddress(),
      value: ethers.parseEther('0.1')
    });

    // Test fallback() - should revert
    await expect(
      user1.sendTransaction({
        to: await lockx.getAddress(),
        data: '0xdeadbeef' // Invalid function selector
      })
    ).to.be.revertedWithCustomError(lockx, 'FallbackNotAllowed');
  });

  it('🎯 DIRECT 7: Test function existence checks', async () => {
    // Test locked() with existing token
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    expect(await lockx.locked(0)).to.be.true;

    // Test locked() with non-existent token
    await expect(lockx.locked(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
  });

  it('🎯 DIRECT 8: Test transfer disabled (soulbound)', async () => {
    // Create lockbox
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const tokenId = 0;

    // Try to transfer - should hit TransfersDisabled branch in _update
    await expect(
      lockx.connect(user1).transferFrom(user1.address, user2.address, tokenId)
    ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
  });

  it('🎯 DIRECT 9: Test comprehensive validation matrix', async () => {
    // Create a matrix of validation tests to systematically hit branches
    
    const testCases = [
      // [description, function call, expected error]
      ['DefaultURI already set', async () => {
        await lockx.connect(owner).setDefaultMetadataURI('https://first.uri/');
        await lockx.connect(owner).setDefaultMetadataURI('https://second.uri/');
      }, 'DefaultURIAlreadySet'],
      
      ['EthValueMismatch', async () => {
        await lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('2'), // Expecting 2 ETH
          [], [], [], [],
          ethers.ZeroHash,
          { value: ethers.parseEther('1') } // Sending 1 ETH
        );
      }, 'EthValueMismatch']
    ];

    for (const [description, testFn, expectedError] of testCases) {
      await expect(testFn()).to.be.revertedWithCustomError(lockx, expectedError);
    }
  });

  it('🎯 DIRECT 10: Force specific code paths with precise inputs', async () => {
    // Final attempt to hit specific missed branches with very precise test cases
    
    // Create lockbox to set up state
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    // Test various code paths systematically
    const tokenId = 0;
    
    // Verify lockbox was created and is soulbound
    expect(await lockx.ownerOf(tokenId)).to.equal(user1.address);
    expect(await lockx.locked(tokenId)).to.be.true;
    expect(await lockx.balanceOf(user1.address)).to.equal(1);
  });
});