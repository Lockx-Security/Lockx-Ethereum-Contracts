const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 BRANCH COVERAGE BOOST - Hit Missing Branches', () => {
  let lockx, usdtSimulator, owner, user, lockboxKey;

  beforeEach(async () => {
    [owner, user, lockboxKey] = await ethers.getSigners();

    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const USDTFactory = await ethers.getContractFactory('USDTSimulator');
    usdtSimulator = await USDTFactory.deploy();

    await usdtSimulator.mint(user.address, ethers.parseEther('1000'));
  });

  describe('🎯 DEPOSITS.SOL - Missing Branches', () => {
    it('🎯 Hit ELSE branch: NFT already exists in lockbox', async () => {
      // Create NFT contract for testing
      const MockNFTFactory = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFTFactory.deploy();
      
      // Mint two identical NFTs
      await mockNFT.mint(user.address, 1);
      await mockNFT.mint(user.address, 2);
      
      // Create lockbox and deposit first NFT
      await lockx.connect(user).createLockboxWithERC721(
        user.address,
        lockboxKey.address,
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      
      // Approve and deposit second identical NFT (same contract, different tokenId)
      await mockNFT.connect(user).approve(lockx.address, 2);
      
      // This should hit the ELSE branch in _depositERC721 where nftContract already exists
      await lockx.connect(user).depositERC721(tokenId, mockNFT.address, 2);
    });

    it('🎯 Hit IF branch: Try to remove non-existent ERC20 token (idx == 0)', async () => {
      // Create lockbox
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      
      // Get message hash for swap operation
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.address
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const authData = ethers.defaultAbiCoder.encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [tokenId, ethers.constants.AddressZero, usdtSimulator.address, ethers.parseEther('0.5'), 1, user.address, ethers.keccak256('0x'), ethers.formatBytes32String('ref'), user.address, Math.floor(Date.now() / 1000) + 3600, ethers.constants.AddressZero]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey._signTypedData(domain, types, value);
      const messageHash = ethers._TypedDataEncoder.hash(domain, types, value);

      // This will try to remove a token that was never registered, hitting idx == 0 branch
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          ethers.constants.AddressZero, // ETH in
          usdtSimulator.address, // USDT out
          ethers.parseEther('0.5'),
          1,
          user.address, // mock router
          '0x', // mock data
          ethers.formatBytes32String('ref'),
          Math.floor(Date.now() / 1000) + 3600,
          ethers.constants.AddressZero
        )
      ).to.be.reverted; // Will fail but should hit the idx == 0 return branch first
    });

    it('🎯 Hit IF branch: Try to remove non-existent NFT (idx == 0)', async () => {
      // Create lockbox
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      
      // Try to withdraw an NFT that was never deposited
      // This should hit the idx == 0 return in _removeNFTKey
      await expect(
        lockx.connect(user).withdrawNFT(
          tokenId,
          ethers.formatBytes32String('nonexistent'),
          '0x',
          user.address,
          ethers.constants.AddressZero,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.reverted; // Will fail but should hit the idx == 0 branch
    });
  });

  describe('🎯 WITHDRAWALS.SOL - Missing Branches', () => {
    it('🎯 Hit IF branches: Balance checks and error conditions', async () => {
      // Create lockbox with minimal balance
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        { value: ethers.parseEther('0.1') }
      );
      
      const tokenId = 1;
      
      // Get message hash for swap operation
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.address
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const authData = ethers.defaultAbiCoder.encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [tokenId, ethers.constants.AddressZero, usdtSimulator.address, ethers.parseEther('1'), 1, user.address, ethers.keccak256('0x'), ethers.formatBytes32String('ref'), user.address, Math.floor(Date.now() / 1000) + 3600, ethers.constants.AddressZero]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey._signTypedData(domain, types, value);
      const messageHash = ethers._TypedDataEncoder.hash(domain, types, value);

      // This should hit the IF branch for insufficient ETH balance
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          ethers.constants.AddressZero, // ETH in
          usdtSimulator.address, // USDT out
          ethers.parseEther('1'), // More than available
          1,
          user.address,
          '0x',
          ethers.formatBytes32String('ref'),
          Math.floor(Date.now() / 1000) + 3600,
          ethers.constants.AddressZero
        )
      ).to.revertedWith('NoETHBalance()');
    });

    it('🎯 Hit ELSE branch: Successful duplicate NFT check', async () => {
      // Create NFT contract
      const MockNFTFactory = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFTFactory.deploy();
      
      await mockNFT.mint(user.address, 1);
      await mockNFT.mint(user.address, 2);
      
      // Create lockbox and deposit NFTs
      await lockx.connect(user).createLockboxWithERC721(
        user.address,
        lockboxKey.address,
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      await mockNFT.connect(user).approve(lockx.address, 2);
      await lockx.connect(user).depositERC721(tokenId, mockNFT.address, 2);
      
      // Withdraw different NFTs (no duplicates) - hits ELSE branch
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.address
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      const authData = ethers.defaultAbiCoder.encode(
        ['uint256', 'uint256[]', 'address[]', 'address[]', 'uint256[]', 'bytes32', 'address', 'uint256'],
        [tokenId, [], [], [mockNFT.address, mockNFT.address], [1, 2], ethers.formatBytes32String('ref'), user.address, Math.floor(Date.now() / 1000) + 3600]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey._signTypedData(domain, types, value);
      const messageHash = ethers._TypedDataEncoder.hash(domain, types, value);

      // This should successfully check for duplicates (ELSE path)
      await lockx.connect(user).batchWithdraw(
        tokenId,
        messageHash,
        signature,
        [],
        [],
        [mockNFT.address, mockNFT.address],
        [1, 2],
        ethers.formatBytes32String('ref'),
        user.address,
        Math.floor(Date.now() / 1000) + 3600
      );
    });
  });

  describe('🎯 LOCKX.SOL - Missing Branches', () => {
    it('🎯 Hit ELSE branches: Successful lockbox creation paths', async () => {
      // Test all creation methods with valid inputs to hit ELSE/success branches
      
      // 1. createLockboxWithETH - valid path
      await lockx.connect(user).createLockboxWithETH(
        user.address, // to == msg.sender (hits ELSE branch)
        lockboxKey.address, // non-zero key (hits ELSE branch)
        { value: ethers.parseEther('1') }
      );

      // 2. createLockboxWithERC20 - valid path
      await usdtSimulator.connect(user).approve(lockx.address, ethers.parseEther('100'));
      await lockx.connect(user).createLockboxWithERC20(
        user.address,
        lockboxKey.address,
        usdtSimulator.address,
        ethers.parseEther('100'),
        { value: ethers.parseEther('0.01') }
      );

      // 3. createLockboxWithERC721 - valid path
      const MockNFTFactory = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFTFactory.deploy();
      await mockNFT.mint(user.address, 1);

      await mockNFT.connect(user).approve(lockx.address, 1);
      await lockx.connect(user).createLockboxWithERC721(
        user.address, // to == msg.sender
        lockboxKey.address, // non-zero key
        mockNFT.address,
        1,
        { value: ethers.parseEther('0.01') }
      );

      // 4. createLockboxWithBatch - valid path
      await usdtSimulator.connect(user).approve(lockx.address, ethers.parseEther('50'));
      await lockx.connect(user).createLockboxWithBatch(
        user.address, // to == msg.sender
        lockboxKey.address, // non-zero key
        ethers.parseEther('0.5'),
        [usdtSimulator.address],
        [ethers.parseEther('50')],
        [],
        [],
        { value: ethers.parseEther('0.51') }
      );
    });

    it('🎯 Hit ELSE branches: Successful signature operations', async () => {
      // Create lockbox first
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      const domain = {
        name: 'Lockx',
        version: '2',
        chainId: await ethers.provider.getNetwork().then(n => n.chainId),
        verifyingContract: lockx.address
      };

      const types = {
        Operation: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'opType', type: 'uint8' },
          { name: 'dataHash', type: 'bytes32' }
        ]
      };

      // 1. setTokenMetadataURI - valid signature (not expired)
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
      const metadataAuthData = ethers.defaultAbiCoder.encode(
        ['uint256', 'string', 'uint256'],
        [tokenId, 'https://api.lockx.io/metadata/1', futureExpiry]
      );

      const metadataValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(metadataAuthData)
      };

      const metadataSignature = await lockboxKey._signTypedData(domain, types, metadataValue);
      const metadataHash = ethers._TypedDataEncoder.hash(domain, types, metadataValue);

      // This hits the ELSE branch for non-expired signature
      await lockx.connect(user).setTokenMetadataURI(
        tokenId,
        metadataHash,
        metadataSignature,
        'https://api.lockx.io/metadata/1',
        futureExpiry
      );

      // 2. rotateLockboxKey - valid operation
      const newKey = ethers.Wallet.createRandom();
      const rotateAuthData = ethers.defaultAbiCoder.encode(
        ['uint256', 'address', 'uint256'],
        [tokenId, newKey.address, futureExpiry]
      );

      const rotateValue = {
        tokenId: tokenId,
        nonce: 2, // Incremented after previous operation
        opType: 0, // ROTATE_KEY
        dataHash: ethers.keccak256(rotateAuthData)
      };

      const rotateSignature = await lockboxKey._signTypedData(domain, types, rotateValue);
      const rotateHash = ethers._TypedDataEncoder.hash(domain, types, rotateValue);

      await lockx.connect(user).rotateLockboxKey(
        tokenId,
        rotateHash,
        rotateSignature,
        newKey.address,
        futureExpiry
      );

      // 3. burnLockbox - valid operation
      const burnAuthData = ethers.defaultAbiCoder.encode(
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
      const burnSignature = await newKey._signTypedData(domain, types, burnValue);
      const burnHash = ethers._TypedDataEncoder.hash(domain, types, burnValue);

      await lockx.connect(user).burnLockbox(
        tokenId,
        burnHash,
        burnSignature,
        futureExpiry
      );
    });
  });
});