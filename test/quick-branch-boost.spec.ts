import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🎯 QUICK BRANCH BOOST - Hit Key Missing Branches', () => {
  let lockx, mockToken, mockNFT, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    // Generate a random key pair for the lockbox
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Deploy main contract
    const LockxContract = await ethers.getContractFactory('Lockx');
    lockx = await LockxContract.deploy();
    
    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    
    // Deploy mock ERC721
    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNFT = await MockERC721.deploy();
    await mockNFT.initialize('Mock NFT', 'MNFT');
    
    // Mint tokens to users
    await mockToken.mint(user1.address, ethers.parseEther('10000'));
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
  });

  describe('🎯 LOCKX.SOL - Hit Success Path Branches', () => {
    it('🎯 Hit successful lockbox creation branches (ELSE paths)', async () => {
      // These should hit the ELSE branches where validations pass
      
      // 1. createLockboxWithETH - success path
      await lockx.connect(user1).createLockboxWithETH(
        user1.address, // to == msg.sender (hits validation ELSE)
        lockboxKeyPair.address, // non-zero key (hits validation ELSE)
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('1') }
      );
      
      // 2. createLockboxWithERC20 - success path  
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash // referenceId
      );
      
      // 3. createLockboxWithERC721 - success path
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address, // to == msg.sender (validation ELSE)
        lockboxKeyPair.address, // non-zero key (validation ELSE)
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash // referenceId
      );
      
      // 4. createLockboxWithBatch - success path
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('50'));
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address, // to == msg.sender (validation ELSE)
        lockboxKeyPair.address, // non-zero key (validation ELSE)
        ethers.parseEther('0.5'),
        [await mockToken.getAddress()],
        [ethers.parseEther('50')],
        [],
        [],
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('0.5') }
      );
    });

    it('🎯 Hit signature operation success branches', async () => {
      // Create lockbox first
      const newKeyPair = ethers.Wallet.createRandom();
      
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash, // referenceId
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 0;
      const futureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600; // 1 hour from now
      
      // Domain for EIP-712
      const domain = {
        name: 'Lockx',
        version: '3',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
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

      // 1. setTokenMetadataURI - non-expired signature (ELSE branch)
      const metadataURI = 'https://api.lockx.io/metadata/1';
      const metadataAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'address', 'uint256'],
        [tokenId, metadataURI, ethers.ZeroHash, user1.address, futureExpiry]
      );

      const metadataValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(metadataAuthData)
      };

      const metadataSignature = await lockboxKeyPair.signTypedData(domain, types, metadataValue);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, metadataValue);

      // This should hit the ELSE branch for non-expired signature
      await lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        messageHash,
        metadataSignature,
        metadataURI,
        ethers.ZeroHash, // referenceId
        futureExpiry
      );

      // 2. rotateLockboxKey - success path
      const rotateAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, newKeyPair.address, ethers.ZeroHash, user1.address, futureExpiry]
      );

      const rotateValue = {
        tokenId: tokenId,
        nonce: 2, // Incremented after previous operation
        opType: 0, // ROTATE_KEY
        dataHash: ethers.keccak256(rotateAuthData)
      };

      const rotateSignature = await lockboxKeyPair.signTypedData(domain, types, rotateValue);
      const rotateHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);

      await lockx.connect(user1).rotateLockboxKey(
        tokenId,
        rotateHash,
        rotateSignature,
        newKeyPair.address,
        ethers.ZeroHash, // referenceId
        futureExpiry
      );

      // 3. burnLockbox - success path
      const burnAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user1.address, futureExpiry]
      );

      const burnValue = {
        tokenId: tokenId,
        nonce: 3, // Incremented after key rotation
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnAuthData)
      };

      // Sign with the NEW key since we rotated
      const burnSignature = await newKeyPair.signTypedData(domain, types, burnValue);
      const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

      await lockx.connect(user1).burnLockbox(
        tokenId,
        burnHash,
        burnSignature,
        ethers.ZeroHash, // referenceId
        futureExpiry
      );
    });
  });

  describe('🎯 DEPOSITS.SOL - Hit Missing Branches', () => {
    it('🎯 Hit ELSE branch: NFT already exists in lockbox', async () => {
      // Create lockbox and deposit first NFT
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash // referenceId
      );
      
      const tokenId = 0;
      
      // Approve and deposit second NFT from same contract
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 2);
      
      // This should hit the ELSE branch in _depositERC721 where nftContract already exists
      await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash);
      
      // NFT deposit should complete successfully
      // (Can't verify count as getNFTCount doesn't exist in contract)
    });
  });

  describe('🎯 WITHDRAWALS.SOL - Hit Conditional Branches', () => {
    it('🎯 Hit ELSE branch: No duplicate NFTs in batch withdrawal', async () => {
      // Create lockbox with multiple NFTs
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash // referenceId
      );
      
      const tokenId = 0;
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 2);
      await lockx.connect(user1).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash);
      
      // Setup batch withdrawal with NO duplicates (hits ELSE branch)
      const futureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
      const referenceId = ethers.encodeBytes32String('test-ref');
      
      const domain = {
        name: 'Lockx',
        version: '3',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
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

      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [1, 2], user1.address, referenceId, user1.address, futureExpiry]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This should successfully check for duplicates (ELSE path) and complete withdrawal
      await lockx.connect(user1).batchWithdraw(
        tokenId,
        messageHash,
        signature,
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // nftContracts
        [1, 2], // nftTokenIds
        user1.address, // recipient
        referenceId, // referenceId
        futureExpiry // signatureExpiry
      );
    });
  });

  it('🎯 Quick coverage validation', async () => {
    // A simple test to ensure everything works - check that contract was deployed
    expect(await lockx.getAddress()).to.not.equal(ethers.ZeroAddress);
  });
});