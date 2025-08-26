import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

describe('🎯 PHASE 11: FINAL BREAKTHROUGH - 86.78%+ TARGET!', () => {
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

    // Setup balances
    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNFT.mint(user1.address, 1);
    await mockNFT.mint(user1.address, 2);
    await mockNFT.mint(user1.address, 3);
    await mockNFT.mint(user1.address, 4);

    // Setup approvals
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'));
    await mockNFT.connect(user1).setApprovalForAll(await lockx.getAddress(), true);
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithETH', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithERC20', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        await mockToken.getAddress(),
        ethers.parseEther('10'),
        ethers.ZeroHash
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithERC721', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in createLockboxWithBatch', async () => {
    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('0.5'), // amountETH
        [await mockToken.getAddress()], // tokenAddresses
        [ethers.parseEther('5')], // tokenAmounts
        [await mockNFT.getAddress()], // nftContracts
        [2], // nftTokenIds
        ethers.ZeroHash,
        { value: ethers.parseEther('0.5') }
      )
    ).to.emit(lockx, 'Transfer'); // ERC721 Transfer event when minting lockbox NFT
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in burnLockbox', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);

    // First withdraw all ETH from the lockbox before burning
    const withdrawSignatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
    const withdrawReferenceId = ethers.keccak256(ethers.toUtf8Bytes('withdraw_before_burn'));
    
    const withdrawDomain = {
      name: 'Lockx',
      version: '4',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await lockx.getAddress()
    };
    
    const withdrawTypes = {
      Operation: [
        { name: 'tokenId', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'opType', type: 'uint8' },
        { name: 'dataHash', type: 'bytes32' }
      ]
    };
    
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('1'), user1.address, withdrawReferenceId, user1.address, withdrawSignatureExpiry]
    );
    
    const withdrawValue = {
      tokenId: tokenId,
      nonce: 1, // First operation after creation
      opType: 1, // WITHDRAW_ETH
      dataHash: ethers.keccak256(withdrawData)
    };
    
    const withdrawSignature = await lockboxKeyPair.signTypedData(withdrawDomain, withdrawTypes, withdrawValue);
    const withdrawMessageHash = ethers.TypedDataEncoder.hash(withdrawDomain, withdrawTypes, withdrawValue);

    // Withdraw all ETH
    await lockx.connect(user1).withdrawETH(
      tokenId,
      withdrawMessageHash,
      withdrawSignature,
      ethers.parseEther('1'),
      user1.address,
      withdrawReferenceId,
      withdrawSignatureExpiry
    );

    // Create proper TypedData signature for burnLockbox
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
    const referenceId = ethers.ZeroHash;
    
    const domain = {
      name: 'Lockx',
      version: '4',
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
    
    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, referenceId, user1.address, signatureExpiry]
    );
    
    const burnValue = {
      tokenId: tokenId,
      nonce: await lockx.connect(user1).getNonce(tokenId),
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, burnValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, burnValue);

    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).burnLockbox(
        tokenId,
        messageHash,
        signature,
        referenceId,
        signatureExpiry
      )
    ).to.emit(lockx, 'LockboxBurned'); // Should succeed with proper signature
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in rotateLockboxKey', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);

    // Create proper TypedData signature for rotateLockboxKey
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
    const referenceId = ethers.ZeroHash;
    
    const domain = {
      name: 'Lockx',
      version: '4',
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
    
    const rotateData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, user2.address, referenceId, user1.address, signatureExpiry]
    );
    
    const rotateValue = {
      tokenId: tokenId,
      nonce: await lockx.connect(user1).getNonce(tokenId),
      opType: 0, // ROTATE_KEY
      dataHash: ethers.keccak256(rotateData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, rotateValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, rotateValue);

    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).rotateLockboxKey(
        tokenId,
        messageHash,
        signature,
        user2.address, // new key
        referenceId,
        signatureExpiry
      )
    ).to.emit(lockx, 'KeyRotated'); // Should succeed with proper signature
  });

  it('🎯 BRANCH: Hit successful ReentrancyGuard path in setTokenMetadataURI', async () => {
    // First create a lockbox
    const tx = await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      lockboxKeyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('1') }
    );

    const receipt = await tx.wait();
    const transferEvent = receipt.logs.find(log => log.topics[0] === ethers.id('Transfer(address,address,uint256)'));
      if (!transferEvent) throw new Error('Transfer event not found');
      const tokenId = parseInt(transferEvent.topics[3], 16);

    // Create proper TypedData signature for setTokenMetadataURI
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
    const referenceId = ethers.ZeroHash;
    const metadataURI = "https://example.com/metadata.json";
    
    const domain = {
      name: 'Lockx',
      version: '4',
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
    
    const uriData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'string', 'bytes32', 'address', 'uint256'],
      [tokenId, metadataURI, referenceId, user1.address, signatureExpiry]
    );
    
    const uriValue = {
      tokenId: tokenId,
      nonce: await lockx.connect(user1).getNonce(tokenId),
      opType: 5, // SET_TOKEN_URI
      dataHash: ethers.keccak256(uriData)
    };
    
    const signature = await lockboxKeyPair.signTypedData(domain, types, uriValue);
    const messageHash = ethers.TypedDataEncoder.hash(domain, types, uriValue);

    // This should hit the "else" (successful) path of the nonReentrant modifier
    await expect(
      lockx.connect(user1).setTokenMetadataURI(
        tokenId,
        messageHash,
        signature,
        metadataURI,
        referenceId,
        signatureExpiry
      )
    ).to.emit(lockx, 'TokenMetadataURISet'); // Should succeed with proper signature
  });
});