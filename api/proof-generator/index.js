const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const snarkjs = require('snarkjs');
const { buildPoseidon } = require('circomlibjs');
const { Storage } = require('@google-cloud/storage');
const path = require('path');
const fs = require('fs').promises;

require('dotenv').config();

const app = express();
const storage = new Storage();

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 requests per window
    message: 'Too many proof generation requests, please try again later'
});

app.use('/api/generate-proof', limiter);

// Cache for circuit files
const circuitCache = new Map();
let poseidon = null;

// Initialize Poseidon
async function initPoseidon() {
    if (!poseidon) {
        poseidon = await buildPoseidon();
    }
    return poseidon;
}

// Load circuit files from Cloud Storage or local
async function loadCircuitFiles(circuitType) {
    const cacheKey = `${circuitType}_files`;
    
    if (circuitCache.has(cacheKey)) {
        return circuitCache.get(cacheKey);
    }
    
    try {
        let wasmBuffer, zkeyBuffer;
        
        if (process.env.USE_CLOUD_STORAGE === 'true') {
            // Load from Google Cloud Storage
            const bucket = storage.bucket(process.env.CIRCUIT_BUCKET);
            
            const wasmFile = bucket.file(`${circuitType}/${circuitType}.wasm`);
            const zkeyFile = bucket.file(`keys/${circuitType}_final.zkey`);
            
            [wasmBuffer] = await wasmFile.download();
            [zkeyBuffer] = await zkeyFile.download();
        } else {
            // Load from local files for development
            const circuitPath = path.join(__dirname, '../../circuits');
            wasmBuffer = await fs.readFile(path.join(circuitPath, `${circuitType}_js/${circuitType}.wasm`));
            zkeyBuffer = await fs.readFile(path.join(circuitPath, `${circuitType}_final.zkey`));
        }
        
        const files = { wasmBuffer, zkeyBuffer };
        circuitCache.set(cacheKey, files);
        
        return files;
    } catch (error) {
        console.error(`Error loading circuit files for ${circuitType}:`, error);
        throw new Error(`Failed to load circuit files: ${error.message}`);
    }
}

// Format proof for Solidity
function formatProofForSolidity(proof) {
    return {
        a: [proof.pi_a[0], proof.pi_a[1]],
        b: [[proof.pi_b[0][1], proof.pi_b[0][0]], 
            [proof.pi_b[1][1], proof.pi_b[1][0]]],
        c: [proof.pi_c[0], proof.pi_c[1]],
        protocol: 'groth16'
    };
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        service: 'lockx-proof-generator',
        version: '1.0.0'
    });
});

// Get supported circuits
app.get('/api/circuits', (req, res) => {
    res.json({
        supported: ['commitment', 'deposit', 'withdraw'],
        details: {
            commitment: {
                inputs: ['commitment', 'balance', 'nftId', 'salt'],
                publicSignals: ['commitment']
            },
            deposit: {
                inputs: ['oldCommitment', 'newCommitment', 'depositAmount', 'nftId', 'oldBalance', 'salt'],
                publicSignals: ['oldCommitment', 'newCommitment', 'depositAmount']
            },
            withdraw: {
                inputs: ['commitment', 'nullifierHash', 'recipient', 'amount', 'nftId', 'balance', 'salt', 'nullifier'],
                publicSignals: ['commitment', 'nullifierHash', 'recipient', 'amount']
            }
        }
    });
});

// Generate commitment locally (for testing)
app.post('/api/generate-commitment', async (req, res) => {
    try {
        const { balance, nftId, salt } = req.body;
        
        if (!balance || !nftId || !salt) {
            return res.status(400).json({ 
                error: 'Missing required inputs: balance, nftId, salt' 
            });
        }
        
        const poseidonHash = await initPoseidon();
        const inputs = [BigInt(balance), BigInt(nftId), BigInt(salt)];
        const hash = poseidonHash.F.toString(poseidonHash(inputs));
        
        res.json({
            commitment: hash,
            inputs: {
                balance: balance.toString(),
                nftId: nftId.toString(),
                salt: salt.toString()
            }
        });
    } catch (error) {
        console.error('Commitment generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate commitment',
            details: error.message 
        });
    }
});

// Main proof generation endpoint
app.post('/api/generate-proof', async (req, res) => {
    const startTime = Date.now();
    
    try {
        const { circuitType, inputs } = req.body;
        
        // Validate circuit type
        if (!['commitment', 'deposit', 'withdraw'].includes(circuitType)) {
            return res.status(400).json({ 
                error: 'Invalid circuit type. Must be: commitment, deposit, or withdraw' 
            });
        }
        
        // Validate inputs based on circuit type
        const requiredInputs = {
            commitment: ['commitment', 'balance', 'nftId', 'salt'],
            deposit: ['oldCommitment', 'newCommitment', 'depositAmount', 'nftId', 'oldBalance', 'salt'],
            withdraw: ['commitment', 'nullifierHash', 'recipient', 'amount', 'nftId', 'balance', 'salt', 'nullifier']
        };
        
        const missing = requiredInputs[circuitType].filter(field => !inputs[field]);
        if (missing.length > 0) {
            return res.status(400).json({ 
                error: `Missing required inputs: ${missing.join(', ')}` 
            });
        }
        
        console.log(`Generating ${circuitType} proof...`);
        
        // Load circuit files
        const { wasmBuffer, zkeyBuffer } = await loadCircuitFiles(circuitType);
        
        // Generate proof
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            inputs,
            wasmBuffer,
            zkeyBuffer
        );
        
        // Format for Solidity
        const solidityProof = formatProofForSolidity(proof);
        
        const generationTime = Date.now() - startTime;
        console.log(`Proof generated in ${generationTime}ms`);
        
        res.json({
            success: true,
            proof: solidityProof,
            publicSignals,
            circuitType,
            generationTime,
            proofSize: JSON.stringify(solidityProof).length
        });
        
    } catch (error) {
        console.error('Proof generation error:', error);
        res.status(500).json({ 
            error: 'Failed to generate proof',
            details: error.message,
            circuitType: req.body.circuitType
        });
    }
});

// Verify proof endpoint (for testing)
app.post('/api/verify-proof', async (req, res) => {
    try {
        const { circuitType, proof, publicSignals } = req.body;
        
        if (!['commitment', 'deposit', 'withdraw'].includes(circuitType)) {
            return res.status(400).json({ error: 'Invalid circuit type' });
        }
        
        // Load verification key
        const vKeyPath = path.join(__dirname, `../../circuits/${circuitType}_verification_key.json`);
        const vKey = JSON.parse(await fs.readFile(vKeyPath, 'utf8'));
        
        // Verify the proof
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);
        
        res.json({
            valid: isValid,
            circuitType,
            publicSignals
        });
        
    } catch (error) {
        console.error('Proof verification error:', error);
        res.status(500).json({ 
            error: 'Failed to verify proof',
            details: error.message 
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, async () => {
    console.log(`🚀 Lockx Proof Generator API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Cloud Storage: ${process.env.USE_CLOUD_STORAGE === 'true' ? 'Enabled' : 'Disabled'}`);
    
    // Pre-initialize Poseidon
    await initPoseidon();
    console.log('✅ Poseidon hash initialized');
    
    // Pre-load circuits if specified
    if (process.env.PRELOAD_CIRCUITS === 'true') {
        console.log('Pre-loading circuit files...');
        for (const circuit of ['commitment', 'deposit', 'withdraw']) {
            try {
                await loadCircuitFiles(circuit);
                console.log(`  ✓ ${circuit} circuit loaded`);
            } catch (error) {
                console.error(`  ✗ Failed to load ${circuit}: ${error.message}`);
            }
        }
    }
    
    console.log('🔐 Ready to generate ZK proofs!');
});