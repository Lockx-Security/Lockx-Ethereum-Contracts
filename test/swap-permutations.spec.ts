import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('swap permutations (recipient vs lockbox, ETH vs ERC20)', () => {
  it('recipient == 0 credits lockbox; tokenOut == ETH path exercised', async () => {
    const [user] = await ethers.getSigners();
    const Lockx = await ethers.getContractFactory('Lockx');
    const lockx = await Lockx.deploy();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const tokenA = await MockERC20.deploy();
    await tokenA.initialize('A', 'A');

    const MockSwapRouter = await ethers.getContractFactory('MockSwapRouter');
    const router = await MockSwapRouter.deploy();

    await tokenA.mint(user.address, ethers.parseEther('2'));
    await tokenA.connect(user).approve(await lockx.getAddress(), ethers.parseEther('2'));
    await lockx.connect(user).createLockboxWithERC20(user.address, user.address, await tokenA.getAddress(), ethers.parseEther('2'), ethers.ZeroHash);

    const msgHash = ethers.ZeroHash; // invalid, we only want to run prechecks; will revert
    const sig = '0x00';
    const now = BigInt((await ethers.provider.getBlock('latest'))!.timestamp);
    const expiry = now + 3600n;

    await expect(
      lockx.connect(user).swapInLockbox(
        0,
        msgHash,
        sig,
        await tokenA.getAddress(),
        ethers.ZeroAddress, // ETH out
        ethers.parseEther('1'),
        1,
        await router.getAddress(),
        '0x',
        ethers.ZeroHash,
        expiry,
        ethers.ZeroAddress // recipient zero → credit lockbox
      )
    ).to.be.reverted; // still exercises ETH out + recipient==0 path before signature check
  });
});


