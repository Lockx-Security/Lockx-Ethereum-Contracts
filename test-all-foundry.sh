#!/bin/bash

# ============================================================================
# FOUNDRY TEST RUNNER - SIMPLE VERSION
# One command to run all Foundry tests (takes ~10-15 minutes)
# ============================================================================

echo "🚀 Running ALL Foundry Tests"
echo "This will take approximately 10-15 minutes..."
echo ""

FORGE="/usr/local/bin/forge"
START=$(date +%s)

# Clean start
echo "🧹 Cleaning..."
rm -rf cache out 2>/dev/null
$FORGE cache clean 2>/dev/null

# Build base
echo "📦 Building contracts..."
$FORGE build --skip test --force --silent 2>/dev/null

# Run all tests one by one
echo "🧪 Running tests..."
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0
COUNT=0

for file in test/foundry/*.t.sol; do
    if [ -f "$file" ]; then
        COUNT=$((COUNT + 1))
        NAME=$(basename "$file" .t.sol)
        printf "[%2d/83] %-40s " "$COUNT" "$NAME"
        
        # Compile
        $FORGE build "$file" --silent 2>/dev/null
        
        # Run
        OUTPUT=$($FORGE test --match-contract "^${NAME}$" 2>&1)
        
        if echo "$OUTPUT" | grep -q "passed"; then
            P=$(echo "$OUTPUT" | grep -oE "[0-9]+ passed" | grep -oE "[0-9]+" | tail -1)
            F=$(echo "$OUTPUT" | grep -oE "[0-9]+ failed" | grep -oE "[0-9]+" | tail -1)
            TOTAL_PASSED=$((TOTAL_PASSED + ${P:-0}))
            TOTAL_FAILED=$((TOTAL_FAILED + ${F:-0}))
            
            # Extract test names
            TEST_NAMES=$(echo "$OUTPUT" | grep -oE "\[PASS\] [^(]+" | sed 's/\[PASS\] /• /')
            FAIL_NAMES=$(echo "$OUTPUT" | grep -oE "\[FAIL\] [^(]+" | sed 's/\[FAIL\] /• ❌ /')
            
            if [ "${F:-0}" -eq 0 ]; then
                echo "✅ ${P:-0} tests"
                if [ -n "$TEST_NAMES" ]; then
                    echo "$TEST_NAMES" | sed 's/^/    /'
                fi
            else
                echo "⚠️  ${P:-0} pass, ${F:-0} fail"
                if [ -n "$FAIL_NAMES" ]; then
                    echo "$FAIL_NAMES" | sed 's/^/    /'
                fi
            fi
        else
            echo "⏭️  Skip"
        fi
    fi
done

END=$(date +%s)
DURATION=$((END - START))

echo ""
echo "============================================"
echo "✅ COMPLETE"
echo "============================================"
echo "Tests passed: $TOTAL_PASSED"
echo "Tests failed: $TOTAL_FAILED"
echo "Time: $((DURATION / 60))m $((DURATION % 60))s"
echo "============================================"