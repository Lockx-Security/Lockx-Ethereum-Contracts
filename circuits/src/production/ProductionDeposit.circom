include "./poseidon.circom";

/**
 * Production Deposit Circuit
 * Proves deposit to hidden NFT with proper balance update
 */
template LockxDeposit() {
    // Public inputs
    signal input oldCommitment;
    signal input newCommitment;  
    signal input depositAmount;
    
    // Private inputs
    signal private input nftId;
    signal private input oldBalance;
    signal private input salt;
    
    // Verify old commitment
    component oldHasher = Poseidon(3);
    oldHasher.inputs[0] <== oldBalance;
    oldHasher.inputs[1] <== nftId;
    oldHasher.inputs[2] <== salt;
    oldCommitment === oldHasher.out;
    
    // Calculate new balance
    signal newBalance;
    newBalance <== oldBalance + depositAmount;
    
    // Verify new commitment with updated balance
    component newHasher = Poseidon(3);
    newHasher.inputs[0] <== newBalance;
    newHasher.inputs[1] <== nftId;
    newHasher.inputs[2] <== salt;
    newCommitment === newHasher.out;
    
    // Ensure deposit is positive (prevent negative deposits)
    component isPositive = GreaterThan(252);
    isPositive.in[0] <== depositAmount;
    isPositive.in[1] <== 0;
    isPositive.out === 1;
}

template GreaterThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
    
    component lt = LessThan(n);
    lt.in[0] <== in[1];
    lt.in[1] <== in[0];
    out <== lt.out;
}

template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;
    
    signal bits[n];
    signal sum;
    
    var diff = in[0] - in[1] + (1 << n);
    
    component n2b = Num2Bits(n+1);
    n2b.in <== diff;
    
    out <== 1 - n2b.out[n];
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];
    
    var lc = 0;
    var e2 = 1;
    
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lc += out[i] * e2;
        e2 = e2 * 2;
    }
    
    lc === in;
}

component main = LockxDeposit();