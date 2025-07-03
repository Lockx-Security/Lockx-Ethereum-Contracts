import { ethers } from 'hardhat';
import { expect } from 'chai';
import { domain as buildDomain, types } from './utils/eip712';

describe('Complete Coverage - Push to 100%', function () {
  let lockx: any;
  let mockToken: any;
  let mockNFT: any;
  let owner: any;
  let lockboxKey: any;
  let recipient: any;
  let newKey: any;

  // Helper function for NFT withdrawal signatures
  async function signNFTWithdrawal(
    tokenId: number,
    nftContract: string,
    nftTokenId: number,
    recipientAddress: string,
    referenceId: string,
    signatureExpiry: number,
    caller: string,
    signer: any
  ) {
    const nonce = await lockx.getNonce(tokenId);
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, nftContract, nftTokenId, recipientAddress, referenceId, caller, signatureExpiry]
    );

    const dataHash = ethers.keccak256(withdrawData);
    const opStruct = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_NFT
      dataHash,
    };

    const domain = await buildDomain(await lockx.getAddress());
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
    const signature = await signer.signTypedData(domain, types, opStruct);
    return { messageHash, signature };
  }

  beforeEach(async function () {
    [owner, lockboxKey, recipient, newKey] = await ethers.getSigners();

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();
    await lockx.waitForDeployment();

    const ERC20Factory = await ethers.getContractFactory('MockERC20');
    mockToken = await ERC20Factory.deploy();
    await mockToken.waitForDeployment();

    const ERC721Factory = await ethers.getContractFactory('MockERC721');
    mockNFT = await ERC721Factory.deploy();
    await mockNFT.waitForDeployment();

    // Mint test tokens
    await mockToken.mint(owner.address, ethers.parseEther('1000'));
    await mockNFT.mint(owner.address, 2);
    await mockNFT.mint(owner.address, 3);
    await mockNFT.mint(owner.address, 4);
    await mockNFT.mint(owner.address, 5);
  });

  describe('Withdrawals.sol Lines 459-461 - NFT Counting with Withdrawn NFTs', function () {
    it('should hit NFT counting logic in getFullLockbox with withdrawn NFTs', async function () {
      // Create lockbox with multiple NFTs
      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test1')
      );

      const tokenId = 0;

      // Add more NFTs
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        3,
        ethers.encodeBytes32String('test2')
      );

      await mockNFT.approve(await lockx.getAddress(), 4);
      await lockx.depositERC721(
        tokenId,
        await mockNFT.getAddress(),
        4,
        ethers.encodeBytes32String('test3')
      );

      // Now withdraw one NFT to create a "gap" in the known NFTs
      const referenceId = ethers.encodeBytes32String('withdraw-nft-ref');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      const { messageHash, signature } = await signNFTWithdrawal(
        tokenId,
        await mockNFT.getAddress(),
        3,
        owner.address,
        referenceId,
        signatureExpiry,
        owner.address,
        lockboxKey
      );

      // Withdraw NFT #3
      await lockx.withdrawERC721(
        tokenId,
        messageHash,
        signature,
        await mockNFT.getAddress(),
        3,
        owner.address,
        referenceId,
        signatureExpiry
      );

      // Now call getFullLockbox - this should hit lines 459-461 with the counting logic
      // because some NFTs are withdrawn (_nftKnown[tokenId][nftList[i]] == false)
      const lockboxData = await lockx.getFullLockbox(tokenId);
      
      // Should have 2 NFTs (2 and 4), not 3 (because 3 was withdrawn)
      expect(lockboxData.nftContracts.length).to.equal(2);
      
      // Verify the right NFTs remain
      const nftIds = lockboxData.nftContracts.map((nft: any) => Number(nft.nftTokenId));
      expect(nftIds).to.include(2);
      expect(nftIds).to.include(4);
      expect(nftIds).to.not.include(3);
    });
  });

  describe('Deposits.sol Line 94 - Zero Amount Received', function () {
    it('should hit zero amount received revert in fee-on-transfer scenario', async function () {
      // Deploy a mock fee-on-transfer token that takes 100% fees
      const FeeTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
      const feeToken = await FeeTokenFactory.deploy() as any;
      
      // Set 100% fee
      await feeToken.setFeePercentage(100);
      
      // Mint tokens to owner
      await feeToken.mint(owner.address, ethers.parseEther('100'));
      
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Approve the token for transfer
      await feeToken.approve(await lockx.getAddress(), ethers.parseEther('50'));

      // This should revert with ZeroAmount because the token takes 100% fees
      // so the contract receives 0 tokens, triggering line 94
      await expect(
        lockx.depositERC20(
          tokenId,
          await feeToken.getAddress(),
          ethers.parseEther('50'),
          ethers.encodeBytes32String('fee-test')
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
    });
  });

  describe('Deposits.sol Lines 167-168 - Batch Deposit ERC20 Loop', function () {
    it('should hit batch deposit ERC20 loop logic', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;

      // Create multiple ERC20 tokens
      const ERC20Factory = await ethers.getContractFactory('MockERC20');
      const token1 = await ERC20Factory.deploy();
      const token2 = await ERC20Factory.deploy();
      const token3 = await ERC20Factory.deploy();

      // Mint tokens
      await token1.mint(owner.address, ethers.parseEther('100'));
      await token2.mint(owner.address, ethers.parseEther('200'));
      await token3.mint(owner.address, ethers.parseEther('300'));

      // Approve tokens
      await token1.approve(await lockx.getAddress(), ethers.parseEther('50'));
      await token2.approve(await lockx.getAddress(), ethers.parseEther('100'));
      await token3.approve(await lockx.getAddress(), ethers.parseEther('150'));

      // Perform batch deposit with multiple ERC20s - this hits lines 167-168
      await lockx.batchDeposit(
        tokenId,
        0, // no ETH
        [await token1.getAddress(), await token2.getAddress(), await token3.getAddress()],
        [ethers.parseEther('50'), ethers.parseEther('100'), ethers.parseEther('150')],
        [], // no NFTs
        [],
        ethers.encodeBytes32String('batch-ref')
      );

      // Verify the deposits worked
      const lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.erc20Tokens.length).to.equal(3);
      
      // Verify token balances
      const token1Address = await token1.getAddress();
      const token1Balance = lockboxData.erc20Tokens.find(
        (t: any) => t.tokenAddress === token1Address
      );
      expect(token1Balance.balance).to.equal(ethers.parseEther('50'));
    });
  });

  describe('SignatureVerification.sol Line 80 - Key Rotation with Non-Zero Address', function () {
    it('should hit key rotation logic with non-zero new key', async function () {
      // Create lockbox
      await lockx.createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        ethers.encodeBytes32String('test'),
        { value: ethers.parseEther('1') }
      );

      const tokenId = 0;
      const nonce = await lockx.getNonce(tokenId);
      const referenceId = ethers.encodeBytes32String('rotate-key-ref');
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      // Create rotation data
      const rotationData = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [tokenId, newKey.address, referenceId, owner.address, signatureExpiry]
      );

      const dataHash = ethers.keccak256(rotationData);
      const opStruct = {
        tokenId,
        nonce,
        opType: 0, // ROTATE_KEY
        dataHash,
      };

      const domain = await buildDomain(await lockx.getAddress());
      const messageHash = ethers.TypedDataEncoder.hash(domain, types, opStruct);
      const signature = await lockboxKey.signTypedData(domain, types, opStruct);

      // Perform key rotation - this should hit line 80 with the new key assignment
      await lockx.rotateLockboxKey(
        tokenId,
        messageHash,
        signature,
        newKey.address, // non-zero address
        referenceId,
        signatureExpiry
      );

      // Verify the key was rotated
      const activeKey = await lockx.getActiveLockboxPublicKeyForToken(tokenId);
      expect(activeKey).to.equal(newKey.address);
    });
  });

  describe('Additional Coverage - Edge Cases', function () {
    it('should handle multiple NFT withdrawals and getFullLockbox calls', async function () {
      // Create lockbox with multiple NFTs
      await mockNFT.approve(await lockx.getAddress(), 2);
      await lockx.createLockboxWithERC721(
        owner.address,
        lockboxKey.address,
        await mockNFT.getAddress(),
        2,
        ethers.encodeBytes32String('test1')
      );

      const tokenId = 0;

      // Add more NFTs to create a larger array
      await mockNFT.approve(await lockx.getAddress(), 3);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 3, ethers.encodeBytes32String('test2'));

      await mockNFT.approve(await lockx.getAddress(), 4);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 4, ethers.encodeBytes32String('test3'));

      await mockNFT.approve(await lockx.getAddress(), 5);
      await lockx.depositERC721(tokenId, await mockNFT.getAddress(), 5, ethers.encodeBytes32String('test4'));

      // Withdraw NFTs 3 and 5 to create gaps
      let nonce = await lockx.getNonce(tokenId);
      let referenceId = ethers.encodeBytes32String('withdraw-nft-3');
      let signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      // Withdraw NFT 3
      let { messageHash, signature } = await signNFTWithdrawal(
        tokenId,
        await mockNFT.getAddress(),
        3,
        owner.address,
        referenceId,
        signatureExpiry,
        owner.address,
        lockboxKey
      );

      await lockx.withdrawERC721(
        tokenId,
        messageHash,
        signature,
        await mockNFT.getAddress(),
        3,
        owner.address,
        referenceId,
        signatureExpiry
      );

      // Call getFullLockbox multiple times to ensure we hit the counting logic
      let lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(3);

      // Withdraw NFT 5 
      referenceId = ethers.encodeBytes32String('withdraw-nft-5');
      signatureExpiry = Math.floor(Date.now() / 1000) + 3600;

      ({ messageHash, signature } = await signNFTWithdrawal(
        tokenId,
        await mockNFT.getAddress(),
        5,
        owner.address,
        referenceId,
        signatureExpiry,
        owner.address,
        lockboxKey
      ));

      await lockx.withdrawERC721(
        tokenId,
        messageHash,
        signature,
        await mockNFT.getAddress(),
        5,
        owner.address,
        referenceId,
        signatureExpiry
      );

      // Final getFullLockbox call - should hit the counting logic extensively
      lockboxData = await lockx.getFullLockbox(tokenId);
      expect(lockboxData.nftContracts.length).to.equal(2);
      
      // Should have NFTs 2 and 4
      const nftIds = lockboxData.nftContracts.map((nft: any) => Number(nft.nftTokenId));
      expect(nftIds).to.include(2);
      expect(nftIds).to.include(4);
    });
  });
}); 