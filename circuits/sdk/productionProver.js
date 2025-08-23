const snarkjs = require("snarkjs");
const crypto = require("crypto");
const { buildPoseidon } = require("circomlibjs");

/**
 * Production ZK Proof Generator for Lockx
 * Uses real Poseidon hash and Groth16 proofs
 */
class LockxProductionProver {
    constructor() {
        this.poseidon = null;
        this.circuits = {
            commitment: {
                wasm: "../ProductionCommitment_js/ProductionCommitment.wasm",
                zkey: "../commitment_final.zkey"
            },
            deposit: {
                wasm: "../ProductionDeposit_js/ProductionDeposit.wasm", 
                zkey: "../deposit_final.zkey"
            },
            withdraw: {
                wasm: "../ProductionWithdraw_js/ProductionWithdraw.wasm",
                zkey: "../withdraw_final.zkey"
            }
        };
    }
    
    async initialize() {
        // Initialize Poseidon hash function
        this.poseidon = await buildPoseidon();
    }
    
    /**
     * Generate a random salt for commitments
     */
    generateSalt() {
        return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    }
    
    /**
     * Generate a nullifier for withdrawals
     */
    generateNullifier() {
        return BigInt("0x" + crypto.randomBytes(31).toString("hex"));
    }
    
    /**
     * Create a commitment using Poseidon hash
     * @param {BigInt} balance - The balance amount
     * @param {BigInt} nftId - The NFT ID
     * @param {BigInt} salt - Random salt
     */
    createCommitment(balance, nftId, salt) {
        const inputs = [balance, nftId, salt];
        const hash = this.poseidon.F.toString(this.poseidon(inputs));
        return BigInt(hash);
    }
    
    /**
     * Generate a commitment proof
     * @param {BigInt} balance - The balance
     * @param {BigInt} nftId - The NFT ID
     * @param {BigInt} salt - The salt used
     */
    async generateCommitmentProof(balance, nftId, salt) {
        const commitment = this.createCommitment(balance, nftId, salt);
        
        const input = {
            commitment: commitment.toString(),
            balance: balance.toString(),
            nftId: nftId.toString(),
            salt: salt.toString()
        };
        
        // Generate the proof
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            this.circuits.commitment.wasm,
            this.circuits.commitment.zkey
        );
        
        // Format proof for Solidity
        const solidityProof = this.formatProofForSolidity(proof);
        
        return {
            proof: solidityProof,
            commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, '0')
        };
    }
    
    /**
     * Generate a deposit proof
     * @param {BigInt} nftId - The NFT ID
     * @param {BigInt} oldBalance - Previous balance
     * @param {BigInt} depositAmount - Amount to deposit
     * @param {BigInt} salt - The salt
     */
    async generateDepositProof(nftId, oldBalance, depositAmount, salt) {
        const oldCommitment = this.createCommitment(oldBalance, nftId, salt);
        const newBalance = oldBalance + depositAmount;
        const newCommitment = this.createCommitment(newBalance, nftId, salt);
        
        const input = {
            oldCommitment: oldCommitment.toString(),
            newCommitment: newCommitment.toString(),
            depositAmount: depositAmount.toString(),
            nftId: nftId.toString(),
            oldBalance: oldBalance.toString(),
            salt: salt.toString()
        };
        
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            this.circuits.deposit.wasm,
            this.circuits.deposit.zkey
        );
        
        const solidityProof = this.formatProofForSolidity(proof);
        
        return {
            proof: solidityProof,
            oldCommitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, '0'),
            newCommitment: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, '0'),
            depositAmount: publicSignals[2]
        };
    }
    
    /**
     * Generate a withdrawal proof
     * @param {BigInt} balance - Current balance
     * @param {BigInt} nftId - The NFT ID
     * @param {BigInt} salt - The salt
     * @param {BigInt} nullifier - Unique nullifier
     * @param {string} recipient - Recipient address
     * @param {BigInt} amount - Amount to withdraw
     */
    async generateWithdrawProof(balance, nftId, salt, nullifier, recipient, amount) {
        const commitment = this.createCommitment(balance, nftId, salt);
        const nullifierHash = this.poseidon.F.toString(this.poseidon([nullifier]));
        
        const input = {
            commitment: commitment.toString(),
            nullifierHash: nullifierHash,
            recipient: BigInt(recipient).toString(),
            amount: amount.toString(),
            nftId: nftId.toString(),
            balance: balance.toString(),
            salt: salt.toString(),
            nullifier: nullifier.toString()
        };
        
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            this.circuits.withdraw.wasm,
            this.circuits.withdraw.zkey
        );
        
        const solidityProof = this.formatProofForSolidity(proof);
        
        return {
            proof: solidityProof,
            commitment: "0x" + BigInt(publicSignals[0]).toString(16).padStart(64, '0'),
            nullifierHash: "0x" + BigInt(publicSignals[1]).toString(16).padStart(64, '0'),
            recipient: "0x" + BigInt(publicSignals[2]).toString(16).padStart(40, '0'),
            amount: publicSignals[3]
        };
    }
    
    /**
     * Format proof for Solidity verifier
     */
    formatProofForSolidity(proof) {
        return ethers.AbiCoder.defaultAbiCoder().encode(
            ["uint256[2]", "uint256[2][2]", "uint256[2]"],
            [
                [proof.pi_a[0], proof.pi_a[1]],
                [[proof.pi_b[0][1], proof.pi_b[0][0]], [proof.pi_b[1][1], proof.pi_b[1][0]]],
                [proof.pi_c[0], proof.pi_c[1]]
            ]
        );
    }
    
    /**
     * Verify a proof locally (for testing)
     */
    async verifyProof(proof, publicSignals, circuitType) {
        const vKey = await snarkjs.zKey.exportVerificationKey(this.circuits[circuitType].zkey);
        return await snarkjs.groth16.verify(vKey, publicSignals, proof);
    }
}

module.exports = LockxProductionProver;