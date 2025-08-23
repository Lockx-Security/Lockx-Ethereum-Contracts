include "../../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../../node_modules/circomlib/circuits/comparators.circom";
include "../../../../node_modules/circomlib/circuits/bitify.circom";
include "../merkleTree.circom";

/**
 * Production Private Withdrawal Circuit
 * Proves authorization to withdraw without revealing source NFT
 */
template PrivateWithdraw(depth) {
    // Public inputs
    signal input withdrawalRoot;
    signal input nullifierHash;
    signal input recipient;
    signal input amount;
    
    // Private inputs
    signal private input nftId;
    signal private input balance;
    signal private input salt;
    signal private input nullifier;
    signal private input pathElements[depth];
    signal private input pathIndices[depth];
    
    // Verify nullifier hash
    component nullifierHasher = Poseidon(1);
    nullifierHasher.inputs[0] <== nullifier;
    nullifierHash === nullifierHasher.out;
    
    // Verify sufficient balance
    component balanceCheck = GreaterEqThan(248);
    balanceCheck.in[0] <== balance;
    balanceCheck.in[1] <== amount;
    balanceCheck.out === 1;
    
    // Ensure amount is positive
    component positiveCheck = GreaterThan(248);
    positiveCheck.in[0] <== amount;
    positiveCheck.in[1] <== 0;
    positiveCheck.out === 1;
    
    // Create withdrawal commitment
    component commitmentHasher = Poseidon(5);
    commitmentHasher.inputs[0] <== nftId;
    commitmentHasher.inputs[1] <== balance;
    commitmentHasher.inputs[2] <== salt;
    commitmentHasher.inputs[3] <== recipient;
    commitmentHasher.inputs[4] <== nullifier;
    signal commitment <== commitmentHasher.out;
    
    // Verify merkle proof
    component merkleProof = MerkleTreeChecker(depth);
    merkleProof.leaf <== commitment;
    merkleProof.root <== withdrawalRoot;
    for (var i = 0; i < depth; i++) {
        merkleProof.pathElements[i] <== pathElements[i];
        merkleProof.pathIndices[i] <== pathIndices[i];
    }
}

component main {public [withdrawalRoot, nullifierHash, recipient, amount]} = PrivateWithdraw(20);