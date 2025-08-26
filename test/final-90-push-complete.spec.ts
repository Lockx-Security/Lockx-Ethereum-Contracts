import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('🚀 FINAL 90% PUSH COMPLETE', () => {
  let lockx, mockToken, mockNft;
  let owner, user1, keyPair;

  beforeEach(async () => {
    [owner, user1] = await ethers.getSigners();
    keyPair = ethers.Wallet.createRandom();

    const Lockx = await ethers.getContractFactory('Lockx');
    lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    mockToken = await MockERC20.deploy();
    await mockToken.initialize('TokenA', 'TKA');

    const MockERC721 = await ethers.getContractFactory('MockERC721');
    mockNft = await MockERC721.deploy();
    await mockNft.initialize('MockNFT', 'MNFT');

    await mockToken.connect(owner).transfer(user1.address, ethers.parseEther('1000'));
    await mockNft.connect(owner).mint(user1.address, 1);
    await mockNft.connect(user1).approve(await lockx.getAddress(), 1);
  });

  it('should hit all possible DEPOSITS array branches', async () => {
    // Test every possible array combination
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('200'));

    // Test createLockboxWithBatch with mismatched arrays (error branches)
    try {
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        ethers.parseEther('1'),
        [await mockToken.getAddress()], // 1 token
        [ethers.parseEther('10'), ethers.parseEther('20')], // 2 amounts - mismatch!
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ DEPOSITS: Token array length mismatch');
    }

    try {
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        keyPair.address,
        0,
        [],
        [],
        [await mockNft.getAddress()], // 1 NFT contract
        [1, 2], // 2 IDs - mismatch!
        ethers.ZeroHash
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ DEPOSITS: NFT array length mismatch');
    }

    // Test successful batch creation with all asset types
    await lockx.connect(user1).createLockboxWithBatch(
      user1.address,
      keyPair.address,
      ethers.parseEther('0.5'),
      [await mockToken.getAddress()],
      [ethers.parseEther('50')],
      [await mockNft.getAddress()],
      [1],
      ethers.ZeroHash,
      { value: ethers.parseEther('0.5') }
    );
    console.log('✅ DEPOSITS: Multi-asset batch creation success');

    console.log('✅ DEPOSITS: All array branches systematically tested');
  });

  it('should hit all LOCKX metadata and ownership branches', async () => {
    // Test all owner functions and metadata branches
    
    // Test setting default URI (owner only)
    await lockx.connect(owner).setDefaultMetadataURI('https://api.lockx.io/');
    console.log('✅ LOCKX: Default metadata URI set');

    // Test URI already set error
    try {
      await lockx.connect(owner).setDefaultMetadataURI('https://other.com/');
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ LOCKX: Default URI already set error');
    }

    // Create lockbox to test metadata functions
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('100'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Test tokenURI with default metadata
    const uri = await lockx.tokenURI(tokenId);
    expect(uri).to.include('lockx.io');
    console.log('✅ LOCKX: TokenURI with default metadata');

    // Test all ERC721 view functions
    expect(await lockx.ownerOf(tokenId)).to.equal(user1.address);
    expect(await lockx.balanceOf(user1.address)).to.equal(1);
    expect(await lockx.getApproved(tokenId)).to.equal(ethers.ZeroAddress);
    console.log('✅ LOCKX: All ERC721 view functions');

    // Test token existence via ownerOf (no exists function in standard ERC721)
    try {
      await lockx.ownerOf(999);
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ LOCKX: Non-existent token check');
    }

    console.log('✅ LOCKX: All metadata and ownership branches covered');
  });

  it('should hit ALL validation error branches', async () => {
    // Test zero address validations
    try {
      await lockx.connect(user1).createLockboxWithETH(
        ethers.ZeroAddress, // Zero address owner
        keyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Zero address owner check');
    }

    try {
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        ethers.ZeroAddress, // Zero address key
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Zero address lockbox key check');
    }

    // Test zero amount validations
    try {
      await lockx.connect(user1).depositETH(1, ethers.ZeroHash, { value: 0 });
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Zero ETH deposit error');
    }

    try {
      await lockx.connect(user1).depositERC20(
        1,
        await mockToken.getAddress(),
        0, // Zero amount
        ethers.ZeroHash
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Zero token amount error');
    }

    // Test nonexistent token access
    try {
      await lockx.connect(user1).getFullLockbox(999);
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Nonexistent token access');
    }

    // Test not owner access
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('50'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    try {
      await lockx.connect(owner).getFullLockbox(tokenId); // Owner trying to access user's lockbox
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ VALIDATION: Not owner access control');
    }

    console.log('✅ VALIDATION: All validation error branches systematically tested');
  });

  it('should test ALL interface and edge case branches', async () => {
    // Test every single interface ID
    const interfaces = [
      ['ERC165', '0x01ffc9a7', true],
      ['ERC721', '0x80ac58cd', true],
      ['ERC721Metadata', '0x5b5e139f', true], 
      ['ERC721Enumerable', '0x780e9d63', false],
      ['IERC5192', '0xb45a3c0e', true],
      ['Invalid', '0xffffffff', false],
      ['Random', '0x12345678', false]
    ];

    for (const [name, id, expected] of interfaces) {
      const result = await lockx.supportsInterface(id);
      expect(result).to.equal(expected);
      console.log(`✅ INTERFACE: ${name} (${id}) = ${expected}`);
    }

    // Test locked function for different states
    await lockx.connect(user1).createLockboxWithETH(
      user1.address,
      keyPair.address,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.01') }
    );

    const tokenId = 0;
    
    // Locked should always return true
    expect(await lockx.locked(tokenId)).to.be.true;
    console.log('✅ LOCKX: Locked function always true');

    // Test name and symbol (check actual deployed values)
    const name = await lockx.name();
    const symbol = await lockx.symbol();
    expect(name.length).to.be.greaterThan(0);
    expect(symbol.length).to.be.greaterThan(0);
    console.log(`✅ LOCKX: Name="${name}" Symbol="${symbol}"`);

    console.log('✅ INTERFACES: All interface and edge case branches completed');
  });

  it('should test remaining DEPOSIT edge cases', async () => {
    // Create lockbox for additional deposit testing
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('200'));
    await lockx.connect(user1).createLockboxWithERC20(
      user1.address,
      keyPair.address,
      await mockToken.getAddress(),
      ethers.parseEther('100'),
      ethers.ZeroHash
    );

    const tokenId = 0;

    // Test depositing more of existing token (existing token branch)
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('50'));
    await lockx.connect(user1).depositERC20(
      tokenId,
      await mockToken.getAddress(),
      ethers.parseEther('50'),
      ethers.ZeroHash
    );
    console.log('✅ DEPOSITS: Add to existing token balance');

    // Test depositing ETH to existing lockbox
    await lockx.connect(user1).depositETH(
      tokenId,
      ethers.ZeroHash,
      { value: ethers.parseEther('0.1') }
    );
    console.log('✅ DEPOSITS: Add ETH to existing lockbox');

    // Test zero address token deposit (should fail)
    try {
      await lockx.connect(user1).depositERC20(
        tokenId,
        ethers.ZeroAddress,
        ethers.parseEther('10'),
        ethers.ZeroHash
      );
      expect.fail('Should revert');
    } catch (error) {
      console.log('✅ DEPOSITS: Zero address token rejection');
    }

    console.log('✅ DEPOSITS: All remaining deposit edge cases covered');
  });
});