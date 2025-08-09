import { expect } from 'chai';
import { ethers } from 'hardhat';

// Exercise alternate legs in batchWithdraw validations

describe('batchWithdraw alternates', () => {
  it('mismatched arrays (tokens vs amounts) and (nfts vs ids)', async () => {
    const [user] = await ethers.getSigners();
    const Lockx = await ethers.getContractFactory('Lockx');
    const lockx = await Lockx.deploy();

    const msgHash = ethers.ZeroHash;
    const sig = '0x00';
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    const expiry = now + 3600n;

    // tokens mismatch
    await expect(
      lockx.connect(user).batchWithdraw(
        0,
        msgHash,
        sig,
        0,
        [user.address],
        [], // mismatch
        [],
        [],
        user.address,
        ethers.ZeroHash,
        expiry
      )
    ).to.be.reverted;

    // nfts mismatch
    await expect(
      lockx.connect(user).batchWithdraw(
        0,
        msgHash,
        sig,
        0,
        [],
        [],
        [user.address],
        [], // mismatch
        user.address,
        ethers.ZeroHash,
        expiry
      )
    ).to.be.reverted;
  });
});


