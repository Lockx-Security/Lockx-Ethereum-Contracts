template SimpleCommitment() {
    signal private input balance;
    signal private input nftId;
    signal private input salt;
    signal input commitment;
    
    // Create commitment using simple hash (multiplication for testing)
    signal intermediate;
    intermediate <== balance * nftId;
    commitment === intermediate + salt;
}

component main = SimpleCommitment();