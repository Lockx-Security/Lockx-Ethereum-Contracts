include "../../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../../node_modules/circomlib/circuits/comparators.circom";
include "../../../../node_modules/circomlib/circuits/bitify.circom";
include "../merkleTree.circom";

/**
 * Production Private Deposit Circuit
 * Proves ownership of an NFT and updates balance privately
 */
template PrivateDeposit(depth) {
    // Public inputs
    signal input merkleRoot;
    signal input newCommitment;
    signal input depositAmount;
    
    // Private inputs
    signal private input nftId;
    signal private input oldBalance;
    signal private input newBalance;
    signal private input salt;
    signal private input pathElements[depth];
    signal private input pathIndices[depth];
    
    // Verify balance update is correct
    component balanceCheck = IsEqual();
    balanceCheck.in[0] <== oldBalance + depositAmount;
    balanceCheck.in[1] <== newBalance;
    balanceCheck.out === 1;
    
    // Ensure deposit amount is positive
    component positiveCheck = GreaterThan(248);
    positiveCheck.in[0] <== depositAmount;
    positiveCheck.in[1] <== 0;
    positiveCheck.out === 1;
    
    // Create old commitment
    component oldCommitmentHasher = Poseidon(3);
    oldCommitmentHasher.inputs[0] <== oldBalance;
    oldCommitmentHasher.inputs[1] <== nftId;
    oldCommitmentHasher.inputs[2] <== salt;
    signal oldCommitment <== oldCommitmentHasher.out;
    
    // Verify merkle proof for old commitment
    component merkleProof = MerkleTreeChecker(depth);
    merkleProof.leaf <== oldCommitment;
    merkleProof.root <== merkleRoot;
    for (var i = 0; i < depth; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
    
    // Create and verify new commitment
    component newCommitmentHasher = Poseidon(3);
    newCommitmentHasher.inputs[0] <== newBalance;
    newCommitmentHasher.inputs[1] <== nftId;
    newCommitmentHasher.inputs[2] <== salt;
    newCommitment === newCommitmentHasher.out;
}

component main {public [merkleRoot, newCommitment, depositAmount]} = PrivateDeposit(20);