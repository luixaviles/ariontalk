#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

DRY_RUN=""
NO_GIT_CHECKS=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN="--dry-run"; shift ;;
    --no-git-checks) NO_GIT_CHECKS="--no-git-checks"; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "${ROOT_DIR}"

# Dependency-ordered list — core first, widget last
PACKAGES=(
  "@ariontalk/core"
  "@ariontalk/engine-gemini"
  "@ariontalk/plugin-silero-vad"
  "@ariontalk/widget"
)

if [ -n "${DRY_RUN}" ]; then
  echo "==> DRY RUN — no packages will be published"
fi

# Verify npm auth
if ! npm whoami &>/dev/null; then
  echo "ERROR: Not logged in to npm. Run 'npm login' first."
  exit 1
fi

echo "==> Building all packages"
pnpm build

for PKG in "${PACKAGES[@]}"; do
  echo ""
  echo "==> Publishing ${PKG}"
  pnpm --filter "${PKG}" publish --access public ${NO_GIT_CHECKS} ${DRY_RUN}
done

echo ""
if [ -n "${DRY_RUN}" ]; then
  echo "DRY RUN COMPLETE. No packages were published."
else
  echo "ALL PACKAGES PUBLISHED."
  echo ""
  echo "==> Post-publish verification"
  for PKG in "${PACKAGES[@]}"; do
    echo ""
    echo "--- ${PKG} ---"
    npm view "${PKG}" version 2>/dev/null || echo "  WARNING: not yet visible on npm (may take a moment)"
  done
  echo ""
  echo "==> CDN check (may take a few minutes to propagate)"
  echo "  curl -I https://cdn.jsdelivr.net/npm/@ariontalk/widget@latest/dist/ariontalk.js"
fi
