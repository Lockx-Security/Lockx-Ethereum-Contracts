import { expect } from 'chai'
import { ethers } from 'hardhat'
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers'
import { 
  Lockx,
  MockERC20,
  MockERC721,
  MockSwapRouter,
  MaliciousRouter
} from '../typechain-types'
import { TypedDataDomain } from 'ethers'

// 🚀 FINAL OPUS BREAKTHROUGH: Advanced techniques to reach 90%+
describe('🔥 OPUS FINAL BREAKTHROUGH: Advanced Branch Coverage to 90%+', () => {
  let lockx: Lockx
  let mockToken: MockERC20
  let mockToken2: MockERC20
  let mockNFT: MockERC721
  let mockRouter: MockSwapRouter
  let maliciousRouter: MaliciousRouter
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

    const MaliciousRouterFactory = await ethers.getContractFactory('MaliciousRouter')
    maliciousRouter = await MaliciousRouterFactory.deploy()
    await maliciousRouter.waitForDeployment()

    domain = {
      name: 'Lockx',
      version: '1',
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await lockx.getAddress()
    }

    // Setup
    await lockx.connect(owner).setDefaultMetadataURI('https://lockx.com/metadata/')
    await mockToken.mint(user1.address, ethers.parseEther('10000'))
    await mockToken2.mint(user1.address, ethers.parseEther('10000'))
    await mockToken.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10000'))
    await mockToken2.connect(user1).approve(await lockx.getAddress(), ethers.parseEther('10000'))
    
    // Mint multiple NFTs
    for (let i = 1; i <= 10; i++) {
      await mockNFT.mint(user1.address, i)
      await mockNFT.connect(user1).approve(await lockx.getAddress(), i)
    }
  })

  describe('🎯 ADVANCED BRANCH TARGETING', () => {
    it('🔥 BREAKTHROUGH 1: Hit NFT counting branches with mixed NFT states', async () => {
      // Create lockbox with multiple NFTs
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [],
        [],
        [await mockNFT.getAddress(), await mockNFT.getAddress(), await mockNFT.getAddress()],
        [1, 2, 3],
        ethers.ZeroHash
      )

      const tokenId = 0
      
      // Withdraw one NFT to create a "hole" in the NFT list
      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      await lockx.connect(user1).withdrawERC721(
        tokenId,
        messageHash,
        signature,
        await mockNFT.getAddress(),
        2, // Withdraw middle NFT
        user1.address,
        ethers.ZeroHash,
        signatureExpiry
      )

      // Now get NFTs - this should hit the counting branches
      const nfts = await lockx.getNFTs(tokenId)
      expect(nfts.length).to.equal(2) // Should have 2 NFTs left
    })

    it('🔥 BREAKTHROUGH 2: Hit swap slippage and router overspent branches', async () => {
      // Create lockbox with ETH and tokens
      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        ethers.parseEther('5'),
        [await mockToken.getAddress()],
        [ethers.parseEther('1000')],
        [],
        [],
        ethers.ZeroHash,
        { value: ethers.parseEther('5') }
      )

      const tokenId = 0
      
      // Configure malicious router to trigger slippage
      await mockToken.mint(await maliciousRouter.getAddress(), ethers.parseEther('10000'))
      await mockToken2.mint(await maliciousRouter.getAddress(), ethers.parseEther('10000'))
      
      // Set malicious router to return less than minAmountOut
      await maliciousRouter.setReturnLessThanMin(true)

      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // This should trigger SlippageExceeded
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          0, // EXACT_INPUT
          await mockToken.getAddress(),
          await mockToken2.getAddress(),
          ethers.parseEther('100'),
          ethers.parseEther('200'), // High minAmountOut that won't be met
          await maliciousRouter.getAddress(),
          '0x',
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'SlippageExceeded')
    })

    it('🔥 BREAKTHROUGH 3: Hit router overspent protection', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        ethers.ZeroHash
      )

      const tokenId = 0
      
      // Configure malicious router to take more tokens than authorized
      await mockToken2.mint(await maliciousRouter.getAddress(), ethers.parseEther('10000'))
      await maliciousRouter.setTakeMoreThanAuthorized(true)

      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // This should trigger RouterOverspent
      await expect(
        lockx.connect(user1).swapInLockbox(
          tokenId,
          messageHash,
          signature,
          0, // EXACT_INPUT
          await mockToken.getAddress(),
          await mockToken2.getAddress(),
          ethers.parseEther('50'),
          ethers.parseEther('40'),
          await maliciousRouter.getAddress(),
          '0x',
          ethers.ZeroHash,
          signatureExpiry
        )
      ).to.be.revertedWithCustomError(lockx, 'RouterOverspent')
    })

    it('🔥 BREAKTHROUGH 4: Hit tokenOut == address(0) ETH output branch', async () => {
      // Create lockbox with tokens
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        ethers.ZeroHash
      )

      const tokenId = 0
      
      // Fund the mock router with ETH for swapping
      await owner.sendTransaction({
        to: await mockRouter.getAddress(),
        value: ethers.parseEther('10')
      })

      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Swap tokens for ETH (tokenOut = address(0))
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        0, // EXACT_INPUT
        await mockToken.getAddress(),
        ethers.ZeroAddress, // ETH output!
        ethers.parseEther('10'),
        ethers.parseEther('0.1'),
        await mockRouter.getAddress(),
        '0x',
        ethers.ZeroHash,
        signatureExpiry
      )

      // Verify ETH was added to lockbox
      const ethBalance = await lockx.getETHBalance(tokenId)
      expect(ethBalance).to.be.gt(0)
    })

    it('🔥 BREAKTHROUGH 5: Hit new token registration branch in swap', async () => {
      // Create lockbox with only one token
      await lockx.connect(user1).createLockboxWithERC20(
        user1.address,
        lockboxKeyPair.address,
        [await mockToken.getAddress()],
        [ethers.parseEther('100')],
        ethers.ZeroHash
      )

      const tokenId = 0
      
      // Fund router with second token
      await mockToken2.mint(await mockRouter.getAddress(), ethers.parseEther('10000'))

      const nonce = await lockx.getNonce(tokenId)
      const value = {
        lockboxId: tokenId,
        lockboxSigner: lockboxKeyPair.address,
        nonce: nonce,
        expiry: signatureExpiry
      }

      const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
      const signature = await lockboxKeyPair.signTypedData(domain, types, value)

      // Swap to a NEW token (mockToken2) - should trigger registration
      await lockx.connect(user1).swapInLockbox(
        tokenId,
        messageHash,
        signature,
        0, // EXACT_INPUT
        await mockToken.getAddress(),
        await mockToken2.getAddress(), // New token!
        ethers.parseEther('10'),
        ethers.parseEther('5'),
        await mockRouter.getAddress(),
        '0x',
        ethers.ZeroHash,
        signatureExpiry
      )

      // Verify new token was registered
      const tokens = await lockx.getERC20Tokens(tokenId)
      expect(tokens.length).to.equal(2)
      expect(tokens).to.include(await mockToken2.getAddress())
    })

    it('🔥 BREAKTHROUGH 6: Complex NFT state manipulation', async () => {
      // Create lockbox with many NFTs to manipulate internal state
      const nftContracts = []
      const nftTokenIds = []
      
      for (let i = 1; i <= 5; i++) {
        nftContracts.push(await mockNFT.getAddress())
        nftTokenIds.push(i)
      }

      await lockx.connect(user1).createLockboxWithBatch(
        user1.address,
        lockboxKeyPair.address,
        0,
        [],
        [],
        nftContracts,
        nftTokenIds,
        ethers.ZeroHash
      )

      const tokenId = 0
      
      // Withdraw NFTs in specific order to create complex state
      for (const nftId of [2, 4, 1]) {
        const nonce = await lockx.getNonce(tokenId)
        const value = {
          lockboxId: tokenId,
          lockboxSigner: lockboxKeyPair.address,
          nonce: nonce,
          expiry: signatureExpiry
        }

        const messageHash = ethers.TypedDataEncoder.hash(domain, types, value)
        const signature = await lockboxKeyPair.signTypedData(domain, types, value)

        await lockx.connect(user1).withdrawERC721(
          tokenId,
          messageHash,
          signature,
          await mockNFT.getAddress(),
          nftId,
          user1.address,
          ethers.ZeroHash,
          signatureExpiry
        )
      }

      // Get remaining NFTs - should trigger complex branch logic
      const remainingNFTs = await lockx.getNFTs(tokenId)
      expect(remainingNFTs.length).to.equal(2)
    })
  })
})