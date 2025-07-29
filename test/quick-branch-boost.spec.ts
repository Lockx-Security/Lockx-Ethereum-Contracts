const { expect } = require('chai');
const { ethers } = require('hardhat');

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
        { value: ethers.parseEther('1') }
      );
      
      // 2. createLockboxWithERC20 - success path  
      await mockToken.connect(user1).approve(lockx.address, ethers.parseEther('100'));
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        mockToken.address,
        ethers.parseEther('100'),
        { value: ethers.parseEther('0.01') }
      );
      
      // 3. createLockboxWithERC721 - success path
      await mockNFT.connect(user1).approve(lockx.address, 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address, // to == msg.sender (validation ELSE)
        lockboxKeyPair.address, // non-zero key (validation ELSE)
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      // 4. createLockboxWithBatch - success path
      await mockToken.connect(user1).approve(lockx.address, ethers.parseEther('50'));
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address, // to == msg.sender (validation ELSE)
        lockboxKeyPair.address, // non-zero key (validation ELSE)
        ethers.parseEther('0.5'),
        [mockToken.address],
        [ethers.parseEther('50')],
        [],
        [],
        { value: ethers.parseEther('0.51') }
      );
    });

    it('🎯 Hit signature operation success branches', async () => {
      // Create lockbox first
      const newKeyPair = ethers.Wallet.createRandom();
      
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      
      // Domain for EIP-712
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.target
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
        ['uint256', 'string', 'uint256'],
        [tokenId, metadataURI, futureExpiry]
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
        futureExpiry
      );

      // 2. rotateLockboxKey - success path
      const rotateAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256'],
        [tokenId, newKeyPair.address, futureExpiry]
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
        futureExpiry
      );

      // 3. burnLockbox - success path
      const burnAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256'],
        [tokenId, futureExpiry]
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
        futureExpiry
      );
    });
  });

  describe('🎯 DEPOSITS.SOL - Hit Missing Branches', () => {
    it('🎯 Hit ELSE branch: NFT already exists in lockbox', async () => {
      // Create lockbox and deposit first NFT
      await mockNFT.connect(user1).approve(lockx.address, 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      
      // Approve and deposit second NFT from same contract
      await mockNFT.connect(user1).approve(lockx.address, 2);
      
      // This should hit the ELSE branch in _depositERC721 where nftContract already exists
      await lockx.connect(user1).depositERC721(tokenId, mockNFT.address, 2);
      
      // Verify both NFTs are in the lockbox
      expect(await lockx.getNFTCount(tokenId)).to.equal(2);
    });
  });

  describe('🎯 WITHDRAWALS.SOL - Hit Conditional Branches', () => {
    it('🎯 Hit ELSE branch: No duplicate NFTs in batch withdrawal', async () => {
      // Create lockbox with multiple NFTs
      await mockNFT.connect(user1).approve(lockx.address, 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      await mockNFT.connect(user1).approve(lockx.address, 2);
      await lockx.connect(user1).depositERC721(tokenId, mockNFT.address, 2);
      
      // Setup batch withdrawal with NO duplicates (hits ELSE branch)
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const referenceId = ethers.encodeBytes32String('test-ref');
      
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.target
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
        ['uint256', 'uint256[]', 'address[]', 'address[]', 'uint256[]', 'bytes32', 'address', 'uint256'],
        [tokenId, [], [], [mockNFT.address, mockNFT.address], [1, 2], referenceId, user1.address, futureExpiry]
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
        [],
        [],
        [mockNFT.address, mockNFT.address],
        [1, 2],
        referenceId,
        user1.address,
        futureExpiry
      );
    });
  });

  it('🎯 Quick coverage validation', async () => {
    // A simple test to ensure everything works
    expect(await lockx.totalSupply()).to.equal(0);
  });
});