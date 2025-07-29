import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { 
  Lockx,
  MockERC20,
  MockERC721,
  MockSwapRouter
} from '../typechain-types'
import { TypedDataDomain } from 'ethers'

// 🎯 OPUS PRECISION TESTS: Hit 9 specific branches to reach 90%+
describe('🚀 OPUS PRECISION 90%: Target Exact Missing Branches', () => {
  let lockx: Lockx
  let mockToken: MockERC20
  let mockToken2: MockERC20
  let mockNFT: MockERC721
  let mockRouter: MockSwapRouter
  let owner: SignerWithAddress
  let user1: SignerWithAddress
  let lockboxKeyPair: SignerWithAddress
  let domain: TypedDataDomain
  let signatureExpiry: number

  const types = {
    VerifySignature: [
      { name: 'lockboxId', type: 'uint256' },
      { name: 'lockboxSigner', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'expiry', type: 'uint256' }
    ]
  }

  beforeEach(async () => {
    [owner, user1, lockboxKeyPair] = await ethers.getSigners()
    signatureExpiry = Math.floor(Date.now() / 1000) + 86400

    // Deploy contracts
    const LockxFactory = await ethers.getContractFactory('Lockx')
    lockx = await LockxFactory.deploy()
    await lockx.waitForDeployment()

    const MockERC20Factory = await ethers.getContractFactory('MockERC20')
    mockToken = await MockERC20Factory.deploy('Mock', 'MCK', 18)
    await mockToken.waitForDeployment()
    mockToken2 = await MockERC20Factory.deploy('Mock2', 'MCK2', 18)
    await mockToken2.waitForDeployment()

    const MockERC721Factory = await ethers.getContractFactory('MockERC721')
    mockNFT = await MockERC721Factory.deploy('MockNFT', 'MNFT')
    await mockNFT.waitForDeployment()

    const MockSwapRouterFactory = await ethers.getContractFactory('MockSwapRouter')
    mockRouter = await MockSwapRouterFactory.deploy()
    await mockRouter.waitForDeployment()

    domain = {
      name: 'Lockx',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await lockx.getAddress()
    }

    // Setup
    await lockx.connect(owner).setDefaultMetadataURI('https://lockx.com/metadata/')
    await mockToken.mint(user1.address, ethers.parseEther('1000'))
    await mockToken2.mint(user1.address, ethers.parseEther('1000'))
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'))
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('1000'))
    await mockNFT.mint(user1.address, 1)
    await mockNFT.mint(user1.address, 2)
    await mockNFT.connect(user1).approve(await lockx.getAddress(), 1)
    await mockNFT.connect(user1).approve(await lockx.getAddress(), 2)
  })

  describe('🎯 TARGET: 9 Easiest Missing Branches for 90%', () => {
    // Branch 1: Hit recipient == address(0) in withdrawERC20
    it('🔥 BRANCH 1: withdrawERC20 with zero address recipient', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        [await mockToken.getAddress()],
        [ethers.parseEther('50')],
        ethers.ZeroHash
      )

      const tokenId = 0
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Try to withdraw to zero address
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          ethers.parseEther('10'),
          ethers.ZeroAddress, // Zero address!
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress')
    })

    // Branch 2: Hit recipient == address(0) in withdrawERC721
    it('🔥 BRANCH 2: withdrawERC721 with zero address recipient', async () => {
      // Create lockbox with NFT
      await lockx.connect(user1).createLockboxWithERC721(
        user1.address,
        lockboxKeyPair.address,
        await mockNFT.getAddress(),
        1,
        ethers.ZeroHash
      )

      const tokenId = 0
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Try to withdraw to zero address
      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockNFT.getAddress(),
          1,
          ethers.ZeroAddress, // Zero address!
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'ZeroAddress')
    })

    // Branch 3: Hit insufficient ETH balance check
    it('🔥 BRANCH 3: withdrawETH with insufficient balance', async () => {
      // Create lockbox with minimal ETH
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('0.1') }
      )

      const tokenId = 0
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Try to withdraw more than deposited
      await expect(
        lockx.connect(user1).withdrawETH(
          tokenId,
          messageHash,
          signature,
          ethers.parseEther('1'), // More than deposited!
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance')
    })

    // Branch 4: Hit insufficient token balance check
    it('🔥 BRANCH 4: withdrawERC20 with insufficient balance', async () => {
      // Create lockbox with limited tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        [await mockToken.getAddress()],
        [ethers.parseEther('10')],
        ethers.ZeroHash
      )

      const tokenId = 0
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Try to withdraw more than deposited
      await expect(
        lockx.connect(user1).withdrawERC20(
          tokenId,
          messageHash,
          signature,
          await mockToken.getAddress(),
          ethers.parseEther('100'), // More than deposited!
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance')
    })

    // Branch 5: Hit owner == address(0) in _requireExists
    it('🔥 BRANCH 5: Try to deposit to non-existent lockbox', async () => {
      // Try to deposit ETH to non-existent lockbox
      await expect(
        lockx.connect(user1).depositETH(999, ethers.ZeroHash, { value: ethers.parseEther('1') })
      ).to.be.revertedWithCustomError(lockx, 'NonexistentToken')
    })

    // Branch 6: Hit idx == 0 in _removeERC20Token
    it('🔥 BRANCH 6: Try to remove non-existent ERC20 token', async () => {
      // Create lockbox with ETH only
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )

      const tokenId = 0
      
      // Try to withdraw a token that was never deposited
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // This should complete successfully but not remove anything (idx == 0 case)
      await lockx.connect(user1).withdrawERC20(
        tokenId,
        messageHash,
        signature,
        await mockToken.getAddress(), // Never deposited
        0, // Zero amount
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      )
    })

    // Branch 7: Hit idx == 0 in _removeNFTKey
    it('🔥 BRANCH 7: Try to remove non-existent NFT', async () => {
      // Create lockbox with ETH only
      await lockx.connect(user1).createLockboxWithETH(
        user1.address,
        lockboxKeyPair.address,
        ethers.ZeroHash,
        { value: ethers.parseEther('1') }
      )

      const tokenId = 0
      
      // Try to withdraw an NFT that was never deposited
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // This should revert because NFT doesn't exist in lockbox
      await expect(
        lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockNFT.getAddress(),
          999, // NFT that was never deposited
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'LockboxDoesNotContainNFT')
    })

    // Branch 8 & 9: Hit swap validation branches
    it('🔥 BRANCH 8-9: swapInLockbox validation branches', async () => {
      // Create lockbox with both ETH and tokens
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('2'),
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('2') }
      )

      const tokenId = 0
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Set up mock router to return bad values
      await mockToken.mint(await mockRouter.getAddress(), ethers.parseEther('1000'))

      // Branch 8: Try swap with insufficient ETH balance
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          0, // EXACT_INPUT
          ethers.ZeroAddress, // ETH input
          await mockToken.getAddress(),
          ethers.parseEther('10'), // More ETH than in lockbox!
          ethers.parseEther('1'),
          await mockRouter.getAddress(),
          '0x',
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'NoETHBalance')

      // Branch 9: Try swap with insufficient token balance
      const nonce2 = await lockx.getNonce(tokenId)
      const value2 = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce2,
        expiry: signatureExpiry
      }

      const messageHash2 = ethers.TypedDataEncoder.hash(domain, types, value2)
      const signature2 = await lockboxKeyPair.signTypedData(domain, types, value2)

      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash2,
          signature2,
          0, // EXACT_INPUT
          await mockToken.getAddress(),
          ethers.ZeroAddress, // ETH output
          ethers.parseEther('200'), // More tokens than in lockbox!
          ethers.parseEther('1'),
          await mockRouter.getAddress(),
          '0x',
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'InsufficientTokenBalance')
    })
  })
})