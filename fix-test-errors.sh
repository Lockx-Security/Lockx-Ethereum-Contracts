#!/bin/bash

echo "🔧 Fixing test error name mismatches..."

# The pattern is:
# - tokenURI, locked, getActiveLockboxPublicKeyForToken use NonexistentToken (custom error)
# - getFullLockbox uses ERC721NonexistentToken (OpenZeppelin ERC721 error)

# Fix files that expect wrong error for getFullLockbox
echo "Fixing getFullLockbox error expectations..."
find test -name "*.spec.ts" -exec sed -i '' 's/getFullLockbox.*NonexistentToken/getFullLockbox.*ERC721NonexistentToken/g' {} \;

# Fix remaining ERC721NonexistentToken references that should be NonexistentToken
echo "Fixing remaining error name references..."
find test -name "*.spec.ts" -exec sed -i '' 's/\.be\.revertedWithCustomError.*ERC721NonexistentToken/\.be\.revertedWithCustomError(lockx, "NonexistentToken")/g' {} \;

echo "✅ Test error fixes completed!"