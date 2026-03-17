#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# Load .env.production if PUBLIC_SERVER_URL is not already set
if [ -z "${PUBLIC_SERVER_URL:-}" ] && [ -f "website/.env.production" ]; then
  set -a
  source website/.env.production
  set +a
fi

# Ensure the production token server URL is set
if [ -z "${PUBLIC_SERVER_URL:-}" ]; then
  echo "ERROR: PUBLIC_SERVER_URL is not set."
  echo "Set it as an env var or in website/.env.production"
  exit 1
fi

echo "==> Installing dependencies"
pnpm install --frozen-lockfile

echo "==> Building all packages"
pnpm build

echo "==> Building website"
PUBLIC_SERVER_URL="${PUBLIC_SERVER_URL}" pnpm website-build

echo "==> Deploying to Firebase Hosting"
firebase deploy --only hosting

echo "==> Done. Website deployed."
