#!/usr/bin/env bash
set -euo pipefail

# ── Configuration ──
PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID env var}"
REGION="${GCP_REGION:-us-central1}"
REPO_NAME="ariontalk"

echo "==> Setting active project: ${PROJECT_ID}"
gcloud config set project "${PROJECT_ID}"

echo "==> Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

echo "==> Creating Artifact Registry repository: ${REPO_NAME}"
if gcloud artifacts repositories describe "${REPO_NAME}" \
     --location="${REGION}" &>/dev/null; then
  echo "    Repository already exists, skipping."
else
  gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}"
fi

echo "==> Creating GEMINI_API_KEY secret in Secret Manager"
if gcloud secrets describe gemini-api-key &>/dev/null; then
  echo "    Secret already exists. To update it, run:"
  echo "    echo -n 'new-key' | gcloud secrets versions add gemini-api-key --data-file=-"
else
  read -rsp "Enter your GEMINI_API_KEY: " API_KEY
  echo
  echo -n "${API_KEY}" | gcloud secrets create gemini-api-key --data-file=-
fi

echo "==> Granting Cloud Run access to the secret"
PROJECT_NUMBER=$(gcloud projects describe "${PROJECT_ID}" --format="value(projectNumber)")
gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo ""
echo "==> Setup complete. You can now run:"
echo "    GCP_PROJECT_ID=${PROJECT_ID} ./scripts/deploy-token-server.sh"
