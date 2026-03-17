#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PACKAGES=("core" "engine-gemini" "plugin-silero-vad" "widget")
SCOPED_PACKAGES=("@ariontalk/core" "@ariontalk/engine-gemini" "@ariontalk/plugin-silero-vad" "@ariontalk/widget")
SKIP_BUILD=false
for arg in "$@"; do
  case $arg in
    --skip-build) SKIP_BUILD=true ;;
  esac
done

TEMP_DIR=$(mktemp -d)
ERRORS=0

cleanup() { rm -rf "${TEMP_DIR}"; }
trap cleanup EXIT

cd "${ROOT_DIR}"

if [ "${SKIP_BUILD}" = true ]; then
  echo "==> Skipping build (--skip-build)"
else
  echo "==> Building all packages"
  pnpm build
fi

# Verify widget types
echo "==> Checking widget TypeScript declarations"
if [ ! -f "packages/widget/dist/index.d.ts" ]; then
  echo "FAIL: packages/widget/dist/index.d.ts not found"
  ERRORS=$((ERRORS + 1))
else
  echo "  OK: widget types exist"
fi

# Pack and inspect each package
for i in "${!PACKAGES[@]}"; do
  PKG="${PACKAGES[$i]}"
  SCOPED="${SCOPED_PACKAGES[$i]}"
  PKG_DIR="${TEMP_DIR}/${PKG}"
  mkdir -p "${PKG_DIR}"

  echo ""
  echo "==> Verifying ${SCOPED}"

  # Pack tarball
  pnpm --filter "${SCOPED}" pack --pack-destination "${PKG_DIR}" 2>/dev/null

  # Extract tarball
  TARBALL=$(ls "${PKG_DIR}"/*.tgz 2>/dev/null | head -1)
  if [ -z "${TARBALL}" ]; then
    echo "FAIL: no tarball generated for ${SCOPED}"
    ERRORS=$((ERRORS + 1))
    continue
  fi
  tar -xzf "${TARBALL}" -C "${PKG_DIR}"

  # Check for source code leaks
  LEAKED=$(find "${PKG_DIR}/package" -type f \( \
    -name "*.ts" ! -name "*.d.ts" -o \
    -name "*.tsx" -o \
    -name "tsconfig.*" -o \
    -name "vite.config.*" -o \
    -path "*/src/*" \
  \) 2>/dev/null)

  if [ -n "${LEAKED}" ]; then
    echo "FAIL: source code found in tarball:"
    echo "${LEAKED}" | sed 's/^/  /'
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: no source code in tarball"
  fi

  # Check for sensitive files
  SENSITIVE=$(find "${PKG_DIR}/package" -type f \( \
    -name ".env" -o -name ".env.*" -o \
    -name ".npmrc" -o -name ".yarnrc" -o \
    -name "*.pem" -o -name "*.key" -o -name "*.cert" -o \
    -name "credentials.json" -o -name "secrets.*" -o \
    -name "*.tsbuildinfo" \
  \) 2>/dev/null)

  if [ -n "${SENSITIVE}" ]; then
    echo "FAIL: sensitive files found in tarball:"
    echo "${SENSITIVE}" | sed 's/^/  /'
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: no sensitive files in tarball"
  fi

  # Check dist/ exists in tarball
  if [ ! -d "${PKG_DIR}/package/dist" ]; then
    echo "FAIL: dist/ directory missing from tarball"
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: dist/ present"
  fi

  # Check workspace:* references resolved
  if grep -q '"workspace:' "${PKG_DIR}/package/package.json" 2>/dev/null; then
    echo "FAIL: unresolved workspace:* references in packed package.json"
    grep '"workspace:' "${PKG_DIR}/package/package.json" | sed 's/^/  /'
    ERRORS=$((ERRORS + 1))
  else
    echo "  OK: no workspace:* references"
  fi

  # Check README.md present
  if [ ! -f "${PKG_DIR}/package/README.md" ]; then
    echo "WARN: README.md missing from tarball (npm page will be empty)"
  else
    echo "  OK: README.md present"
  fi

  # Check LICENSE present
  if [ ! -f "${PKG_DIR}/package/LICENSE" ]; then
    echo "WARN: LICENSE missing from tarball"
  else
    echo "  OK: LICENSE present"
  fi

  # List tarball contents for review
  echo "  Contents:"
  tar -tzf "${TARBALL}" | sed 's/^/    /'
done

echo ""
if [ "${ERRORS}" -gt 0 ]; then
  echo "FAILED: ${ERRORS} error(s) found. Fix before publishing."
  exit 1
else
  echo "ALL CHECKS PASSED. Safe to publish."
fi
