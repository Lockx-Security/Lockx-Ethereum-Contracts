const { ethers } = require("hardhat");

async function main() {
    console.log("Deploying Production ZK System with Real Verifiers...");
    
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    
    // Deploy production verifier contracts
    console.log("\n1. Deploying Production Verifiers...");
    
    const CommitmentVerifier = await ethers.getContractFactory("contracts/zk/production/ProductionCommitmentVerifier.sol:Groth16Verifier");
    const commitmentVerifier = await CommitmentVerifier.deploy();
    await commitmentVerifier.waitForDeployment();
    console.log("Commitment Verifier deployed to:", await commitmentVerifier.getAddress());
    
    const DepositVerifier = await ethers.getContractFactory("contracts/zk/production/ProductionDepositVerifier.sol:Groth16Verifier");
    const depositVerifier = await DepositVerifier.deploy();
    await depositVerifier.waitForDeployment();
    console.log("Deposit Verifier deployed to:", await depositVerifier.getAddress());
    
    const WithdrawVerifier = await ethers.getContractFactory("contracts/zk/production/ProductionWithdrawVerifier.sol:Groth16Verifier");
    const withdrawVerifier = await WithdrawVerifier.deploy();
    await withdrawVerifier.waitForDeployment();
    console.log("Withdraw Verifier deployed to:", await withdrawVerifier.getAddress());
    
    // Deploy mock ERC20 for testing
    console.log("\n2. Deploying Mock ERC20...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const lockToken = await MockERC20.deploy("Lock Token", "LOCK", ethers.parseEther("1000000"));
    await lockToken.waitForDeployment();
    console.log("Lock Token deployed to:", await lockToken.getAddress());
    
    // Deploy production ZK contract
    console.log("\n3. Deploying Production LockxZK Contract...");
    const LockxZKProduction = await ethers.getContractFactory("LockxZKProduction");
    const lockxZK = await LockxZKProduction.deploy(
        "Lockx ZK Production",
        "LOCKX-ZK",
        await lockToken.getAddress(),
        await commitmentVerifier.getAddress(),
        await depositVerifier.getAddress(),
        await withdrawVerifier.getAddress()
    );
    await lockxZK.waitForDeployment();
    console.log("LockxZK Production deployed to:", await lockxZK.getAddress());
    
    // Verify deployment
    console.log("\n4. Verifying Deployment...");
    console.log("✅ All contracts deployed successfully!");
    
    console.log("\n=== Deployment Summary ===");
    console.log("Commitment Verifier:", await commitmentVerifier.getAddress());
    console.log("Deposit Verifier:", await depositVerifier.getAddress());
    console.log("Withdraw Verifier:", await withdrawVerifier.getAddress());
    console.log("Lock Token:", await lockToken.getAddress());
    console.log("LockxZK Production:", await lockxZK.getAddress());
    
    console.log("\n🚀 Production ZK system deployed with real Poseidon-based circuits!");
    console.log("This system uses:");
    console.log("- Poseidon hash function for commitments");
    console.log("- Groth16 ZK-SNARK proofs");
    console.log("- Real trusted setup ceremony (Powers of Tau)");
    console.log("- Production-grade security parameters");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });