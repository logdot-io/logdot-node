#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

BUMP=false

for arg in "$@"; do
  case "$arg" in
    --bump) BUMP=true ;;
    *)
      echo "Usage: $0 [--bump]"
      echo "  --bump  Bump patch version before publishing"
      exit 1
      ;;
  esac
done

if [ "$BUMP" = true ]; then
  echo "Bumping patch version..."
  npm version patch --no-git-tag-version
fi

VERSION=$(node -p "require('./package.json').version")
echo "Publishing @logdot-io/sdk v${VERSION}..."

echo "Building..."
npm run build

echo "Publishing to npm..."
npm publish --access public

echo "Successfully published @logdot-io/sdk v${VERSION}"
