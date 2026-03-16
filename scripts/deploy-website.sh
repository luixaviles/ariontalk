#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building all packages"
pnpm build

echo "==> Building website"
pnpm website-build

echo "==> Deploying to Firebase Hosting"
firebase deploy --only hosting

echo "==> Done. Website deployed."
