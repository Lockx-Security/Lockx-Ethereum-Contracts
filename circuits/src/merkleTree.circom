include "../../../node_modules/circomlib/circuits/poseidon.circom";
include "../../../node_modules/circomlib/circuits/switcher.circom";

/**
 * Production Merkle Tree Checker using Poseidon hash
 */
template MerkleTreeChecker(depth) {
    signal input leaf;
    signal input root;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    
    component hashers[depth];
    component switchers[depth];
    
    signal currentHash[depth + 1];
    currentHash[0] <== leaf;
    
    for (var i = 0; i < depth; i++) {
        // Determine order based on path index
        switchers[i] = Switcher();
        switchers[i].sel <== pathIndices[i];
        switchers[i].L <== currentHash[i];
        switchers[i].R <== pathElements[i];
        
        // Hash the pair using Poseidon
        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== switchers[i].outL;
        hashers[i].inputs[1] <== switchers[i].outR;
        currentHash[i + 1] <== hashers[i].out;
    }
    
    // Verify root matches
    root === currentHash[depth];
}

/**
 * Switcher helper - swaps inputs based on selector
 */
template Switcher() {
    signal input sel;
    signal input L;
    signal input R;
    signal output outL;
    signal output outR;
    
    signal aux;
    
    aux <== (R - L) * sel;
    outL <== L + aux;
    outR <== R - aux;
}