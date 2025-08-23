include "../../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../../node_modules/circomlib/circuits/comparators.circom";
include "../../../../node_modules/circomlib/circuits/bitify.circom";

/**
 * Production-ready Balance Commitment Circuit
 * Creates cryptographically secure commitments for NFT balances
 */
template BalanceCommitment() {
    // Public inputs
    signal input publicCommitment;
    
    // Private inputs
    signal private input balance;
    signal private input nftId;
    signal private input salt;
    
    // Range check balance (ensure it fits in 248 bits for field safety)
    component balanceCheck = Num2Bits(248);
    balanceCheck.in <== balance;
    
    // Range check nftId (ensure valid NFT ID)
    component nftCheck = Num2Bits(248);
    nftCheck.in <== nftId;
    
    // Create commitment using Poseidon hash (cryptographically secure)
    component hasher = Poseidon(3);
    hasher.inputs[0] <== balance;
    hasher.inputs[1] <== nftId;
    hasher.inputs[2] <== salt;
    
    // Verify commitment matches
    publicCommitment === hasher.out;
}

component main = BalanceCommitment();