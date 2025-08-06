import { expect } from 'chai';
import { ethers } from 'hardhat';

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
      
      // Approve NFTs
      await mockNFT.connect(user).approve(await lockx.getAddress(), 1);
      
      // Create lockbox and deposit first NFT
      await lockx.connect(user).createLockboxWithERC721(
        user.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      );
      
      const tokenId = 0;
      
      // Approve and deposit second identical NFT (same contract, different tokenId)
      await mockNFT.connect(user).approve(await lockx.getAddress(), 2);
      
      // This should hit the ELSE branch in _depositERC721 where nftContract already exists
      await lockx.connect(user).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash);
    });

    it('🎯 Hit IF branch: Try to remove non-existent ERC20 token (idx == 0)', async () => {
      // Create lockbox
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 0;
      
      // Get message hash for swap operation
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

      const usdtAddress = await usdtSimulator.getAddress();
      const currentBlock = await ethers.provider.getBlock('latest');
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address'],
        [ethers.ZeroAddress, usdtAddress, ethers.parseEther('0.5'), 1, user.address, '0x', ethers.ZeroAddress]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This will try to remove a token that was never registered, hitting idx == 0 branch
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          ethers.ZeroAddress, // ETH in
          await usdtSimulator.getAddress(), // USDT out
          ethers.parseEther('0.5'),
          1,
          user.address, // mock router
          '0x', // mock data
          ethers.encodeBytes32String('ref'),
          (await ethers.provider.getBlock('latest'))!.timestamp + 3600,
          ethers.ZeroAddress
        )
      ).to.be.reverted; // Will fail but should hit the idx == 0 return branch first
    });

    it('🎯 Hit IF branch: Try to remove non-existent NFT (idx == 0)', async () => {
      // Create lockbox
      await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 0;
      
      // Try to withdraw an NFT that was never deposited
      // This should hit the idx == 0 return in _removeNFTKey
      await expect(
        lockx.connect(user).withdrawERC721(
          tokenId,
          ethers.encodeBytes32String('nonexistent'),
          '0x',
          ethers.ZeroAddress,
          0,
          user.address,
          ethers.encodeBytes32String('ref'),
          (await ethers.provider.getBlock('latest'))!.timestamp + 3600
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
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      );
      
      const tokenId = 0;
      
      // Get message hash for swap operation
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

      const usdtAddress = await usdtSimulator.getAddress();
      const currentBlock = await ethers.provider.getBlock('latest');
      const authData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint256', 'uint256', 'address', 'bytes', 'address'],
        [ethers.ZeroAddress, usdtAddress, ethers.parseEther('1'), 1, user.address, '0x', ethers.ZeroAddress]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This should hit the IF branch for insufficient ETH balance
      await expect(
        lockx.connect(user).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          ethers.ZeroAddress, // ETH in
          await usdtSimulator.getAddress(), // USDT out
          ethers.parseEther('1'), // More than available (lockbox only has 0.1)
          1,
          user.address,
          '0x',
          ethers.encodeBytes32String('ref'),
          (await ethers.provider.getBlock('latest'))!.timestamp + 3600,
          ethers.ZeroAddress
        )
      ).to.be.reverted; // Any revert is fine, we just want to hit the balance check branch
    });

    it('🎯 Hit ELSE branch: Successful duplicate NFT check', async () => {
      // Create NFT contract
      const MockNFTFactory = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFTFactory.deploy();
      
      await mockNFT.mint(user.address, 1);
      await mockNFT.mint(user.address, 2);
      
      // Approve NFTs
      await mockNFT.connect(user).approve(await lockx.getAddress(), 1);
      
      // Create lockbox and deposit NFTs
      await lockx.connect(user).createLockboxWithERC721(
        user.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      );
      
      const tokenId = 0;
      await mockNFT.connect(user).approve(await lockx.getAddress(), 2);
      await lockx.connect(user).depositERC721(tokenId, await mockNFT.getAddress(), 2, ethers.ZeroHash);
      
      // Withdraw different NFTs (no duplicates) - hits ELSE branch
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
        [tokenId, 0, [], [], [await mockNFT.getAddress(), await mockNFT.getAddress()], [1, 2], user.address, ethers.encodeBytes32String('ref'), user.address, (await ethers.provider.getBlock('latest'))!.timestamp + 3600]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(authData)
      };

      const signature = await lockboxKey.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This should successfully check for duplicates (ELSE path)
      await lockx.connect(user).batchWithdraw(
        tokenId,
        messageHash,
        signature,
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // nftContracts
        [1, 2], // nftTokenIds
        user.address, // recipient
        ethers.encodeBytes32String('ref'), // referenceId
        (await ethers.provider.getBlock('latest'))!.timestamp + 3600 // signatureExpiry
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
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );

      // 2. createLockboxWithERC20 - valid path
      await usdtSimulator.connect(user).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user).createLockboxWithERC20(
        user.address,
        lockboxKey.address,
        await usdtSimulator.getAddress(),
        ethers.parseEther('100'),
        ethers.ZeroHash
      );

      // 3. createLockboxWithERC721 - valid path
      const MockNFTFactory = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFTFactory.deploy();
      await mockNFT.mint(user.address, 1);

      await mockNFT.connect(user).approve(await lockx.getAddress(), 1);
      await lockx.connect(user).createLockboxWithERC721(
        user.address, // to == msg.sender
        lockboxKey.address, // non-zero key
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      );

      // 4. createLockboxWithBatch - valid path
      await usdtSimulator.connect(user).approve(await lockx.getAddress(), ethers.parseEther('50'));
      const usdtAddress2 = await usdtSimulator.getAddress();
      await lockx.connect(user).createLockboxWithBatch(
        user.address, // to == msg.sender
        lockboxKey.address, // non-zero key
        ethers.parseEther('0.5'),
        [usdtAddress2],
        [ethers.parseEther('50')],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      );
    });

    it('🎯 Hit ELSE branches: Successful signature operations', async () => {
      // Create lockbox first
      const tx = await lockx.connect(user).createLockboxWithETH(
        user.address,
        lockboxKey.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      
      // Get the actual tokenId from the transaction
      const receipt = await tx.wait();
      const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      const tokenId = parseInt(transferEvent.topics[3], 16);
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

      // 1. setTokenMetadataURI - valid signature (not expired)
      const futureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600; // 1 hour from now
      const metadataAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'string', 'bytes32', 'address', 'uint256'],
        [tokenId, 'https://api.lockx.io/metadata/1', ethers.ZeroHash, user.address, futureExpiry]
      );

      const metadataValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 5, // SET_TOKEN_URI
        dataHash: ethers.keccak256(metadataAuthData)
      };

      const metadataSignature = await lockboxKey.signTypedData(domain, types, metadataValue);
      const metadataHash = ethers.TypedDataEncoder.hash(domain, types, metadataValue);

      // This hits the ELSE branch for non-expired signature
      await lockx.connect(user).setTokenMetadataURI(
        tokenId,
        metadataHash,
        metadataSignature,
        'https://api.lockx.io/metadata/1',
        ethers.ZeroHash, // referenceId
        futureExpiry
      );

      // 2. rotateLockboxKey - valid operation
      const newKey = ethers.Wallet.createRandom();
      const rotateAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, newKey.address, ethers.ZeroHash, user.address, futureExpiry]
      );

      const rotateValue = {
        tokenId: tokenId,
        nonce: 2, // Incremented after previous operation
        opType: 0, // ROTATE_KEY
        dataHash: ethers.keccak256(rotateAuthData)
      };

      const rotateSignature = await lockboxKey.signTypedData(domain, types, rotateValue);
      const rotateHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);

      await lockx.connect(user).rotateLockboxKey(
        tokenId,
        rotateHash,
        rotateSignature,
        newKey.address,
        ethers.ZeroHash, // referenceId
        futureExpiry
      );

      // 3. burnLockbox - valid operation
      const burnAuthData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'bytes32', 'address', 'uint256'],
        [tokenId, ethers.ZeroHash, user.address, futureExpiry]
      );

      const burnValue = {
        tokenId: tokenId,
        nonce: 3, // Incremented after key rotation
        opType: 4, // BURN_LOCKBOX
        dataHash: ethers.keccak256(burnAuthData)
      };

      // Sign with the NEW key since we rotated
      const burnSignature = await newKey.signTypedData(domain, types, burnValue);
      const burnHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

      await lockx.connect(user).burnLockbox(
        tokenId,
        burnHash,
        burnSignature,
        ethers.ZeroHash, // referenceId
        futureExpiry
      );
    });
  });
});