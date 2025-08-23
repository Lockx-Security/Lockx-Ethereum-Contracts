include "./poseidon.circom";

/**
 * Production Withdrawal Circuit
 * Proves authorization to withdraw without revealing source NFT
 */
template LockxWithdraw() {
    // Public inputs
    signal input commitment;
    signal input nullifierHash;
    signal input recipient;
    signal input amount;
    
    // Private inputs
    signal private input nftId;
    signal private input balance;
    signal private input salt;
    signal private input nullifier;
    
    // Verify commitment
    component commitHasher = Poseidon(3);
    commitHasher.inputs[0] <== balance;
    commitHasher.inputs[1] <== nftId;
    commitHasher.inputs[2] <== salt;
    commitment === commitHasher.out;
    
    // Verify nullifier hash
    component nullHasher = Poseidon(1);
    nullHasher.inputs[0] <== nullifier;
    nullifierHash === nullHasher.out;
    
    // Verify sufficient balance
    component balanceCheck = GreaterEqThan(252);
    balanceCheck.in[0] <== balance;
    balanceCheck.in[1] <== amount;
    balanceCheck.out === 1;
    
    // Verify amount is positive
    component positiveCheck = GreaterThan(252);
    positiveCheck.in[0] <== amount;
    positiveCheck.in[1] <== 0;
    positiveCheck.out === 1;
    
    // Create a binding to recipient (prevents front-running)
    signal recipientSquared;
    recipientSquared <== recipient * recipient;
}

template GreaterEqThan(n) {
    signal input in[2];
    signal output out;
    
    component gt = GreaterThan(n);
    gt.in[0] <== in[0];
    gt.in[1] <== in[1];
    
    component eq = IsEqual();
    eq.in[0] <== in[0];
    eq.in[1] <== in[1];
    
    out <== gt.out + eq.out;
}

template IsEqual() {
    signal input in[2];
    signal output out;
    
    signal diff;
    diff <== in[0] - in[1];
    
    component isZero = IsZero();
    isZero.in <== diff;
    out <== isZero.out;
}

template IsZero() {
    signal input in;
    signal output out;
    
    signal inv;
    
    inv <-- in != 0 ? 1/in : 0;
    
    out <== -in*inv + 1;
    in*out === 0;
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

component main = LockxWithdraw();