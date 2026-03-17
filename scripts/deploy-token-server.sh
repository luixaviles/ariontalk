#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${ROOT_DIR}"

# Load root .env if GCP_PROJECT_ID is not already set
if [ -z "${GCP_PROJECT_ID:-}" ] && [ -f "${ROOT_DIR}/.env" ]; then
  set -a
  source "${ROOT_DIR}/.env"
  set +a
fi

# ── Configuration ──
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var or add it to .env}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="ariontalk-token-server"
REPO_NAME="ariontalk"
IMAGE_TAG="$(git rev-parse --short HEAD)"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/token-server:${IMAGE_TAG}"

echo "==> Building Docker image: ${IMAGE}"
docker build --platform linux/amd64 -f packages/token-server/Dockerfile -t "${IMAGE}" .

echo "==> Configuring Docker for Artifact Registry"
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

echo "==> Pushing image to Artifact Registry"
docker push "${IMAGE}"

echo "==> Deploying to Cloud Run: ${SERVICE_NAME}"
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE}" \
  --region "${REGION}" \
  --platform managed \
  --allow-unauthenticated \
  --update-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --port 3001

echo "==> Done. Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format "value(status.url)"
