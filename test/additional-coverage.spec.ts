import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Lockx, MockERC20, MockERC721 } from '../typechain-types';

describe('Additional Coverage Tests', function () {
  let lockx: Lockx;
  let mockERC20: MockERC20;
  let mockERC721: MockERC721;
  let owner: any;
  let user: any;
  let lockboxKey: any;

  beforeEach(async function () {
    [owner, user, lockboxKey] = await ethers.getSigners();
    
    const LockxFactory = await ethers.getContractFactory('Lockx');
    lockx = await LockxFactory.deploy();

    const MockERC20Factory = await ethers.getContractFactory('MockERC20');
    mockERC20 = await MockERC20Factory.deploy();

    const MockERC721Factory = await ethers.getContractFactory('MockERC721');
    mockERC721 = await MockERC721Factory.deploy();

    await mockERC20.mint(owner.address, ethers.parseEther('1000'));
  });

  it('should handle tokenURI for nonexistent token', async function () {
    await expect(lockx.tokenURI(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
  });

  it('should handle tokenURI with no URI set', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    await expect(lockx.tokenURI(0)).to.be.revertedWithCustomError(lockx, 'NoURI');
  });

  it('should handle default URI setting', async function () {
    const defaultURI = 'https://example.com/metadata/';
    await lockx.connect(owner).setDefaultMetadataURI(defaultURI);
    
    // Try to set again - should revert
    await expect(
      lockx.connect(owner).setDefaultMetadataURI('https://another.com/')
    ).to.be.revertedWithCustomError(lockx, 'DefaultURIAlreadySet');

    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );
    
    expect(await lockx.tokenURI(0)).to.equal(defaultURI);
  });

  it('should handle zero lockbox key in createLockboxWithERC721', async function () {
    // MockERC721 mints token ID 1 to the deployer in constructor
    await mockERC721.connect(owner).approve(await lockx.getAddress(), 1);
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await expect(
      lockx.connect(owner).createLockboxWithERC721(
        owner.address,
        ethers.ZeroAddress,
        await mockERC721.getAddress(),
        1,
        referenceId
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
  });

  it('should handle zero lockbox key in createLockboxWithBatch', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await expect(
      lockx.connect(owner).createLockboxWithBatch(
        owner.address,
        ethers.ZeroAddress,
        0,
        [],
        [],
        [],
        [],
        referenceId
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroKey');
  });

  it('should handle transfer prevention', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    await expect(
      lockx.connect(owner).transferFrom(owner.address, user.address, 0)
    ).to.be.revertedWithCustomError(lockx, 'TransfersDisabled');
  });

  it('should handle locked() for nonexistent token', async function () {
    await expect(lockx.locked(999)).to.be.revertedWithCustomError(lockx, 'NonexistentToken');
  });

  it('should revert on receive function', async function () {
    await expect(
      owner.sendTransaction({
        to: await lockx.getAddress(),
        value: ethers.parseEther('1')
      })
    ).to.be.revertedWithCustomError(lockx, 'UseDepositETH');
  });

  it('should revert on fallback function', async function () {
    await expect(
      owner.sendTransaction({
        to: await lockx.getAddress(),
        value: ethers.parseEther('1'),
        data: '0x1234'
      })
    ).to.be.revertedWithCustomError(lockx, 'FallbackNotAllowed');
  });

  it('should handle view function access control', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    // Try to access from user (non-owner)
    await expect(
      lockx.connect(user).getActiveLockboxPublicKeyForToken(0)
    ).to.be.revertedWithCustomError(lockx, 'NotOwner');

    await expect(
      lockx.connect(user).getNonce(0)
    ).to.be.revertedWithCustomError(lockx, 'NotOwner');

    await expect(
      lockx.connect(user).getFullLockbox(0)
    ).to.be.revertedWithCustomError(lockx, 'NotOwner');
  });

  it('should handle empty batch deposit rejection', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    await expect(
      lockx.connect(owner).batchDeposit(
        0, // tokenId
        0, // amountETH
        [], // tokenAddresses
        [], // tokenAmounts
        [], // nftContracts
        [], // nftTokenIds
        referenceId
      )
    ).to.be.revertedWithCustomError(lockx, 'ZeroAmount');
  });

  it('should handle array length mismatches in batch deposit', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    // Test ERC20 array mismatch
    await expect(
      lockx.connect(owner).batchDeposit(
        0,
        0,
        [await mockERC20.getAddress()], // 1 address
        [], // 0 amounts - mismatch!
        [],
        [],
        referenceId
      )
    ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');

    // Test ERC721 array mismatch
    await expect(
      lockx.connect(owner).batchDeposit(
        0,
        0,
        [],
        [],
        [await mockERC721.getAddress()], // 1 contract
        [], // 0 token IDs - mismatch!
        referenceId
      )
    ).to.be.revertedWithCustomError(lockx, 'MismatchedInputs');
  });

  it('should handle ETH value mismatch in batch deposit', async function () {
    const referenceId = ethers.keccak256(ethers.toUtf8Bytes('ref1'));
    
    await lockx.connect(owner).createLockboxWithETH(
      owner.address,
      lockboxKey.address,
      referenceId,
      { value: ethers.parseEther('1') }
    );

    await expect(
      lockx.connect(owner).batchDeposit(
        0,
        ethers.parseEther('1'), // claiming 1 ETH
        [],
        [],
        [],
        [],
        referenceId,
        { value: ethers.parseEther('0.5') } // but only sending 0.5 ETH
      )
    ).to.be.revertedWithCustomError(lockx, 'ETHMismatch');
  });
}); 