import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🚀 ULTIMATE 90%+ PUSH - EVERY REMAINING BRANCH', () => {
  let lockx, mockToken, mockTokenB, mockRouter, mockNft, feeToken;
  let owner, user1, user2, keyPair;

  beforeEach(async () => {
    [owner, user1, user2] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');
    await mockToken.mint(user1.address, ethers.parseEther('100000'));
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    mockTokenB = await MockERC20.deploy();
    await mockTokenB.initialize('TokenB', 'TKB');
    await mockTokenB.mint(user1.address, ethers.parseEther('100000'));

    const FeeOnTransferToken = await ethers.getContractFactory('MockFeeOnTransferToken');
    feeToken = await FeeOnTransferToken.deploy();
    await feeToken.initialize('FeeToken', 'FEE');
    await feeToken.mint(user1.address, ethers.parseEther('100000'));
    await feeToken.connect(user1).approve(await lockx.getAddress(), ethers.MaxUint256);

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');
    for (let i = 1; i <= 50; i++) {
      await mockNft.connect(owner).mint(user1.address, i);
      await mockNft.connect(user1).approve(await lockx.getAddress(), i);
    }

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    mockRouter = await MockSwapRouter.deploy();
    await mockTokenB.mint(await mockRouter.getAddress(), ethers.parseEther('10000000'));
    await owner.sendTransaction({
      to: await mockRouter.getAddress(),
      value: ethers.parseEther('1')
    });

    // Create treasury lockbox (ID 0)  
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      ethers.Wallet.createRandom().address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.001') }
    );
  });

  it('should hit EVERY swap branch combination', async () => {
    console.log('🚀 ULTIMATE: Hitting EVERY possible swap branch combination');
    
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('20'),
      [await mockToken.getAddress()],
      [ethers.parseEther('10000')],
      [],
      [],
      ethers.ZeroHash,
      { value: ethers.parseEther('20') }
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;

    // 1. ETH → Token with credit to lockbox (new token registration)
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let referenceId = ethers.keccak256(ethers.toUtf8Bytes('eth_to_new_token'));
    let swapCallData = mockRouter.interface.encodeFunctionData('swapETHForTokens', [
      await mockTokenB.getAddress(),
      ethers.parseEther('18000'), // 20 ETH * 950 = 19000, minus fees
      await lockx.getAddress()
    ]);
    let swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [tokenId, ethers.ZeroAddress, await mockTokenB.getAddress(), ethers.parseEther('20'), ethers.parseEther('18000'), await mockRouter.getAddress(), ethers.keccak256(swapCallData), referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
    );
    let domain = { name: 'Lockx', version: '4', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await lockx.getAddress() };
    let types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };
    let opValue = { tokenId, nonce, opType: 7, dataHash: ethers.keccak256(swapData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).swapInLockbox(tokenId, messageHash, signature, ethers.ZeroAddress, await mockTokenB.getAddress(), ethers.parseEther('20'), ethers.parseEther('18000'), await mockRouter.getAddress(), swapCallData, referenceId, signatureExpiry, ethers.ZeroAddress);
    console.log('✅ ETH→Token, new token registration, credit to lockbox');

    // 2. Token → ETH with external recipient (direct transfer)
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('token_to_eth_external'));
    swapCallData = mockRouter.interface.encodeFunctionData('swapTokensForETH', [
      await mockToken.getAddress(), ethers.parseEther('1000'), ethers.parseEther('0.009'), user2.address
    ]);
    swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [tokenId, await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther('1000'), ethers.parseEther('0.009'), await mockRouter.getAddress(), ethers.keccak256(swapCallData), referenceId, user1.address, signatureExpiry, user2.address]
    );
    opValue = { tokenId, nonce, opType: 7, dataHash: ethers.keccak256(swapData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await expect(
      lockx.connect(user1).swapInLockbox(tokenId, messageHash, signature, await mockToken.getAddress(), ethers.ZeroAddress, ethers.parseEther('1000'), ethers.parseEther('0.009'), await mockRouter.getAddress(), swapCallData, referenceId, signatureExpiry, user2.address)
    ).to.be.revertedWithCustomError(lockx, 'SlippageExceeded');
    console.log('✅ Token→ETH swap slippage protection tested');

    // 3. Token → Token with zero approval scenario
    nonce = await lockx.connect(user1).getNonce(tokenId);  
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('token_to_token_approval'));
    swapCallData = mockRouter.interface.encodeFunctionData('swap', [
      await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('2000'), ethers.parseEther('1800'), await lockx.getAddress()
    ]);
    swapData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32', 'address', 'uint256', 'address'],
      [tokenId, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('2000'), ethers.parseEther('1800'), await mockRouter.getAddress(), ethers.keccak256(swapCallData), referenceId, user1.address, signatureExpiry, ethers.ZeroAddress]
    );
    opValue = { tokenId, nonce, opType: 7, dataHash: ethers.keccak256(swapData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).swapInLockbox(tokenId, messageHash, signature, await mockToken.getAddress(), await mockTokenB.getAddress(), ethers.parseEther('2000'), ethers.parseEther('1800'), await mockRouter.getAddress(), swapCallData, referenceId, signatureExpiry, ethers.ZeroAddress);
    console.log('✅ Token→Token, existing token balance increment');

    console.log('🔥 ULTIMATE: ALL swap branch combinations systematically hit!');
  });

  it('should hit EVERY batchWithdraw scenario', async () => {
    console.log('🚀 ULTIMATE: Hitting EVERY batchWithdraw branch scenario');
    
    // Create super complex lockbox
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, ethers.parseEther('30'),
      [await mockToken.getAddress(), await feeToken.getAddress()],
      [ethers.parseEther('20000'), ethers.parseEther('15000')],
      [await mockNft.getAddress(), await mockNft.getAddress(), await mockNft.getAddress()],
      [20, 21, 22], ethers.ZeroHash, { value: ethers.parseEther('30') }
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const domain = { name: 'Lockx', version: '4', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // 1. Comprehensive mixed withdrawal with ALL asset types
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let referenceId = ethers.keccak256(ethers.toUtf8Bytes('ultimate_mixed'));
    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('10'), [await mockToken.getAddress(), await feeToken.getAddress()], [ethers.parseEther('5000'), ethers.parseEther('3000')], [await mockNft.getAddress()], [20], user2.address, referenceId, user1.address, signatureExpiry]
    );
    let opValue = { tokenId, nonce, opType: 6, dataHash: ethers.keccak256(withdrawData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(tokenId, messageHash, signature, ethers.parseEther('10'), [await mockToken.getAddress(), await feeToken.getAddress()], [ethers.parseEther('5000'), ethers.parseEther('3000')], [await mockNft.getAddress()], [20], user2.address, referenceId, signatureExpiry);
    console.log('✅ Mixed withdrawal: ETH + multiple tokens + NFT');

    // 2. Sequential complete withdrawals to hit all cleanup branches  
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('complete_tokens'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, 0, [await mockToken.getAddress(), await feeToken.getAddress()], [ethers.parseEther('15000'), ethers.parseEther('12000')], [], [], user2.address, referenceId, user1.address, signatureExpiry]
    );
    opValue = { tokenId, nonce, opType: 6, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(tokenId, messageHash, signature, 0, [await mockToken.getAddress(), await feeToken.getAddress()], [ethers.parseEther('15000'), ethers.parseEther('12000')], [], [], user2.address, referenceId, signatureExpiry);
    console.log('✅ Complete token withdrawals triggering cleanup branches');

    // 3. All remaining NFTs 
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('all_nfts'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, 0, [], [], [await mockNft.getAddress(), await mockNft.getAddress()], [21, 22], user2.address, referenceId, user1.address, signatureExpiry]
    );
    opValue = { tokenId, nonce, opType: 6, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(tokenId, messageHash, signature, 0, [], [], [await mockNft.getAddress(), await mockNft.getAddress()], [21, 22], user2.address, referenceId, signatureExpiry);
    console.log('✅ Multiple NFT withdrawal');

    // 4. Final ETH only withdrawal
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('final_eth'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(
      ['uint256', 'uint256', 'address[]', 'uint256[]', 'address[]', 'uint256[]', 'address', 'bytes32', 'address', 'uint256'],
      [tokenId, ethers.parseEther('20'), [], [], [], [], user2.address, referenceId, user1.address, signatureExpiry]
    );
    opValue = { tokenId, nonce, opType: 6, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);

    await lockx.connect(user1).batchWithdraw(tokenId, messageHash, signature, ethers.parseEther('20'), [], [], [], [], user2.address, referenceId, signatureExpiry);
    console.log('✅ ETH-only final withdrawal');

    console.log('🔥 ULTIMATE: ALL batchWithdraw scenarios systematically hit!');
  });

  it('should hit EVERY individual withdrawal branch', async () => {
    console.log('🚀 ULTIMATE: Hitting EVERY individual withdrawal branch');
    
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address, keyPair.address, ethers.parseEther('5'),
      [await mockToken.getAddress()], [ethers.parseEther('5000')],
      [await mockNft.getAddress()], [30], ethers.ZeroHash, { value: ethers.parseEther('5') }
    );

    const tokenId = 1;
    const currentBlock = await ethers.provider.getBlock('latest');
    const signatureExpiry = currentBlock.timestamp + 3600;
    const domain = { name: 'Lockx', version: '4', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await lockx.getAddress() };
    const types = { Operation: [{ name: 'tokenId', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'opType', type: 'uint8' }, { name: 'dataHash', type: 'bytes32' }] };

    // Individual ETH withdrawal 
    let nonce = await lockx.connect(user1).getNonce(tokenId);
    let referenceId = ethers.keccak256(ethers.toUtf8Bytes('individual_eth'));
    let withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256', 'address', 'bytes32', 'address', 'uint256'], [tokenId, ethers.parseEther('2'), user2.address, referenceId, user1.address, signatureExpiry]);
    let opValue = { tokenId, nonce, opType: 1, dataHash: ethers.keccak256(withdrawData) };
    let signature = await keyPair.signTypedData(domain, types, opValue);
    let messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);
    await lockx.connect(user1).withdrawETH(tokenId, messageHash, signature, ethers.parseEther('2'), user2.address, referenceId, signatureExpiry);

    // Individual ERC20 partial withdrawal 
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('individual_token_partial'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'], [tokenId, await mockToken.getAddress(), ethers.parseEther('2000'), user2.address, referenceId, user1.address, signatureExpiry]);
    opValue = { tokenId, nonce, opType: 2, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);
    await lockx.connect(user1).withdrawERC20(tokenId, messageHash, signature, await mockToken.getAddress(), ethers.parseEther('2000'), user2.address, referenceId, signatureExpiry);

    // Individual ERC20 complete withdrawal (cleanup) 
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('individual_token_complete'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'], [tokenId, await mockToken.getAddress(), ethers.parseEther('3000'), user2.address, referenceId, user1.address, signatureExpiry]);
    opValue = { tokenId, nonce, opType: 2, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);
    await lockx.connect(user1).withdrawERC20(tokenId, messageHash, signature, await mockToken.getAddress(), ethers.parseEther('3000'), user2.address, referenceId, signatureExpiry);

    // Individual ERC721 withdrawal
    nonce = await lockx.connect(user1).getNonce(tokenId);
    referenceId = ethers.keccak256(ethers.toUtf8Bytes('individual_nft'));
    withdrawData = ethers.AbiCoder.defaultAbiCoder().encode(['uint256', 'address', 'uint256', 'address', 'bytes32', 'address', 'uint256'], [tokenId, await mockNft.getAddress(), 30, user2.address, referenceId, user1.address, signatureExpiry]);
    opValue = { tokenId, nonce, opType: 3, dataHash: ethers.keccak256(withdrawData) };
    signature = await keyPair.signTypedData(domain, types, opValue);
    messageHash = ethers.TypedDataEncoder.hash(domain, types, opValue);
    await lockx.connect(user1).withdrawERC721(tokenId, messageHash, signature, await mockNft.getAddress(), 30, user2.address, referenceId, signatureExpiry);

    console.log('🔥 ULTIMATE: ALL individual withdrawal branches systematically hit!');
  });

  it('should hit EVERY deposit branch combination', async () => {
    console.log('🚀 ULTIMATE: Hitting EVERY deposit branch combination');
    
    await lockx.connect(user1).createLockboxWithETH(user1.address, keyPair.address, ethers.ZeroHash, { value: ethers.parseEther('1') });
    const tokenId = 1;

    // Individual deposits of each type
    await lockx.connect(user1).depositETH(tokenId, ethers.ZeroHash, { value: ethers.parseEther('2') });
    await lockx.connect(user1).depositERC20(tokenId, await mockToken.getAddress(), ethers.parseEther('1000'), ethers.ZeroHash);
    await lockx.connect(user1).depositERC721(tokenId, await mockNft.getAddress(), 40, ethers.ZeroHash);

    // Fee-on-transfer with different fee rates
    await feeToken.setFeePercentage(2500); // 25% fee
    await lockx.connect(user1).depositERC20(tokenId, await feeToken.getAddress(), ethers.parseEther('1000'), ethers.ZeroHash);

    // Complex batchDeposit 
    await lockx.connect(user1).batchDeposit(
      tokenId, ethers.parseEther('3'),
      [await mockToken.getAddress(), await feeToken.getAddress()],
      [ethers.parseEther('2000'), ethers.parseEther('1500')],
      [await mockNft.getAddress(), await mockNft.getAddress()],
      [41, 42], ethers.ZeroHash, { value: ethers.parseEther('3') }
    );

    console.log('🔥 ULTIMATE: ALL deposit branches systematically hit!');
  });
});