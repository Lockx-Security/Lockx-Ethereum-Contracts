const { ethers } = require("hardhat");

async function main() {
    console.log("🎯 Lockbox Marketplace Demo");
    console.log("===========================\n");

    // Get signers
    const [deployer, seller, buyer] = await ethers.getSigners();
    console.log("Seller:", seller.address);
    console.log("Buyer:", buyer.address);
    console.log("");

    // Deploy contracts
    console.log("📦 Deploying Lockx...");
    const Lockx = await ethers.getContractFactory("Lockx");
    const MockERC20 = await ethers.getContractFactory("MockWBTC");

    const lockx = await Lockx.deploy();
    await lockx.waitForDeployment();

    // Deploy mock tokens
    const usdc = await MockERC20.deploy("USD Coin", "USDC");
    await usdc.waitForDeployment();
    
    console.log("✅ Contracts deployed\n");

    // Setup: Create lockbox with assets
    console.log("🏗️  Seller creates lockbox...");
    const referenceId = ethers.solidityPackedKeccak256(["string"], ["demo-lockbox"]);
    
    // Seller creates lockbox with 1 ETH
    await lockx.connect(seller).createLockboxWithETH(
        seller.address,
        referenceId,
        { value: ethers.parseEther("1") }
    );
    
    const tokenId = 1;
    
    // Add 500 USDC to lockbox
    await usdc.connect(seller).mint(seller.address, ethers.parseUnits("500", 6));
    await usdc.connect(seller).approve(await lockx.getAddress(), ethers.parseUnits("500", 6));
    await lockx.connect(seller).depositERC20(
        tokenId,
        await usdc.getAddress(),
        ethers.parseUnits("500", 6),
        referenceId
    );

    console.log("✅ Lockbox created with 1 ETH + 500 USDC\n");

    // ======================
    // SHOW TRANSPARENCY
    // ======================
    console.log("👀 TRANSPARENCY: Anyone can view lockbox contents");
    console.log("================================================");

    // Seller can view (owner)
    try {
        const sellerView = await lockx.connect(seller).getFullLockbox(tokenId);
        console.log("✅ Seller (owner) can view:");
        console.log("   ETH:", ethers.formatEther(sellerView.lockboxETH));
        console.log("   ERC20 tokens:", sellerView.erc20Tokens.length);
    } catch (error) {
        console.log("❌ Seller cannot view:", error.message);
    }

    // Buyer can view contents (public)
    try {
        const buyerView = await lockx.connect(buyer).viewLockboxContents(tokenId);
        console.log("✅ Buyer (public) can view:");
        console.log("   ETH:", ethers.formatEther(buyerView.lockboxETH));
        console.log("   ERC20 tokens:", buyerView.erc20Tokens.length);
        if (buyerView.erc20Tokens.length > 0) {
            console.log("   Token:", buyerView.erc20Tokens[0].tokenAddress);
            console.log("   Balance:", ethers.formatUnits(buyerView.erc20Tokens[0].balance, 6), "USDC");
        }
    } catch (error) {
        console.log("❌ Buyer cannot view contents:", error.message);
    }

    // Buyer CANNOT view via owner-only function
    try {
        await lockx.connect(buyer).getFullLockbox(tokenId);
        console.log("❌ ERROR: Buyer should not access owner function!");
    } catch (error) {
        console.log("✅ Buyer correctly blocked from owner function");
    }

    console.log("");

    // ======================
    // MARKETPLACE LISTING
    // ======================
    console.log("🏪 Seller lists lockbox for sale");
    console.log("================================");

    const expiry = Math.floor(Date.now() / 1000) + 3600;
    const paymentOptions = [
        {
            tokens: [await usdc.getAddress()],
            amounts: [ethers.parseUnits("1600", 6)], // Worth ~$1600 (1 ETH + 500 USDC)
            description: "1600 USDC"
        }
    ];

    await lockx.connect(seller).listLockbox(tokenId, paymentOptions, expiry);
    console.log("✅ Lockbox listed for 1600 USDC");

    // Check listing status
    const isListed = await lockx.isListedForSale(tokenId);
    const isLocked = await lockx.listingLocked(tokenId);
    console.log("🏷️  Listed for sale:", isListed);
    console.log("🔒 Lockbox locked:", isLocked);

    // Buyer can still view contents while listed
    console.log("\n👀 Buyer can still inspect contents while listed:");
    const listedView = await lockx.connect(buyer).viewLockboxContents(tokenId);
    console.log("   ETH:", ethers.formatEther(listedView.lockboxETH));
    console.log("   USDC:", ethers.formatUnits(listedView.erc20Tokens[0].balance, 6));

    // ======================
    // PURCHASE
    // ======================
    console.log("\n🛒 Buyer purchases lockbox");
    console.log("==========================");

    // Setup buyer with USDC
    await usdc.connect(buyer).mint(buyer.address, ethers.parseUnits("2000", 6));
    await usdc.connect(buyer).approve(await lockx.getAddress(), ethers.parseUnits("1600", 6));

    console.log("💰 Buyer funded with USDC");

    // Execute purchase
    await lockx.connect(buyer).buyLockbox(tokenId, 0); // Payment option 0
    console.log("✅ Purchase completed!");

    // ======================
    // VERIFY RESULTS
    // ======================
    console.log("\n🔍 Verifying results");
    console.log("====================");

    // Check ownership transfer
    const newOwner = await lockx.ownerOf(tokenId);
    console.log("👑 New owner:", newOwner === buyer.address ? "✅ BUYER" : "❌ SELLER");

    // Check lockbox unlocked
    const stillLocked = await lockx.listingLocked(tokenId);
    const stillListed = await lockx.isListedForSale(tokenId);
    console.log("🔓 Unlocked:", !stillLocked ? "✅ YES" : "❌ NO");
    console.log("🏷️  Delisted:", !stillListed ? "✅ YES" : "❌ NO");

    // Buyer can now use owner functions
    try {
        const buyerOwnerView = await lockx.connect(buyer).getFullLockbox(tokenId);
        console.log("✅ Buyer can now use owner functions");
        console.log("   ETH:", ethers.formatEther(buyerOwnerView.lockboxETH));
        console.log("   USDC:", ethers.formatUnits(buyerOwnerView.erc20Tokens[0].balance, 6));
    } catch (error) {
        console.log("❌ Buyer cannot access owner functions:", error.message);
    }

    // Anyone can still view via public function
    const publicView = await lockx.connect(seller).viewLockboxContents(tokenId);
    console.log("👀 Public can still view contents:");
    console.log("   ETH:", ethers.formatEther(publicView.lockboxETH));
    console.log("   USDC:", ethers.formatUnits(publicView.erc20Tokens[0].balance, 6));

    console.log("\n🎉 Marketplace demo completed!");
    console.log("\n📊 Summary:");
    console.log("============");
    console.log("✅ Public transparency via viewLockboxContents()");
    console.log("✅ Owner privacy via getFullLockbox()");
    console.log("✅ Buyers can inspect before purchasing");
    console.log("✅ Marketplace functionality works perfectly");
}

if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;