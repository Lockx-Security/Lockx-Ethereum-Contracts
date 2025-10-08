import { expect } from 'chai';
import { ethers, network } from 'hardhat';

// Allowlisted target address baked into Withdrawals
const RAILGUN_ADDR = '0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9';

// EIP-712 constants from SignatureVerification
const EIP712_NAME = 'Lockx';
const EIP712_VERSION = '5';

enum OperationType {
  ROTATE_KEY,
  WITHDRAW_ETH,
  WITHDRAW_ERC20,
  WITHDRAW_NFT,
  BURN_LOCKBOX,
  SET_TOKEN_URI,
  BATCH_WITHDRAW,
  SWAP_ASSETS,
  RAILGUN_TRANSFER,
}

describe('Railgun transfer in lockbox', () => {
  it('debites actual spent and cleans approvals', async () => {
    const [deployer, owner, keySigner] = await ethers.getSigners();

    // Deploy mocks
    const ERC20 = await ethers.getContractFactory('MockERC20');
    const token = await ERC20.deploy('Mock', 'MOCK');
    await token.waitForDeployment();

    const MockRailgun = await ethers.getContractFactory('MockRailgunTarget');
    const mock = await MockRailgun.deploy();
    await mock.waitForDeployment();

    // Etch mock runtime code into the allowlisted Railgun address
    const code = await ethers.provider.getCode(await mock.getAddress());
    await network.provider.send('hardhat_setCode', [RAILGUN_ADDR, code]);
    const railgun = MockRailgun.attach(RAILGUN_ADDR);

    // Deploy Lockx
    const Lockx = await ethers.getContractFactory('Lockx');
    const lockx = await Lockx.connect(deployer).deploy();
    await lockx.waitForDeployment();

    // Mint lockbox with ERC20 deposit via createLockboxWithERC20
    const referenceId = ethers.id('ref-1');
    const depositAmount = ethers.parseEther('100');
    await token.mint(owner.address, depositAmount);
    await token.connect(owner).approve(await lockx.getAddress(), depositAmount);

    // createLockboxWithERC20(address lockboxPublicKey, address tokenAddress, uint256 amount, bytes32 referenceId)
    const tx = await lockx
      .connect(owner)
      .createLockboxWithERC20(keySigner.address, await token.getAddress(), depositAmount, referenceId);
    const rcp = await tx.wait();
    // Find ERC721 Transfer(from=0) event to get tokenId
    const transferIface = new ethers.Interface(["event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)"]);
    let tokenId: bigint | undefined;
    for (const log of rcp!.logs) {
      try {
        const parsed = transferIface.parseLog({ topics: log.topics as string[], data: log.data });
        const from = parsed.args[0] as string;
        if (from === ethers.ZeroAddress) {
          tokenId = parsed.args[2] as bigint;
          break;
        }
      } catch {}
    }
    if (tokenId === undefined) throw new Error('tokenId not found');

    // Configure mock target to pull a specific amount
    const pullAmount = ethers.parseEther('7');
    await railgun.setPull(await token.getAddress(), pullAmount);

    // Build EIP-712 signature for RAILGUN_TRANSFER
    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: await lockx.getAddress() };
    const types = { Operation: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'nonce', type: 'uint256' },
      { name: 'opType', type: 'uint8' },
      { name: 'dataHash', type: 'bytes32' },
    ]};

    // data encoded exactly as contract does
    const amount = ethers.parseEther('10'); // authorize up to 10, but mock pulls 7
    // For testing, pass only the selector bytes; mock accepts any calldata in fallback
    const railgunData = '0xcf934ee4';
    const signatureExpiry = (await ethers.provider.getBlock('latest'))!.timestamp + 3600;
    const authData = ethers.AbiCoder.defaultAbiCoder().encode([
      'address','uint256','address','bytes32','bytes32','uint256'
    ], [
      await token.getAddress(),
      amount,
      RAILGUN_ADDR,
      ethers.keccak256(railgunData as any),
      referenceId,
      signatureExpiry,
    ]);

    // get nonce via view
    const nonce = await lockx.connect(owner).getNonce(tokenId);
    const value = { tokenId, nonce, opType: OperationType.RAILGUN_TRANSFER, dataHash: ethers.keccak256(authData) };
    const signature = await keySigner.signTypedData(domain, types, value);

    // Call railgunTransferInLockbox
    const balBefore = await token.balanceOf(await lockx.getAddress());
    await expect(
      lockx.connect(owner).railgunTransferInLockbox(
        tokenId,
        signature,
        await token.getAddress(),
        amount,
        RAILGUN_ADDR,
        railgunData,
        referenceId,
        signatureExpiry,
      )
    ).to.emit(lockx, 'RailgunTransferExecuted');

    const balAfter = await token.balanceOf(await lockx.getAddress());
    expect(balBefore - balAfter).to.equal(pullAmount);
    // allowance cleaned
    const allowance = await token.allowance(await lockx.getAddress(), RAILGUN_ADDR);
    expect(allowance).to.equal(0n);
  });
});
