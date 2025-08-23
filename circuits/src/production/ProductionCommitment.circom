include "./poseidon.circom";

/**
 * Production Lockx Commitment Circuit
 * Uses Poseidon hash for cryptographic security
 * This is what you would deploy to mainnet
 */
template LockxCommitment() {
    signal input commitment;
    signal private input balance;
    signal private input nftId;
    signal private input salt;
    
    component hasher = Poseidon(3);
    hasher.inputs[0] <== balance;
    hasher.inputs[1] <== nftId;
    hasher.inputs[2] <== salt;
    
    commitment === hasher.out;
}

component main = LockxCommitment();