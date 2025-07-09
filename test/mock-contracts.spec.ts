import { expect } from 'chai';
import { ethers } from 'hardhat';
import { SignerWithAddress } from '@nomicfoundation/hardhat-ethers/signers';
import { MockERC20, MockERC721, MockFeeOnTransferToken } from '../typechain-types';

describe('Mock Contracts Tests', () => {
  let owner: SignerWithAddress;
  let user: SignerWithAddress;
  let user2: SignerWithAddress;

  beforeEach(async () => {
    [owner, user, user2] = await ethers.getSigners();
  });

  describe('MockERC20', () => {
    let mockERC20: MockERC20;

    beforeEach(async () => {
      const MockERC20Factory = await ethers.getContractFactory('MockERC20');
      mockERC20 = await MockERC20Factory.deploy() as MockERC20;
    });

    it('should test initialization branches', async () => {
      // Test with custom name and symbol
      await mockERC20.initialize('Custom Token', 'CUSTOM');
      expect(await mockERC20.name()).to.equal('Custom Token');
      expect(await mockERC20.symbol()).to.equal('CUSTOM');

      // Test with empty name and symbol (should use provided values)
      const mockERC20_2 = await (await ethers.getContractFactory('MockERC20')).deploy() as MockERC20;
      await mockERC20_2.initialize('', '');
      expect(await mockERC20_2.name()).to.equal('');
      expect(await mockERC20_2.symbol()).to.equal('');
    });

    it('should test minting functionality', async () => {
      await mockERC20.initialize('Test Token', 'TEST');
      
      await mockERC20.mint(user.address, ethers.parseEther('1000'));
      expect(await mockERC20.balanceOf(user.address)).to.equal(ethers.parseEther('1000'));
      // owner already has 1M from initialization
      expect(await mockERC20.totalSupply()).to.equal(ethers.parseEther('1001000'));

      // Test multiple mints
      await mockERC20.mint(user2.address, ethers.parseEther('500'));
      expect(await mockERC20.totalSupply()).to.equal(ethers.parseEther('1001500'));
    });

    it('should test standard ERC20 functionality', async () => {
      await mockERC20.initialize('Test Token', 'TEST');
      await mockERC20.mint(user.address, ethers.parseEther('1000'));

      // Test transfer
      await mockERC20.connect(user).transfer(user2.address, ethers.parseEther('100'));
      expect(await mockERC20.balanceOf(user2.address)).to.equal(ethers.parseEther('100'));
      expect(await mockERC20.balanceOf(user.address)).to.equal(ethers.parseEther('900'));

      // Test approve and transferFrom
      await mockERC20.connect(user).approve(user2.address, ethers.parseEther('200'));
      expect(await mockERC20.allowance(user.address, user2.address)).to.equal(ethers.parseEther('200'));

      await mockERC20.connect(user2).transferFrom(user.address, user2.address, ethers.parseEther('50'));
      expect(await mockERC20.balanceOf(user2.address)).to.equal(ethers.parseEther('150'));
      expect(await mockERC20.allowance(user.address, user2.address)).to.equal(ethers.parseEther('150'));
    });
  });

  describe('MockERC721', () => {
    let mockERC721: MockERC721;

    beforeEach(async () => {
      const MockERC721Factory = await ethers.getContractFactory('MockERC721');
      mockERC721 = await MockERC721Factory.deploy() as MockERC721;
    });

    it('should test initialization branches', async () => {
      // Test with custom name and symbol
      await mockERC721.initialize('Custom NFT', 'CNFT');
      expect(await mockERC721.name()).to.equal('Custom NFT');
      expect(await mockERC721.symbol()).to.equal('CNFT');

      // Test with empty name and symbol (should use provided values)
      const mockERC721_2 = await (await ethers.getContractFactory('MockERC721')).deploy() as MockERC721;
      await mockERC721_2.initialize('', '');
      expect(await mockERC721_2.name()).to.equal('');
      expect(await mockERC721_2.symbol()).to.equal('');
    });

    it('should test minting functionality', async () => {
      await mockERC721.initialize('Test NFT', 'TNFT');
      
      await mockERC721.mint(user.address, 1);
      expect(await mockERC721.ownerOf(1)).to.equal(user.address);
      expect(await mockERC721.balanceOf(user.address)).to.equal(1);

      // Test multiple mints
      await mockERC721.mint(user.address, 2);
      await mockERC721.mint(user2.address, 3);
      expect(await mockERC721.balanceOf(user.address)).to.equal(2);
      expect(await mockERC721.balanceOf(user2.address)).to.equal(1);
    });

    it('should test standard ERC721 functionality', async () => {
      await mockERC721.initialize('Test NFT', 'TNFT');
      await mockERC721.mint(user.address, 1);

      // Test transfer
      await mockERC721.connect(user).transferFrom(user.address, user2.address, 1);
      expect(await mockERC721.ownerOf(1)).to.equal(user2.address);
      expect(await mockERC721.balanceOf(user.address)).to.equal(0);
      expect(await mockERC721.balanceOf(user2.address)).to.equal(1);

      // Test approve
      await mockERC721.mint(user.address, 2);
      await mockERC721.connect(user).approve(user2.address, 2);
      expect(await mockERC721.getApproved(2)).to.equal(user2.address);

      await mockERC721.connect(user2).transferFrom(user.address, user2.address, 2);
      expect(await mockERC721.ownerOf(2)).to.equal(user2.address);

      // Test setApprovalForAll
      await mockERC721.mint(user.address, 3);
      await mockERC721.connect(user).setApprovalForAll(user2.address, true);
      expect(await mockERC721.isApprovedForAll(user.address, user2.address)).to.be.true;

      await mockERC721.connect(user2).transferFrom(user.address, user2.address, 3);
      expect(await mockERC721.ownerOf(3)).to.equal(user2.address);
    });

    it('should test token URI functionality', async () => {
      await mockERC721.initialize('Test NFT', 'TNFT');
      await mockERC721.mint(user.address, 1);

      // Test default token URI (should revert for non-existent token)
      await expect(mockERC721.tokenURI(999)).to.be.revertedWithCustomError(mockERC721, 'ERC721NonexistentToken');
      
      // Test existing token (may return empty string or base URI)
      const uri = await mockERC721.tokenURI(1);
      expect(typeof uri).to.equal('string');
    });
  });

  describe('MockFeeOnTransferToken', () => {
    let feeToken: MockFeeOnTransferToken;

    beforeEach(async () => {
      const FeeTokenFactory = await ethers.getContractFactory('MockFeeOnTransferToken');
      feeToken = await FeeTokenFactory.deploy() as MockFeeOnTransferToken;
    });

    it('should test initialization branches', async () => {
      // Test with custom name and symbol
      await feeToken.initialize('Fee Token', 'FEE');
      expect(await feeToken.name()).to.equal('Fee Token');
      expect(await feeToken.symbol()).to.equal('FEE');

      // Test with empty name and symbol (should use provided values)
      const feeToken2 = await (await ethers.getContractFactory('MockFeeOnTransferToken')).deploy() as MockFeeOnTransferToken;
      await feeToken2.initialize('', '');
      expect(await feeToken2.name()).to.equal('');
      expect(await feeToken2.symbol()).to.equal('');
    });

    it('should test fee percentage functionality', async () => {
      await feeToken.initialize('Fee Token', 'FEE');
      
      // Test setting various fee percentages
      await feeToken.setFeePercentage(0);
      expect(await feeToken.feePercentage()).to.equal(0);

      await feeToken.setFeePercentage(1000); // 10%
      expect(await feeToken.feePercentage()).to.equal(1000);

      await feeToken.setFeePercentage(5000); // 50%
      expect(await feeToken.feePercentage()).to.equal(5000);

      await feeToken.setFeePercentage(10000); // 100%
      expect(await feeToken.feePercentage()).to.equal(10000);

      // Test invalid fee percentage (should revert)
      await expect(feeToken.setFeePercentage(10001)).to.be.revertedWith('Fee cannot exceed 100%');
    });

    it('should test transfer with different fee percentages', async () => {
      await feeToken.initialize('Fee Token', 'FEE');
      await feeToken.mint(user.address, ethers.parseEther('1000'));

      // Test 0% fee
      await feeToken.setFeePercentage(0);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('100'));
      expect(await feeToken.balanceOf(user.address)).to.equal(ethers.parseEther('900'));

      // Reset balances
      await feeToken.mint(user.address, ethers.parseEther('1000'));
      await feeToken.connect(user2).transfer(owner.address, await feeToken.balanceOf(user2.address));

      // Test 10% fee
      await feeToken.setFeePercentage(1000);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('90')); // 100 - 10% fee
      expect(await feeToken.balanceOf(user.address)).to.equal(ethers.parseEther('1800')); // 1900 - 100

      // Reset balances
      await feeToken.mint(user.address, ethers.parseEther('1000'));
      await feeToken.connect(user2).transfer(owner.address, await feeToken.balanceOf(user2.address));

      // Test 50% fee
      await feeToken.setFeePercentage(5000);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('50')); // 100 - 50% fee

      // Reset balances
      await feeToken.mint(user.address, ethers.parseEther('1000'));
      await feeToken.connect(user2).transfer(owner.address, await feeToken.balanceOf(user2.address));

      // Test 100% fee
      await feeToken.setFeePercentage(10000);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      expect(await feeToken.balanceOf(user2.address)).to.equal(0); // 100 - 100% fee = 0
    });

    it('should test transferFrom with fees', async () => {
      await feeToken.initialize('Fee Token', 'FEE');
      await feeToken.mint(user.address, ethers.parseEther('1000'));
      await feeToken.connect(user).approve(user2.address, ethers.parseEther('500'));

      // Test 25% fee on transferFrom
      await feeToken.setFeePercentage(2500);
      await feeToken.connect(user2).transferFrom(user.address, user2.address, ethers.parseEther('100'));
      
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('75')); // 100 - 25% fee
      // user had 1000 minted, then transferred 100
      expect(await feeToken.balanceOf(user.address)).to.equal(ethers.parseEther('900'));
      // The allowance is reduced by the actual amount transferred (after fee)
      // Initial allowance: 500, actual amount transferred: 75, remaining: 425
      expect(await feeToken.allowance(user.address, user2.address)).to.equal(ethers.parseEther('425')); // 500 - 75
    });

    it('should test edge cases with very small amounts', async () => {
      await feeToken.initialize('Fee Token', 'FEE');
      await feeToken.mint(user.address, 1000); // Very small amount

      // Test with 50% fee on small amount
      await feeToken.setFeePercentage(5000);
      await feeToken.connect(user).transfer(user2.address, 10);
      
      expect(await feeToken.balanceOf(user2.address)).to.equal(5); // 10 - 50% = 5
      expect(await feeToken.balanceOf(user.address)).to.equal(990); // 1000 - 10

      // Test with 99% fee on very small amount
      await feeToken.setFeePercentage(9900);
      await feeToken.connect(user).transfer(user2.address, 100);
      
      expect(await feeToken.balanceOf(user2.address)).to.equal(6); // 5 + (100 - 99) = 6
    });

    it('should test fee calculation precision', async () => {
      await feeToken.initialize('Fee Token', 'FEE');
      await feeToken.mint(user.address, ethers.parseEther('1000'));

      // Test 33.33% fee (3333 basis points)
      await feeToken.setFeePercentage(3333);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      
      // Should receive approximately 66.67 tokens
      const received = await feeToken.balanceOf(user2.address);
      expect(received).to.be.closeTo(ethers.parseEther('66.67'), ethers.parseEther('0.01'));

      // Test 1% fee (100 basis points)
      await feeToken.connect(user2).transfer(owner.address, received); // Clear balance
      await feeToken.setFeePercentage(100);
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));
      
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('99')); // 100 - 1%
    });
  });

  describe('RejectETH Contract', () => {
    let rejectETH: any;

    beforeEach(async () => {
      const RejectETHFactory = await ethers.getContractFactory('RejectETH');
      rejectETH = await RejectETHFactory.deploy();
    });

    it('should reject ETH sent via receive function', async () => {
      await expect(
        user.sendTransaction({
          to: await rejectETH.getAddress(),
          value: ethers.parseEther('1')
        })
      ).to.be.revertedWith('ETH not accepted');
    });

    it('should reject ETH sent via fallback function', async () => {
      await expect(
        user.sendTransaction({
          to: await rejectETH.getAddress(),
          value: ethers.parseEther('1'),
          data: '0x12345678'
        })
      ).to.be.revertedWith('ETH not accepted');
    });

    it('should reject ETH with zero value calls', async () => {
      await expect(
        user.sendTransaction({
          to: await rejectETH.getAddress(),
          value: 0,
          data: '0x'
        })
      ).to.be.revertedWith('ETH not accepted');
    });
  });

  describe('Mock Contract Integration', () => {
    it('should test interactions between mock contracts', async () => {
      const mockERC20 = await (await ethers.getContractFactory('MockERC20')).deploy() as MockERC20;
      const mockERC721 = await (await ethers.getContractFactory('MockERC721')).deploy() as MockERC721;
      const feeToken = await (await ethers.getContractFactory('MockFeeOnTransferToken')).deploy() as MockFeeOnTransferToken;

      await mockERC20.initialize('Test Token', 'TEST');
      await mockERC721.initialize('Test NFT', 'TNFT');
      await feeToken.initialize('Fee Token', 'FEE');

      // Test that all contracts work independently
      await mockERC20.mint(user.address, ethers.parseEther('1000'));
      await mockERC721.mint(user.address, 1);
      await feeToken.mint(user.address, ethers.parseEther('1000'));

      expect(await mockERC20.balanceOf(user.address)).to.equal(ethers.parseEther('1000'));
      expect(await mockERC721.ownerOf(1)).to.equal(user.address);
      expect(await feeToken.balanceOf(user.address)).to.equal(ethers.parseEther('1000'));

      // Test transfers work correctly
      await mockERC20.connect(user).transfer(user2.address, ethers.parseEther('100'));
      await mockERC721.connect(user).transferFrom(user.address, user2.address, 1);
      
      await feeToken.setFeePercentage(1000); // 10% fee
      await feeToken.connect(user).transfer(user2.address, ethers.parseEther('100'));

      expect(await mockERC20.balanceOf(user2.address)).to.equal(ethers.parseEther('100'));
      expect(await mockERC721.ownerOf(1)).to.equal(user2.address);
      expect(await feeToken.balanceOf(user2.address)).to.equal(ethers.parseEther('90')); // 100 - 10% fee
    });
  });
}); 