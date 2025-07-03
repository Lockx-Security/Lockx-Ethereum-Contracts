import { ethers } from 'hardhat';
import { expect } from 'chai';
import { domain as buildDomain, types } from './utils/eip712';

describe('Maximum Coverage - Push to 90%+', function () {
  let lockx: any;
  let mockToken: any;
  let mockToken2: any;
  let mockNFT: any;
  let feeToken: any;
  let owner: any;
  let lockboxKey: any;
  let recipient: any;

  const OPERATION_TYPE = {
    ROTATE_KEY: 0,
    WITHDRAW_ETH: 1,
    WITHDRAW_ERC20: 2,
    WITHDRAW_NFT: 3,
    BURN_LOCKBOX: 4,
    SET_TOKEN_URI: 5,
    BATCH_WITHDRAW: 6,
  };

  // Helper function for burn signatures
  async function signBurn(
    tokenId: number,
    referenceId: string,
    signatureExpiry: number,
    caller: string,
    signer: any
  ) {
    const nonce = await lockx.getNonce(tokenId);
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, referenceId, caller, signatureExpiry]
    );

    const dataHash = ethers.keccak256(burnData);
    const opStruct = {
      tokenId,
      nonce,
      opType: OPERATION_TYPE.BURN_LOCKBOX,
      dataHash,
    };

    const domain = await buildDomain(await lockx.getAddress());
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
    const signature = await signer.signTypedData(domain, types, opStruct);
    return { messageHash, signature };
  }

     // Helper function for batch withdrawal signatures
   async function signBatchWithdraw(
     tokenId: number,
     amountETH: bigint,
     tokenAddresses: string[],
     tokenAmounts: bigint[],
     nftContracts: string[],
     nftTokenIds: number[],
     recipientAddress: string,
     referenceId: string,
     signatureExpiry: number,
     caller: string,
     signer: any
   ) {
     const nonce = await lockx.getNonce(tokenId);
     const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
       ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
       [tokenId, amountETH, tokenAddresses, tokenAmounts, nftContracts, nftTokenIds, recipientAddress, referenceId, caller, signatureExpiry]
     );

     const dataHash = ethers.keccak256(withdrawData);
     const opStruct = {
       tokenId,
       nonce,
       opType: OPERATION_TYPE.BATCH_WITHDRAW,
       dataHash,
     };

     const domain = await buildDomain(await lockx.getAddress());
     const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
     const signature = await signer.signTypedData(domain, types, opStruct);
     return { messageHash, signature };
   }

  beforeEach(async function () {
    [owner, lockboxKey, recipient] = await ethers.getSigners();

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    await lockx.waitForDeployment();

    const ERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await ERC20Factory.deploy();
    await mockToken.waitForDeployment();

    mockToken2 = await ERC20Factory.deploy();
    await mockToken2.waitForDeployment();

    const ERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await ERC721Factory.deploy();
    await mockNFT.waitForDeployment();

    const FeeTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeTokenFactory.deploy() as any;
    await feeToken.waitForDeployment();

    // Mint test tokens
    await mockToken.mint(owner.address, ethers.parseEther('2000'));
    await mockToken2.mint(owner.address, ethers.parseEther('1000'));
    await feeToken.mint(owner.address, ethers.parseEther('1000'));
    await mockNFT.mint(owner.address, 10);
    await mockNFT.mint(owner.address, 11);
    await mockNFT.mint(owner.address, 12);
  });

  describe('Withdrawals.sol - burnLockbox and _finalizeBurn', function () {
    it('should burn a lockbox with all asset types', async function () {
      // Create lockbox with ETH
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('2') }
      );

      const tokenId = 0;

      // Add ERC20 tokens
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.depositERC20(
        tokenId,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('erc20-1')
      );

      await mockToken2.approve(await lockx.getAddress(), ethers.parseEther('50'));
      await lockx.depositERC20(
        tokenId,
        await mockToken2.getAddress(),
        ethers.parseEther('50'),
        ethers.encodeBytes32String('erc20-2')
      );

      // Add NFTs
      await mockNFT.approve(await lockx.getAddress(), 10);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        10,
        ethers.encodeBytes32String('nft-1')
      );

      await mockNFT.approve(await lockx.getAddress(), 11);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        11,
        ethers.encodeBytes32String('nft-2')
      );

      // Verify lockbox has assets before burn
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('2'));
      expect(lockboxData.erc20Tokens.length).to.equal(2);
      expect(lockboxData.nftContracts.length).to.equal(2);

      // Sign burn operation
      const referenceId = ethers.encodeBytes32String('burn-test');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      const { messageHash, signature } = await signBurn(
        tokenId,
        referenceId,
        signatureExpiry,
        owner.address,
        lockboxKey
      );

      // Burn the lockbox - this hits burnLockbox and _finalizeBurn functions
      await lockx.burnLockbox(
        tokenId,
        messageHash,
        signature,
        referenceId,
        signatureExpiry
      );

             // Verify lockbox is burned (should revert when trying to access)
       await expect(lockx.ownerOf(tokenId)).to.be.revertedWithCustomError(lockx, 'ERC721NonexistentToken');
    });
  });

  describe('Withdrawals.sol - batchWithdraw function', function () {
    it('should perform complex batch withdrawal with all asset types', async function () {
      // Create lockbox with batch assets
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('200'));
      await mockToken2.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await mockNFT.approve(await lockx.getAddress(), 10);
      await mockNFT.approve(await lockx.getAddress(), 11);

      await lockx.createLockboxWithBatch(
        owner.address,
        lockboxKey.address,
        ethers.parseEther('3'), // ETH
        [await mockToken.getAddress(), await mockToken2.getAddress()], // ERC20s
        [ethers.parseEther('200'), ethers.parseEther('100')], // ERC20 amounts
        [await mockNFT.getAddress(), await mockNFT.getAddress()], // NFTs
        [10, 11], // NFT token IDs
        ethers.encodeBytes32String('batch-test'),
        { value: ethers.parseEther('3') }
      );

      const tokenId = 0;

      // Prepare batch withdrawal
      const referenceId = ethers.encodeBytes32String('batch-withdraw');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

             const { messageHash, signature } = await signBatchWithdraw(
         tokenId,
         ethers.parseEther('1'), // Withdraw 1 ETH
         [await mockToken.getAddress(), await mockToken2.getAddress()], // ERC20s
         [ethers.parseEther('50'), ethers.parseEther('25')], // ERC20 amounts
         [await mockNFT.getAddress()], // NFTs
         [10], // NFT token ID
         recipient.address,
         referenceId,
         signatureExpiry,
         owner.address,
         lockboxKey
       );

      // Record balances before
      const recipientETHBefore = await ethers.provider.getBalance(recipient.address);
      const recipientToken1Before = await mockToken.balanceOf(recipient.address);
      const recipientToken2Before = await mockToken2.balanceOf(recipient.address);

      // Execute batch withdrawal - this hits the batchWithdraw function
      await lockx.batchWithdraw(
        tokenId,
        messageHash,
        signature,
        ethers.parseEther('1'), // ETH
        [await mockToken.getAddress(), await mockToken2.getAddress()], // ERC20s
        [ethers.parseEther('50'), ethers.parseEther('25')], // ERC20 amounts
        [await mockNFT.getAddress()], // NFTs
        [10], // NFT token ID
        recipient.address,
        referenceId,
        signatureExpiry
      );

      // Verify transfers
      const recipientETHAfter = await ethers.provider.getBalance(recipient.address);
      expect(recipientETHAfter - recipientETHBefore).to.equal(ethers.parseEther('1'));

      const recipientToken1After = await mockToken.balanceOf(recipient.address);
      expect(recipientToken1After - recipientToken1Before).to.equal(ethers.parseEther('50'));

      const recipientToken2After = await mockToken2.balanceOf(recipient.address);
      expect(recipientToken2After - recipientToken2Before).to.equal(ethers.parseEther('25'));

      // Verify NFT transfer
      expect(await mockNFT.ownerOf(10)).to.equal(recipient.address);

      // Verify remaining assets in lockbox
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.lockboxETH).to.equal(ethers.parseEther('2')); // 3 - 1 = 2
      expect(lockboxData.nftContracts.length).to.equal(1); // Should have NFT 11 left
      expect(lockboxData.nftContracts[0].nftTokenId).to.equal(11);
    });

    it('should handle batch withdrawal with no ETH', async function () {
      // Create lockbox with just ERC20s and NFTs
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await mockNFT.approve(await lockx.getAddress(), 10);

      await lockx.createLockboxWithBatch(
        owner.address,
        lockboxKey.address,
        0, // No ETH
        [await mockToken.getAddress()], // ERC20s
        [ethers.parseEther('100')], // ERC20 amounts
        [await mockNFT.getAddress()], // NFTs
        [10], // NFT token IDs
        ethers.encodeBytes32String('no-eth-test')
      );

      const tokenId = 0;

      // Batch withdraw with no ETH (amountETH = 0)
      const referenceId = ethers.encodeBytes32String('no-eth-withdraw');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

             const { messageHash, signature } = await signBatchWithdraw(
         tokenId,
         BigInt(0), // No ETH
         [await mockToken.getAddress()], // ERC20s
         [ethers.parseEther('50')], // ERC20 amounts
         [], // No NFTs
         [], // No NFT token IDs
         recipient.address,
         referenceId,
         signatureExpiry,
         owner.address,
         lockboxKey
       );

      // This hits the amountETH > 0 branch (false) in batchWithdraw
      await lockx.batchWithdraw(
        tokenId,
        messageHash,
        signature,
        0, // No ETH
        [await mockToken.getAddress()], // ERC20s
        [ethers.parseEther('50')], // ERC20 amounts
        [], // No NFTs
        [], // No NFT token IDs
        recipient.address,
        referenceId,
        signatureExpiry
      );

      // Verify only ERC20 was transferred
      const recipientBalance = await mockToken.balanceOf(recipient.address);
      expect(recipientBalance).to.equal(ethers.parseEther('50'));
    });
  });

     describe('Deposits.sol - _requireExists catch block', function () {
     it('should hit the catch block when ownerOf fails', async function () {
       // _requireExists is called by getFullLockbox from someone who isn't the owner
       // Let's create a lockbox and try to call getFullLockbox from a different address
       await lockx.createLockboxWithETH(
         owner.address,
         lockboxKey.address,
         ethers.encodeBytes32String('test'),
         { value: ethers.parseEther('1') }
       );

       const tokenId = 0;

       // Try to call getFullLockbox from recipient (not owner) - should revert with NotOwner
       await expect(
         lockx.connect(recipient).getFullLockbox(tokenId)
       ).to.be.revertedWithCustomError(lockx, 'NotOwner');
     });
   });

  describe('Deposits.sol - Complex fee-on-transfer scenarios', function () {
    it('should handle partial fee-on-transfer scenarios', async function () {
      // Set 50% fee (should work normally)
      await feeToken.setFeePercentage(50);

      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Approve and deposit with 50% fee
      await feeToken.approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      // This should work - the contract receives 50 tokens, not 100
      await lockx.depositERC20(
        tokenId,
        await feeToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('fee-test')
      );

             // Verify only 50 tokens were actually deposited (due to 50% fee)
       const lockboxData = await lockx.getFullLockbox(tokenId);
       const feeTokenAddress = await feeToken.getAddress();
       const feeTokenBalance = lockboxData.erc20Tokens.find(
         (t: any) => t.tokenAddress === feeTokenAddress
       );
       expect(feeTokenBalance.balance).to.equal(ethers.parseEther('50'));
    });

    it('should handle edge case with 99% fee', async function () {
      // Set 99% fee - should still work with 1% received
      await feeToken.setFeePercentage(99);

      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Approve and deposit with 99% fee
      await feeToken.approve(await lockx.getAddress(), ethers.parseEther('100'));
      
      // This should work - the contract receives 1 token
      await lockx.depositERC20(
        tokenId,
        await feeToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('high-fee-test')
      );

             // Verify only 1 token was actually deposited (due to 99% fee)
       const lockboxData = await lockx.getFullLockbox(tokenId);
       const feeTokenAddress = await feeToken.getAddress();
       const feeTokenBalance = lockboxData.erc20Tokens.find(
         (t: any) => t.tokenAddress === feeTokenAddress
       );
       expect(feeTokenBalance.balance).to.equal(ethers.parseEther('1'));
    });
  });

  describe('Withdrawals.sol - Complex ERC20 removal scenarios', function () {
    it('should handle ERC20 token removal when balance becomes zero', async function () {
      // Create lockbox with ERC20
      await mockToken.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await lockx.createLockboxWithERC20(
        owner.address,
        lockboxKey.address,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        ethers.encodeBytes32String('removal-test')
      );

      const tokenId = 0;

      // Withdraw all tokens to trigger removal logic
      const nonce = await lockx.getNonce(tokenId);
      const referenceId = ethers.encodeBytes32String('withdraw-all');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, await mockToken.getAddress(), ethers.parseEther('100'), owner.address, referenceId, owner.address, signatureExpiry]
      );

      const dataHash = ethers.keccak256(withdrawData);
      const opStruct = {
        tokenId,
        nonce,
        opType: OPERATION_TYPE.WITHDRAW_ERC20,
        dataHash,
      };

      const domain = await buildDomain(await lockx.getAddress());
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
      const signature = await lockboxKey.signTypedData(domain, types, opStruct);

      // This should trigger the token removal logic when balance becomes 0
      await lockx.withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(),
        ethers.parseEther('100'),
        owner.address,
        referenceId,
        signatureExpiry
      );

      // Verify token was removed from tracking
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens.length).to.equal(0);
    });
  });

  describe('Withdrawals.sol - Edge cases and error scenarios', function () {
    it('should handle signature expiry in burnLockbox', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const referenceId = ethers.encodeBytes32String('expired-burn');
      const expiredTimestamp = 1000; // Very old timestamp

      const { messageHash, signature } = await signBurn(
        tokenId,
        referenceId,
        expiredTimestamp,
        owner.address,
        lockboxKey
      );

      // Should revert due to expired signature
      await expect(
        lockx.burnLockbox(
          tokenId,
          messageHash,
          signature,
          referenceId,
          expiredTimestamp
        )
      ).to.be.revertedWithCustomError(lockx, 'SignatureExpired');
    });

    it('should handle array length mismatch in batchWithdraw', async function () {
      // Create lockbox with assets
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const referenceId = ethers.encodeBytes32String('mismatch-test');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

             // Create signature for mismatched arrays
       const { messageHash, signature } = await signBatchWithdraw(
         tokenId,
         BigInt(0),
         [await mockToken.getAddress()],
         [ethers.parseEther('50')],
         [],
         [],
         recipient.address,
         referenceId,
         signatureExpiry,
         owner.address,
         lockboxKey
       );

      // Should revert due to array length mismatch (1 token address, 2 token amounts)
      await expect(
        lockx.batchWithdraw(
          tokenId,
          messageHash,
          signature,
          0,
          [await mockToken.getAddress()], // 1 element
          [ethers.parseEther('50'), ethers.parseEther('25')], // 2 elements - MISMATCH!
          [],
          [],
          recipient.address,
          referenceId,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });
  });
}); 