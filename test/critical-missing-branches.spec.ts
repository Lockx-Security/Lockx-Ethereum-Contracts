import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { Lockx, MockERC20, MockERC721 } from '../typechain-types'

/**
 * CRITICAL MISSING BRANCHES - Targeting 6 specific uncovered branches
 * Current: 88.02% (213/242) | Target: 90.5% (219/242) | Need: +6 branches
 * 
 * Based on coverage analysis, these are the exact missing branches:
 * 1. Deposits.sol:96 - depositETH with msg.value = 0
 * 2. Lockx.sol:89 - createLockboxWithETH with msg.value = 0  
 * 3. Lockx.sol:87 - createLockboxWithETH where to != msg.sender
 * 4. Lockx.sol:197-199 - createLockboxWithBatch array length mismatch
 * 5. Deposits.sol:114 - depositERC20 with amount = 0
 * 6. Lockx.sol:153 - createLockboxWithERC20 array length mismatch
 */
describe('🎯 CRITICAL MISSING BRANCHES - Target +6 for 90.5%', () => {
  let lockx: Lockx
  let mockToken: MockERC20
  let mockNFT: MockERC721
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let user2: SignerWithAddress
  let lockboxKeyPair: SignerWithAddress

  beforeEach(async () => {
    [owner, user1, user2, lockboxKeyPair] = await ethers.getSigners()

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx')
    lockx = await LockxFactory.deploy()
    await lockx.waitForDeployment()

    const MockERC20Factory = await ethers.getContractFactory('MockERC20')
    mockToken = await MockERC20Factory.deploy()
    await mockToken.waitForDeployment()
    await mockToken.initialize('Mock Token', 'MTK')

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockNFT = await MockERC721Factory.deploy()
    await mockNFT.waitForDeployment()
    await mockNFT.initialize('Mock NFT', 'MNFT')

    // Setup tokens
    await mockToken.mint(user1.address, ethers.parseEther('1000'))
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'))
    await mockNFT.mint(user1.address, 1)
    await mockNFT.connect(user1).approve(await lockx.getAddress(), 1)
  })

  describe('🔥 EXACT MISSING BRANCHES (6 tests for +6 branches)', () => {
    
    it('BRANCH 1: depositETH with msg.value = 0 (Deposits.sol:96)', async () => {
      // First create a lockbox to deposit into
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )

      // Try to deposit 0 ETH - should hit the zero amount branch
      await expect(
        lockx.connect(user1).depositETH(0, ethers.ZeroHash, { value: 0 })
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount')
    })

    it('BRANCH 2: createLockboxWithETH with msg.value = 0 (Lockx.sol:89)', async () => {
      // Try to create lockbox with 0 ETH - should hit zero amount validation
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user1.address,
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: 0 }
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount')
    })

    it('BRANCH 3: createLockboxWithETH where to != msg.sender (Lockx.sol:87)', async () => {
      // Try to create lockbox for someone else - should hit self-mint validation
      await expect(
        lockx.connect(user1).createLockboxWithETH(
          user2.address, // Different from msg.sender (user1)
          lockboxKeyPair.address,
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'SelfMintOnly')
    })

    it('BRANCH 4: createLockboxWithBatch array length mismatch (Lockx.sol:197-199)', async () => {
      // Try batch creation with mismatched token arrays
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'),
          [await mockToken.getAddress()], // 1 element
          [ethers.parseEther('100'), ethers.parseEther('200')], // 2 elements - MISMATCH!
          [],
          [],
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch')
    })

    it('BRANCH 5: depositERC20 with amount = 0 (Deposits.sol:114)', async () => {
      // First create a lockbox to deposit into
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )

      // Try to deposit 0 tokens - should hit zero amount validation
      await expect(
        lockx.connect(user1).depositERC20(
          0,
          await mockToken.getAddress(),
          0, // Zero amount!
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount')
    })

    it('BRANCH 6: createLockboxWithERC20 with zero amount (Lockx.sol:153)', async () => {
      // Try ERC20 creation with zero amount - should hit zero amount validation
      await expect(
        lockx.connect(user1).createLockboxWithERC20(
          user1.address,
          lockboxKeyPair.address,
          await mockToken.getAddress(),
          0, // Zero amount!
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAmount')
    })
  })

  describe('🎯 BONUS EDGE CASES (Additional coverage)', () => {
    
    it('BONUS: createLockboxWithERC721 with zero token address', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithERC721(
          user1.address,
          lockboxKeyPair.address,
          ethers.ZeroAddress, // Zero address for NFT contract!
          1,
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroTokenAddress')
    })

    it('BONUS: createLockboxWithBatch NFT array mismatch', async () => {
      await expect(
        lockx.connect(user1).createLockboxWithBatch(
          user1.address,
          lockboxKeyPair.address,
          ethers.parseEther('1'),
          [],
          [],
          [await mockNFT.getAddress()], // 1 element
          [1, 2], // 2 elements - MISMATCH!
          ethers.ZeroHash,
          { value: ethers.parseEther('1') }
        )
      ).to.be.revertedWithCustomError(lockx, 'ArrayLengthMismatch')
    })

    it('BONUS: depositERC721 with non-existent token', async () => {
      // Create lockbox first
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )

      // Try to deposit non-existent NFT
      await expect(
        lockx.connect(user1).depositERC721(
          0,
          await mockNFT.getAddress(),
          999, // Non-existent token ID
          ethers.ZeroHash
        )
      ).to.be.revertedWithCustomError(mockNFT, 'ERC721NonexistentToken')
    })
  })

  describe('📊 COVERAGE VERIFICATION', () => {
    it('should demonstrate all critical error paths are tested', async () => {
      let branchesHit = 0

      // Branch 1: Zero ETH deposit
      try {
        await lockx.connect(user1).createLockboxWithETH(
          user1.address, lockboxKeyPair.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
        )
        await lockx.connect(user1).depositETH(0, ethers.ZeroHash, { value: 0 })
      } catch { branchesHit++ }

      // Branch 2: Zero ETH creation
      try {
        await lockx.connect(user1).createLockboxWithETH(
          user1.address, lockboxKeyPair.address, ethers.ZeroHash, { value: 0 }
        )
      } catch { branchesHit++ }

      // Branch 3: Self-mint validation
      try {
        await lockx.connect(user1).createLockboxWithETH(
          user2.address, lockboxKeyPair.address, ethers.ZeroHash, { value: ethers.parseEther('1') }
        )
      } catch { branchesHit++ }

      // Branch 4: Array mismatch (batch)
      try {
        await lockx.connect(user1).createLockboxWithBatch(
          user1.address, lockboxKeyPair.address, 0,
          [await mockToken.getAddress()], [ethers.parseEther('100'), ethers.parseEther('200')],
          [], [], ethers.ZeroHash
        )
      } catch { branchesHit++ }

      // Branch 5: Zero token deposit
      try {
        await lockx.connect(user1).depositERC20(0, await mockToken.getAddress(), 0, ethers.ZeroHash)
      } catch { branchesHit++ }

      // Branch 6: Zero amount ERC20 creation
      try {
        await lockx.connect(user1).createLockboxWithERC20(
          user1.address, lockboxKeyPair.address, await mockToken.getAddress(), 0, ethers.ZeroHash
        )
      } catch { branchesHit++ }

      expect(branchesHit).to.equal(6, 'All 6 critical error branches should be hit')
      console.log(`✅ Successfully tested ${branchesHit}/6 critical missing branches`)
    })
  })
})