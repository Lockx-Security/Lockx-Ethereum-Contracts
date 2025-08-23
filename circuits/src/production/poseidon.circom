// Poseidon hash implementation for production use
// Based on the Poseidon permutation with t=3 (2 inputs + 1 capacity)

include "./poseidon_constants.circom";

template Sigma() {
    signal input in;
    signal output out;

    signal in2;
    signal in4;
    
    in2 <== in*in;
    in4 <== in2*in2;
    out <== in4*in;
}

template Ark(t, C) {
    signal input in[t];
    signal output out[t];

    for (var i=0; i<t; i++) {
        out[i] <== in[i] + C;
    }
}

template Mix(t) {
    signal input in[t];
    signal output out[t];

    var M[3][3] = get_mds_matrix();
    var lc;
    
    if (t == 3) {
        for (var i=0; i<3; i++) {
            lc = 0;
            for (var j=0; j<3; j++) {
                lc += M[i][j] * in[j];
            }
            out[i] <== lc;
        }
    } else if (t == 4) {
        // For 4 inputs, use identity matrix extension
        for (var i=0; i<t; i++) {
            lc = 0;
            for (var j=0; j<t; j++) {
                if (i < 3 && j < 3) {
                    lc += M[i][j] * in[j];
                } else if (i == j) {
                    lc += in[j];
                }
            }
            out[i] <== lc;
        }
    }
}

template Poseidon(nInputs) {
    signal input inputs[nInputs];
    signal output out;

    // Constants for Poseidon with BN254 curve
    var t = nInputs + 1;
    var nRoundsF = 8;
    var nRoundsP = 57;
    var C[214] = get_round_constants();
    
    component ark[nRoundsF + nRoundsP];
    component sigmaF[nRoundsF][t];
    component sigmaP[nRoundsP];
    component mix[nRoundsF + nRoundsP];

    var k = 0;
    signal state[nRoundsF + nRoundsP + 1][t];

    // Initialize state
    for (var j=0; j<nInputs; j++) {
        state[0][j] <== inputs[j];
    }
    state[0][nInputs] <== 0;

    // First full rounds
    for (var r=0; r<nRoundsF/2; r++) {
        ark[r] = Ark(t, C[k]);
        k++;
        for (var j=0; j<t; j++) {
            ark[r].in[j] <== state[r][j];
        }

        for (var j=0; j<t; j++) {
            sigmaF[r][j] = Sigma();
            sigmaF[r][j].in <== ark[r].out[j];
        }

        mix[r] = Mix(t);
        for (var j=0; j<t; j++) {
            mix[r].in[j] <== sigmaF[r][j].out;
        }

        for (var j=0; j<t; j++) {
            state[r+1][j] <== mix[r].out[j];
        }
    }

    // Partial rounds
    for (var r=nRoundsF/2; r<nRoundsF/2+nRoundsP; r++) {
        ark[r] = Ark(t, C[k]);
        k++;
        for (var j=0; j<t; j++) {
            ark[r].in[j] <== state[r][j];
        }

        sigmaP[r-nRoundsF/2] = Sigma();
        sigmaP[r-nRoundsF/2].in <== ark[r].out[0];

        mix[r] = Mix(t);
        mix[r].in[0] <== sigmaP[r-nRoundsF/2].out;
        for (var j=1; j<t; j++) {
            mix[r].in[j] <== ark[r].out[j];
        }

        for (var j=0; j<t; j++) {
            state[r+1][j] <== mix[r].out[j];
        }
    }

    // Second full rounds
    for (var r=nRoundsF/2+nRoundsP; r<nRoundsF+nRoundsP; r++) {
        ark[r] = Ark(t, C[k]);
        k++;
        for (var j=0; j<t; j++) {
            ark[r].in[j] <== state[r][j];
        }

        for (var j=0; j<t; j++) {
            sigmaF[r-nRoundsP][j] = Sigma();
            sigmaF[r-nRoundsP][j].in <== ark[r].out[j];
        }

        mix[r] = Mix(t);
        for (var j=0; j<t; j++) {
            mix[r].in[j] <== sigmaF[r-nRoundsP][j].out;
        }

        for (var j=0; j<t; j++) {
            state[r+1][j] <== mix[r].out[j];
        }
    }

    out <== state[nRoundsF + nRoundsP][0];
}