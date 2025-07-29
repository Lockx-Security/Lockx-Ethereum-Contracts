const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('🎯 PERFECT COVERAGE FINAL - Hit Last 4 Statements + 6 Lines', () => {
  let lockx, mockToken, mockRouter, owner, user1, lockboxKeyPair;
  
  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    
    // Deploy main contract
    const LockxContract = await ethers.getContractFactory('Lockx');
    lockx = await LockxContract.deploy();
    
    // Deploy mock ERC20
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('Mock Token', 'MTK');
    
    // Deploy mock router for swaps
    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();
    
    lockboxKeyPair = ethers.Wallet.createRandom();
    
    // Fund accounts
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    
    // Fund router with ETH for ETH output swaps
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('10')
    });
  });

  describe('🎯 MISSING STATEMENTS - Deposits.sol (2 statements)', () => {
    it('🎯 Hit idx == 0 return statements in array removal functions', async () => {
      // Create lockbox first
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      
      // These calls will attempt to remove tokens that don't exist (idx == 0)
      // This will hit the return statements in _removeERC20Token and _removeNFTKey
      
      // The removal functions are called internally when balances go to 0
      // Let's create scenarios where they try to remove non-existent items
      
      // First, let's add a token and then remove it completely to trigger array cleanup
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('100'), ethers.ZeroHash);
      
      // Now withdraw ALL of it to trigger removal
      const domain = {
        name: 'Lockx',
        version: '2',
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

      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('100'), user1.address, ethers.ZeroHash, user1.address, futureExpiry]
      );

      const value = {
        tokenId: tokenId,
        nonce: 1,
        opType: 2, // WITHDRAW_ERC20
        dataHash: ethers.keccak256(withdrawData)
      };

      const signature = await lockboxKeyPair.signTypedData(domain, types, value);
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value);

      // This should trigger the removal logic and hit the missing return statements
      await lockx.connect(user1).withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        user1.address,
        ethers.ZeroHash,
        futureExpiry
      );
    });
  });

  describe('🎯 MISSING STATEMENTS - Withdrawals.sol (2 statements)', () => {
    it('🎯 Hit swap to ETH with external recipient (lines 520-521)', async () => {
      // Create lockbox with tokens
      await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('200'));
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('200'),
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
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

      // Create swap: TOKEN → ETH with external recipient
      // This will hit lines 520-521 (ETH transfer to recipient)
      const swapData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
        [
          tokenId, 
          await mockToken.getAddress(), // tokenIn
          ethers.ZeroAddress, // tokenOut (ETH)
          ethers.parseEther('100'), // amountIn
          ethers.parseEther('0.05'), // minAmountOut
          await mockRouter.getAddress(), // target
          ethers.keccak256('0x'), // data hash
          ethers.ZeroHash, // referenceId
          user1.address, // msg.sender
          futureExpiry,
          owner.address // recipient (NOT address(0) - this is key!)
        ]
      );

      const swapValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 7, // SWAP_ASSETS
        dataHash: ethers.keccak256(swapData)
      };

      const swapSignature = await lockboxKeyPair.signTypedData(domain, types, swapValue);
      const swapMessageHash = ethers.TypedDataEncoder.hash(domain, types, swapValue);

      // Execute swap: Token → ETH with external recipient
      // This should hit the missing statements at lines 520-521
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        swapMessageHash,
        swapSignature,
        await mockToken.getAddress(), // tokenIn
        ethers.ZeroAddress, // tokenOut (ETH)
        ethers.parseEther('100'), // amountIn
        ethers.parseEther('0.05'), // minAmountOut
        await mockRouter.getAddress(), // target
        '0x', // data
        ethers.ZeroHash, // referenceId
        futureExpiry,
        owner.address // recipient (external address - this hits the missing branch!)
      );
    });
  });

  describe('🎯 MISSING LINES - Withdrawals.sol (6 lines)', () => {
    it('🎯 Hit zero address recipient validations', async () => {
      // Create lockbox with NFT
      const MockNFT = await ethers.getContractFactory('MockERC721');
      const mockNFT = await MockNFT.deploy();
      await mockNFT.initialize('Mock NFT', 'MNFT');
      await mockNFT.mint(user1.address, 1);
      
      await mockNFT.connect(user1).approve(await lockx.getAddress(), 1);
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        { value: ethers.parseEther('0.01') }
      );
      
      const tokenId = 1;
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      const domain = {
        name: 'Lockx',
        version: '2',
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

      // Test 1: withdrawERC721 with zero recipient (should hit missing line 203)
      const nftWithdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockNFT.getAddress(), 1, ethers.ZeroAddress, ethers.ZeroHash, user1.address, futureExpiry]
      );

      const nftValue = {
        tokenId: tokenId,
        nonce: 1,
        opType: 3, // WITHDRAW_NFT
        dataHash: ethers.keccak256(nftWithdrawData)
      };

      const nftSignature = await lockboxKeyPair.signTypedData(domain, types, nftValue);
      const nftMessageHash = ethers.TypedDataEncoder.hash(domain, types, nftValue);

      // This should hit the missing ZeroAddress check in withdrawERC721
      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          nftMessageHash,
          nftSignature,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroAddress, // Zero recipient - hits missing line!
          ethers.ZeroHash,
          futureExpiry
        )
      ).to.be.revertedWith('ZeroAddress()');

      // Test 2: batchWithdraw with zero recipient (should hit missing line 274)
      const batchData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'bytes32', 'address', 'uint256'],
        [tokenId, 0, [], [], [], [], ethers.ZeroHash, ethers.ZeroAddress, futureExpiry]
      );

      const batchValue = {
        tokenId: tokenId,
        nonce: 2, // Incremented
        opType: 6, // BATCH_WITHDRAW
        dataHash: ethers.keccak256(batchData)
      };

      const batchSignature = await lockboxKeyPair.signTypedData(domain, types, batchValue);
      const batchMessageHash = ethers.TypedDataEncoder.hash(domain, types, batchValue);

      // This should hit the missing ZeroAddress check in batchWithdraw
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          batchMessageHash,
          batchSignature,
          0, // amountETH
          [], // tokenAddresses
          [], // tokenAmounts
          [], // nftContracts
          [], // nftTokenIds
          ethers.ZeroAddress, // Zero recipient - hits missing line!
          ethers.ZeroHash,
          futureExpiry
        )
      ).to.be.revertedWith('ZeroAddress()');
    });

    it('🎯 Hit array length mismatch in batchWithdraw', async () => {
      // Create simple lockbox
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        { value: ethers.parseEther('1') }
      );
      
      const tokenId = 1;
      const futureExpiry = Math.floor(Date.now() / 1000) + 3600;
      
      // Test array length mismatch: nftContracts.length != nftTokenIds.length
      // This should hit the missing branch in the validation
      await expect(
        lockx.connect(user1).batchWithdraw(
          tokenId,
          ethers.ZeroHash, // Will fail earlier but that's ok
          '0x', // Will fail earlier but that's ok
          0,
          [],
          [],
          [await mockToken.getAddress()], // 1 contract
          [], // 0 token IDs - MISMATCH!
          user1.address,
          ethers.ZeroHash,
          futureExpiry
        )
      ).to.be.revertedWith('MismatchedInputs()');
    });
  });
});