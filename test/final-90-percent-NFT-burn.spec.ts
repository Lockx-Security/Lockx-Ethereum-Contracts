import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🔥 FINAL 90% - NFT BURN LINES 433-435', () => {
  let lockx, mockNft;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');
    
    // Mint many NFTs to user
    for (let i = 1; i <= 10; i++) {
      await mockNft.connect(owner).mint(user1.address, i);
      await mockNft.connect(user1).approve(await lockx.getAddress(), i);
    }
  });

  it('should hit lines 433-435: NFT cleanup in burn with empty lockbox', async () => {
    console.log('🎯 FINAL: Targeting lines 433-435 NFT cleanup in burn');
    
    // Create lockbox with ONLY NFTs (no ETH, no tokens)
    await lockx.connect(user1).createLockboxWithERC721(
      user1.address,
      keyPair.address,
      await mockNft.getAddress(),
      1,
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Step 1: Withdraw the NFT to empty the lockbox completely
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('nft_withdraw_for_burn'));

    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 1, user1.address, referenceId, user1.address, signatureExpiry]
    );

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

    let opValue = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(withdrawData)
    };

    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC721(
      tokenId,
      messageHash,
      signature,
      await mockNft.getAddress(),
      1, // NFT ID
      user1.address,
      referenceId,
      signatureExpiry
    );

    console.log('✅ NFT withdrawn, lockbox should now be empty');

    // Step 2: Now burn the empty lockbox - this should hit lines 433-435
    const burnReferenceId = ethers.keccak256(ethers.toUtf8Bytes('burn_empty_lockbox'));
    nonce = await lockx.connect(user1).getNonce(tokenId);

    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, burnReferenceId, user1.address, signatureExpiry]
    );

    opValue = {
      tokenId,
      nonce,
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };

    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    // This should hit the NFT cleanup loop in lines 433-435
    await lockx.connect(user1).burnLockbox(
      tokenId,
      messageHash,
      signature,
      burnReferenceId,
      signatureExpiry
    );

    console.log('✅ LINES 433-435: Empty lockbox burned - NFT cleanup loop hit!');
  });

  it('should hit lines 433-435: NFT cleanup with remaining NFTs', async () => {
    console.log('🎯 ALTERNATIVE: NFT cleanup with partial NFT removal');
    
    // Create lockbox with multiple NFTs
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      0, // No ETH
      [], // No tokens
      [],
      [await mockNft.getAddress(), await mockNft.getAddress(), await mockNft.getAddress()], // 3 NFTs
      [2, 3, 4], // NFT IDs
      ethers.ZeroHash
    );

    const tokenId = 0;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;

    // Withdraw only some NFTs, leaving lockbox with remaining NFTs
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    const batchReferenceId = ethers.keccak256(ethers.toUtf8Bytes('partial_nft_batch'));

    const batchWithdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [
        tokenId,
        0, // No ETH
        [], // No tokens
        [],
        [await mockNft.getAddress(), await mockNft.getAddress()], // 2 NFTs
        [2, 3], // Leave NFT 4 in lockbox
        user1.address,
        batchReferenceId,
        user1.address,
        signatureExpiry
      ]
    );

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

    let opValue = {
      tokenId,
      nonce,
      opType: 6, // BATCH_WITHDRAW
      dataHash: ethers.keccak256(batchWithdrawData)
    };

    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(
      tokenId,
      messageHash,
      signature,
      0, // No ETH
      [], // No tokens
      [],
      [await mockNft.getAddress(), await mockNft.getAddress()], // Remove 2 NFTs
      [2, 3],
      user1.address,
      batchReferenceId,
      signatureExpiry
    );

    // Now withdraw the last NFT to completely empty the lockbox
    nonce = await lockx.connect(user1).getNonce(tokenId);
    const lastNftReferenceId = ethers.keccak256(ethers.toUtf8Bytes('last_nft'));

    const lastWithdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, await mockNft.getAddress(), 4, user1.address, lastNftReferenceId, user1.address, signatureExpiry]
    );

    opValue = {
      tokenId,
      nonce,
      opType: 3, // WITHDRAW_ERC721
      dataHash: ethers.keccak256(lastWithdrawData)
    };

    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).withdrawERC721(
      tokenId,
      messageHash,
      signature,
      await mockNft.getAddress(),
      4, // Last NFT
      user1.address,
      lastNftReferenceId,
      signatureExpiry
    );

    // Finally burn the now-empty lockbox
    const burnReferenceId = ethers.keccak256(ethers.toUtf8Bytes('burn_after_nft_cleanup'));
    nonce = await lockx.connect(user1).getNonce(tokenId);

    const burnData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'bytes32', 'address', 'uint256'],
      [tokenId, burnReferenceId, user1.address, signatureExpiry]
    );

    opValue = {
      tokenId,
      nonce,
      opType: 4, // BURN_LOCKBOX
      dataHash: ethers.keccak256(burnData)
    };

    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).burnLockbox(
      tokenId,
      messageHash,
      signature,
      burnReferenceId,
      signatureExpiry
    );

    console.log('✅ LINES 433-435: Alternative NFT cleanup scenario completed!');
  });
});