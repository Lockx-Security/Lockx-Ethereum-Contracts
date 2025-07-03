import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';

describe('Precision Coverage - Push to 90%+', function () {
  let lockx: Lockx;
  let mockERC20: MockERC20;
  let mockERC20_2: MockERC20;
  let mockERC721: MockERC721;
  let owner: any;
  let lockboxKey: any;
  let newKey: any;

  beforeEach(async function () {
    [owner, lockboxKey, newKey] = await ethers.getSigners();
    
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockERC20 = await MockERC20Factory.deploy();
    mockERC20_2 = await MockERC20Factory.deploy();

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockERC721 = await MockERC721Factory.deploy();

    await mockERC20.mint(owner.address, ethers.parseEther('1000'));
    await mockERC20_2.mint(owner.address, ethers.parseEther('1000'));
  });

  async function createSignature(tokenId: number, opType: number, data: string, signer: any) {
    const domain = {
      name: 'Lockx',
      version: '2',
      chainId: (await ethers.provider.getNetwork()).chainId,
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

    const nonce = await lockx.connect(owner).getNonce(tokenId);
    const operation = {
      tokenId: tokenId,
      nonce: nonce,
      opType: opType,
      dataHash: ethers.keccak256(data)
    };

    const signature = await signer.signTypedData(domain, types, operation);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, operation);
    
    return { signature, messageHash };
  }

  describe('Deposits.sol Lines 276-278 - ERC20 Array Swapping', function () {
    it('should trigger ERC20 token removal with array element swapping', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('swap-test'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

             // Add THREE ERC20 tokens to create scenario where middle token gets removed
       await mockERC20.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('200'));
       await mockERC20_2.connect(owner).approve(await lockx.getAddress(), ethers.parseEther('100'));
       
       // First token
       await lockx.connect(owner).depositERC20(
         0,
         await mockERC20.getAddress(),
         ethers.parseEther('100'),
         referenceId
       );
       
       // Second token 
       await lockx.connect(owner).depositERC20(
         0,
         await mockERC20_2.getAddress(),
         ethers.parseEther('100'),
         referenceId
       );

       // Third token (same as first, to add to existing balance)
       await lockx.connect(owner).depositERC20(
         0,
         await mockERC20.getAddress(),
         ethers.parseEther('50'),
         referenceId
       );

      // Now withdraw the FIRST token completely - this will trigger array swapping
      // because it's not the last element in the array
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
             const data = ethers.AbiCoder.defaultAbiCoder().encode(
         ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
         [0, await mockERC20.getAddress(), ethers.parseEther('150'), owner.address, referenceId, owner.address, signatureExpiry]
       );

      const { signature, messageHash } = await createSignature(0, 2, data, lockboxKey);

      // This should hit lines 276-278 in Deposits.sol (array swapping logic)
      await lockx.connect(owner).withdrawERC20(
        0,
        messageHash,
        signature,
        await mockERC20.getAddress(),
        ethers.parseEther('150'),
        owner.address,
        referenceId,
        signatureExpiry
      );

      // Verify the array was properly managed
      const [, erc20s,] = await lockx.connect(owner).getFullLockbox(0);
      expect(erc20s.length).to.equal(1); // Only mockERC20_2 should remain
      expect(erc20s[0].tokenAddress).to.equal(await mockERC20_2.getAddress());
    });
  });

  describe('Lockx.sol Lines 318,320,322 - Interface Support', function () {
    it('should test ERC5192 interface support', async function () {
      // Test ERC5192 (soulbound) interface - line 318
      const erc5192InterfaceId = '0xb45a3c0e'; // ERC5192 interface ID
      expect(await lockx.supportsInterface(erc5192InterfaceId)).to.equal(true);
    });

    it('should test IERC721Receiver interface support', async function () {
      // Test IERC721Receiver interface - line 320
      const erc721ReceiverInterfaceId = '0x150b7a02'; // IERC721Receiver interface ID
      expect(await lockx.supportsInterface(erc721ReceiverInterfaceId)).to.equal(true);
    });

    it('should test fallback to parent supportsInterface', async function () {
      // Test fallback to super.supportsInterface - line 322
      const erc721InterfaceId = '0x80ac58cd'; // ERC721 interface ID
      expect(await lockx.supportsInterface(erc721InterfaceId)).to.equal(true);
      
      // Test unknown interface
      const unknownInterfaceId = '0x12345678';
      expect(await lockx.supportsInterface(unknownInterfaceId)).to.equal(false);
    });
  });

  describe('SignatureVerification.sol Line 80 - Key Rotation Logic', function () {
    it('should hit key rotation with non-zero address condition', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('rotation'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
      const data = ethers.AbiCoder.defaultAbiCoder().encode(
        ['uint256', 'address', 'bytes32', 'address', 'uint256'],
        [0, newKey.address, referenceId, owner.address, signatureExpiry]
      );

      const { signature, messageHash } = await createSignature(0, 0, data, lockboxKey);

      // This should hit line 80 in SignatureVerification.sol
      await lockx.connect(owner).rotateLockboxKey(
        0,
        messageHash,
        signature,
        newKey.address,
        referenceId,
        signatureExpiry
      );

      // Verify key was rotated
      expect(await lockx.connect(owner).getActiveLockboxPublicKeyForToken(0)).to.equal(newKey.address);
    });
  });

  describe('Withdrawals.sol Lines ~530-533 - NFT Array Management in getFullLockbox', function () {
    it('should test getFullLockbox with withdrawn NFTs (array gap handling)', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nft-gaps'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

      // Add multiple NFTs
      await mockERC721.connect(owner).approve(await lockx.getAddress(), 1);
      await lockx.connect(owner).depositERC721(0, await mockERC721.getAddress(), 1, referenceId);

             // Mint additional NFT for testing (use higher IDs)
       await mockERC721.mint(owner.address, 5);
       await mockERC721.connect(owner).approve(await lockx.getAddress(), 5);
       await lockx.connect(owner).depositERC721(0, await mockERC721.getAddress(), 5, referenceId);

       // Mint third NFT
       await mockERC721.mint(owner.address, 6);
       await mockERC721.connect(owner).approve(await lockx.getAddress(), 6);
       await lockx.connect(owner).depositERC721(0, await mockERC721.getAddress(), 6, referenceId);

      // Withdraw the first NFT (creates a gap in the known array)
      const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
             const data = ethers.AbiCoder.defaultAbiCoder().encode(
         ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
         [0, await mockERC721.getAddress(), 1, owner.address, referenceId, owner.address, signatureExpiry]
       );

      const { signature, messageHash } = await createSignature(0, 3, data, lockboxKey);

      await lockx.connect(owner).withdrawERC721(
        0,
        messageHash,
        signature,
        await mockERC721.getAddress(),
        1,
        owner.address,
        referenceId,
        signatureExpiry
      );

      // This should hit the counting and gap-handling logic in getFullLockbox (~lines 530-533)
      const [ethBalance, erc20s, nfts] = await lockx.connect(owner).getFullLockbox(0);
      
      expect(ethBalance).to.equal(ethers.parseEther('1'));
      expect(erc20s.length).to.equal(0);
      expect(nfts.length).to.equal(2); // Two NFTs should remain (tokens 2 and 3)
      
             // Verify the returned NFTs are correct
       const nftTokenIds = nfts.map(nft => nft.nftTokenId.toString());
       expect(nftTokenIds).to.include('5');
       expect(nftTokenIds).to.include('6');
       expect(nftTokenIds).to.not.include('1'); // Should not include withdrawn NFT
    });
  });

  describe('Additional Edge Cases for Maximum Coverage', function () {
    it('should test batch withdrawal array length validation', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('batch-edge'));
      
      // Create lockbox with assets
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('2') }
      );

      // Test batch withdrawal with mismatched arrays
      await expect(
        lockx.connect(owner).batchWithdraw(
          0,
          ethers.ZeroHash,
          '0x',
          0,
          [await mockERC20.getAddress()], // 1 token
          [], // 0 amounts - mismatch
          [],
          [],
          owner.address,
          referenceId,
          Math.floor(Date.now() / 1000) + 3600
        )
      ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
    });

    it('should test NFT removal from middle of array', async function () {
      const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nft-middle'));
      
      // Create lockbox
      await lockx.connect(owner).createLockboxWithETH(
        owner.address,
        lockboxKey.address,
        referenceId,
        { value: ethers.parseEther('1') }
      );

             // Add 3 NFTs (use higher IDs to avoid conflicts)
       for (let i = 10; i <= 12; i++) {
         await mockERC721.mint(owner.address, i);
         await mockERC721.connect(owner).approve(await lockx.getAddress(), i);
         await lockx.connect(owner).depositERC721(0, await mockERC721.getAddress(), i, referenceId);
       }

             // Withdraw the middle NFT (token 11) to trigger array swapping in _removeNFTKey
       const signatureExpiry = Math.floor(Date.now() / 1000) + 3600;
       const data = ethers.AbiCoder.defaultAbiCoder().encode(
         ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
         [0, await mockERC721.getAddress(), 11, owner.address, referenceId, owner.address, signatureExpiry]
       );

      const { signature, messageHash } = await createSignature(0, 3, data, lockboxKey);

             await lockx.connect(owner).withdrawERC721(
         0,
         messageHash,
         signature,
         await mockERC721.getAddress(),
         11,
         owner.address,
         referenceId,
         signatureExpiry
       );

       // Verify remaining NFTs
       const [, , nfts] = await lockx.connect(owner).getFullLockbox(0);
       expect(nfts.length).to.equal(2);
       
       const nftTokenIds = nfts.map(nft => nft.nftTokenId.toString());
       expect(nftTokenIds).to.include('10');
       expect(nftTokenIds).to.include('12');
       expect(nftTokenIds).to.not.include('11');
    });
  });
}); 