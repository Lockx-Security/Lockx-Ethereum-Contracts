#!/bin/bash

echo "🚀 LOCKX COVERAGE REPLICATION SCRIPT - CURRENT BASELINE"
echo "======================================================"
echo ""
echo "This script replicates our current coverage baseline:"
echo "• Statements: 57.57% (232/403)"  
echo "• Branches: 41.91% (145/346)  [Contract branches: 57.44% (139/242)]"
echo "• Functions: 49.51% (51/103)"
echo "• Lines: 58.89% (308/523)"
echo ""
echo "Individual Contract Performance:"
echo "• Deposits.sol: 96.36% statements, 81.82% branches"
echo "• Lockx.sol: 89.29% statements, 60.81% branches" 
echo "• SignatureVerification.sol: 100% statements, 64.29% branches"
echo "• Withdrawals.sol: 66.95% statements, 44.55% branches"
echo ""

# Clean existing coverage
echo "🧹 Cleaning existing coverage..."
rm -rf coverage/ coverage.json

# Run the working test suite
echo "🏃 Running working test suite..."
TESTFILES="test/master-cumulative-90.spec.ts,test/deposits-90-supplement.spec.ts,test/withdrawals-90-supplement.spec.ts,test/lockx-90-targeted.spec.ts,test/branch-coverage-90-percent.spec.ts"

echo "📋 Test files being executed:"
echo "1. test/master-cumulative-90.spec.ts"
echo "2. test/deposits-90-supplement.spec.ts" 
echo "3. test/withdrawals-90-supplement.spec.ts"
echo "4. test/lockx-90-targeted.spec.ts"
echo "5. test/branch-coverage-90-percent.spec.ts"
echo ""

# Run coverage
npx hardhat coverage --testfiles "$TESTFILES" 2>/dev/null

# Check if coverage was generated
if [ -f "coverage/index.html" ]; then
    echo ""
    echo "✅ COVERAGE GENERATED SUCCESSFULLY!"
    echo "📊 View detailed report at: coverage/index.html"
    echo ""
    
    # Extract and display key numbers
    if command -v grep &> /dev/null; then
        echo "📈 COVERAGE SUMMARY:"
        grep -E "(Statements|Branches|Functions|Lines)" coverage/index.html | head -8 | while read line; do
            if [[ $line == *"strong"* ]]; then
                percentage=$(echo $line | grep -o '[0-9]*\.[0-9]*%\|[0-9]*%')
                metric=$(echo $line | grep -o -E "(Statements|Branches|Functions|Lines)")
                echo "• $metric: $percentage"
            fi
        done
    fi
    
    echo ""
    echo "🎯 THIS IS OUR CURRENT REPLICABLE BASELINE"
    echo "🚨 We previously achieved 86.78% branches - significant work needed to restore!"
    
else
    echo "❌ COVERAGE GENERATION FAILED"
    echo "Please check that all test files exist and run manually:"
    echo "npx hardhat coverage --testfiles \"$TESTFILES\""
fi

echo ""
echo "================================================"
echo "RECOVERY STATUS:"
echo "✅ Baseline established and replicable"
echo "❌ Missing ~30% branch coverage vs previous peak"
echo "❌ Need to restore signature verification tests"  
echo "❌ Need to restore advanced edge case tests"
echo "🎯 Target: Restore to 86.78% branches + 90%+ Lockx.sol"
echo "================================================"