/**
 * Frontend ZK Proof Service
 * This is what your React/Vue/etc app would use to generate proofs
 */

class LockxZKService {
    constructor(apiUrl) {
        // In production, this would be your deployed Cloud Run URL
        this.apiUrl = apiUrl || 'https://lockx-proof-generator-xxxxx-uc.a.run.app';
    }
    
    /**
     * Generate a random salt for commitments
     */
    generateSalt() {
        const bytes = new Uint8Array(31);
        crypto.getRandomValues(bytes);
        return '0x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * Generate a nullifier for withdrawals
     */
    generateNullifier() {
        return this.generateSalt(); // Same as salt, just different purpose
    }
    
    /**
     * Create initial commitment for a new lockbox
     */
    async createInitialCommitment(nftId) {
        const salt = this.generateSalt();
        const balance = "0"; // Start with 0 balance
        
        // Generate commitment on server
        const response = await fetch(`${this.apiUrl}/api/generate-commitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                balance,
                nftId: nftId.toString(),
                salt
            })
        });
        
        const result = await response.json();
        
        // Save salt locally (encrypted in production!)
        this.savePrivateData(nftId, { salt, balance });
        
        return {
            commitment: result.commitment,
            salt // Return for user to backup
        };
    }
    
    /**
     * Generate proof for depositing funds
     */
    async generateDepositProof(nftId, depositAmountWei) {
        // Retrieve private data
        const privateData = this.getPrivateData(nftId);
        if (!privateData) {
            throw new Error('No private data found for NFT #' + nftId);
        }
        
        const oldBalance = privateData.balance || "0";
        const newBalance = (BigInt(oldBalance) + BigInt(depositAmountWei)).toString();
        
        // Generate old commitment
        const oldCommitmentResponse = await fetch(`${this.apiUrl}/api/generate-commitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                balance: oldBalance,
                nftId: nftId.toString(),
                salt: privateData.salt
            })
        });
        const { commitment: oldCommitment } = await oldCommitmentResponse.json();
        
        // Generate new commitment
        const newCommitmentResponse = await fetch(`${this.apiUrl}/api/generate-commitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                balance: newBalance,
                nftId: nftId.toString(),
                salt: privateData.salt
            })
        });
        const { commitment: newCommitment } = await newCommitmentResponse.json();
        
        // Generate ZK proof
        const proofResponse = await fetch(`${this.apiUrl}/api/generate-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                circuitType: 'deposit',
                inputs: {
                    oldCommitment,
                    newCommitment,
                    depositAmount: depositAmountWei,
                    nftId: nftId.toString(),
                    oldBalance,
                    salt: privateData.salt
                }
            })
        });
        
        const proofResult = await proofResponse.json();
        
        if (!proofResult.success) {
            throw new Error('Proof generation failed: ' + proofResult.error);
        }
        
        // Update local balance
        privateData.balance = newBalance;
        this.savePrivateData(nftId, privateData);
        
        return {
            proof: proofResult.proof,
            newCommitment,
            publicSignals: proofResult.publicSignals,
            newBalance: this.formatBalance(newBalance)
        };
    }
    
    /**
     * Generate proof for withdrawing funds
     */
    async generateWithdrawProof(nftId, recipientAddress, withdrawAmountWei) {
        const privateData = this.getPrivateData(nftId);
        if (!privateData) {
            throw new Error('No private data found for NFT #' + nftId);
        }
        
        // Check sufficient balance
        if (BigInt(privateData.balance) < BigInt(withdrawAmountWei)) {
            throw new Error('Insufficient balance');
        }
        
        // Generate nullifier
        const nullifier = this.generateNullifier();
        const nullifierHash = await this.hashNullifier(nullifier);
        
        // Generate commitment
        const commitmentResponse = await fetch(`${this.apiUrl}/api/generate-commitment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                balance: privateData.balance,
                nftId: nftId.toString(),
                salt: privateData.salt
            })
        });
        const { commitment } = await commitmentResponse.json();
        
        // Generate ZK proof
        const proofResponse = await fetch(`${this.apiUrl}/api/generate-proof`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                circuitType: 'withdraw',
                inputs: {
                    commitment,
                    nullifierHash,
                    recipient: BigInt(recipientAddress).toString(),
                    amount: withdrawAmountWei,
                    nftId: nftId.toString(),
                    balance: privateData.balance,
                    salt: privateData.salt,
                    nullifier
                }
            })
        });
        
        const proofResult = await proofResponse.json();
        
        if (!proofResult.success) {
            throw new Error('Proof generation failed: ' + proofResult.error);
        }
        
        // Update local balance
        const newBalance = (BigInt(privateData.balance) - BigInt(withdrawAmountWei)).toString();
        privateData.balance = newBalance;
        this.savePrivateData(nftId, privateData);
        
        return {
            proof: proofResult.proof,
            nullifier,
            publicSignals: proofResult.publicSignals,
            remainingBalance: this.formatBalance(newBalance)
        };
    }
    
    /**
     * Hash nullifier (simplified - use actual hash in production)
     */
    async hashNullifier(nullifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(nullifier);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * Save private data locally (encrypted in production!)
     */
    savePrivateData(nftId, data) {
        // In production, encrypt this data!
        const key = `lockx_private_${nftId}`;
        localStorage.setItem(key, JSON.stringify(data));
    }
    
    /**
     * Get private data
     */
    getPrivateData(nftId) {
        const key = `lockx_private_${nftId}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
    }
    
    /**
     * Format balance for display
     */
    formatBalance(balanceWei) {
        const eth = Number(balanceWei) / 1e18;
        return eth.toFixed(4) + ' ETH';
    }
    
    /**
     * Export private data for backup
     */
    exportPrivateData(nftId) {
        const data = this.getPrivateData(nftId);
        if (!data) {
            throw new Error('No private data found');
        }
        
        return {
            nftId,
            salt: data.salt,
            balance: data.balance,
            timestamp: new Date().toISOString(),
            warning: 'KEEP THIS SECRET! Anyone with this data can prove ownership of your funds.'
        };
    }
    
    /**
     * Import private data from backup
     */
    importPrivateData(nftId, salt, balance) {
        this.savePrivateData(nftId, { salt, balance: balance || "0" });
    }
}

// Example usage
async function exampleUsage() {
    // Initialize service with your deployed API URL
    const zkService = new LockxZKService('https://your-api-url.run.app');
    
    try {
        // 1. Create initial commitment for NFT #42
        console.log('Creating private lockbox...');
        const { commitment, salt } = await zkService.createInitialCommitment(42);
        console.log('Commitment:', commitment);
        console.log('Salt (SAVE THIS!):', salt);
        
        // 2. Generate deposit proof for 1.5 ETH
        console.log('\nGenerating deposit proof...');
        const depositProof = await zkService.generateDepositProof(
            42,
            "1500000000000000000" // 1.5 ETH in wei
        );
        console.log('Proof generated! New balance:', depositProof.newBalance);
        
        // 3. Generate withdrawal proof for 0.8 ETH
        console.log('\nGenerating withdrawal proof...');
        const withdrawProof = await zkService.generateWithdrawProof(
            42,
            "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7", // recipient
            "800000000000000000" // 0.8 ETH in wei
        );
        console.log('Proof generated! Remaining balance:', withdrawProof.remainingBalance);
        
        // 4. Export backup
        const backup = zkService.exportPrivateData(42);
        console.log('\nBackup data:', JSON.stringify(backup, null, 2));
        
    } catch (error) {
        console.error('Error:', error);
    }
}

// For Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LockxZKService;
}

// For browser
if (typeof window !== 'undefined') {
    window.LockxZKService = LockxZKService;
}