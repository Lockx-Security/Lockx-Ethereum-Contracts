import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('supportsInterface negatives', () => {
  it('returns false for random interfaceIds', async () => {
    const Lockx = await ethers.getContractFactory('Lockx');
    const lockx = await Lockx.deploy();
    const randomIds = [
      '0xffffffff',
      '0x00000000',
      '0x12345678',
      '0xabcdef01',
    ];
    for (const id of randomIds) {
      const res = await lockx.supportsInterface(id);
      expect(res).to.equal(false);
    }
  });
});


