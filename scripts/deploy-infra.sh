#!/usr/bin/env bash
# Deploy current backend + Discord bot source to all Oracle Cloud instances.
# Run from the repo root after committing changes to backend/ or the bot.
#
#   bash scripts/deploy-infra.sh              # deploy to all three instances
#   bash scripts/deploy-infra.sh backend      # Flex-1 (production API) only
#   bash scripts/deploy-infra.sh staging      # Flex-3 (staging API) only
#   bash scripts/deploy-infra.sh bot          # Flex-2 (Discord bot) only
#   bash scripts/deploy-infra.sh api-all      # Flex-1 + Flex-3 API deploy
#
# Secrets are NEVER copied by this script. Each server keeps its own local
# env file and those files are never touched by deploys.
#   Flex-1 (prod)    → ~/streamio-backend/secrets.env
#   Flex-3 (staging) → ~/streamio-backend/secrets.env
#   Flex-2 (bot)     → ~/streamio-bot/.env

set -euo pipefail

# ─── Instance Definitions ─────────────────────────────────────────────────────

FLEX1_HOST="ubuntu@163.192.40.120"
FLEX1_KEY="$HOME/.ssh/streamio_oracle_e5"
FLEX1_URL="https://163-192-40-120.sslip.io"

FLEX2_HOST="ubuntu@170.9.15.10"
FLEX2_KEY="$HOME/.ssh/streamio_oracle_flex2"
FLEX2_URL="https://170-9-15-10.sslip.io"

FLEX3_HOST="ubuntu@138.2.232.225"
FLEX3_KEY="$HOME/.ssh/streamio_oracle_flex3"
FLEX3_URL="https://138-2-232-225.sslip.io"

SSH_OPTS="-o ConnectTimeout=15 -o StrictHostKeyChecking=no"
TARGET="${1:-all}"

# ─── Backend Deploy Helper ────────────────────────────────────────────────────

deploy_api_to() {
  local label="$1"
  local host="$2"
  local key="$3"
  local health_url="$4"

  echo "==> ${label}: syncing backend/api"
  scp -i "$key" $SSH_OPTS -r backend/api/ "${host}:~/streamio-backend/api/"
  scp -i "$key" $SSH_OPTS backend/docker-compose.yml "${host}:~/streamio-backend/docker-compose.yml"

  echo "==> ${label}: rebuilding and restarting API container"
  ssh -i "$key" $SSH_OPTS "$host" \
    'cd ~/streamio-backend && docker compose up -d --build api'

  echo "==> ${label}: waiting for health check..."
  for i in $(seq 1 20); do
    if curl -fsS -m 8 "${health_url}/health" >/dev/null 2>&1; then
      echo "    ✅ ${label} healthy: $(curl -sS -m 8 ${health_url}/health)"
      return 0
    fi
    sleep 3
  done

  echo "    ❌ ERROR: ${label} did not come back healthy" >&2
  ssh -i "$key" $SSH_OPTS "$host" \
    'docker logs --tail 30 streamio-backend-api-1' >&2 || true
  return 1
}

# ─── Individual Deploy Functions ──────────────────────────────────────────────

deploy_backend() {
  deploy_api_to "Flex-1 (Production API)" "$FLEX1_HOST" "$FLEX1_KEY" "$FLEX1_URL"
}

deploy_staging() {
  deploy_api_to "Flex-3 (Staging API)" "$FLEX3_HOST" "$FLEX3_KEY" "$FLEX3_URL"
}

deploy_bot() {
  echo "==> Flex-2: syncing Discord bot"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" 'mkdir -p ~/streamio-bot'
  scp -i "$FLEX2_KEY" $SSH_OPTS -r backend/bot/ "${FLEX2_HOST}:~/streamio-bot/"

  echo "==> Flex-2: rebuilding and restarting bot container"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" \
    'cd ~/streamio-bot && docker compose up -d --build'

  sleep 8
  echo "==> Flex-2: recent bot log"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" \
    'docker logs --tail 15 streamio-bot-bot-1 2>&1'
}

# ─── Health Status Summary ────────────────────────────────────────────────────

health_all() {
  echo ""
  echo "==> Oracle Cloud Status Summary"
  for pair in \
    "Flex-1 (Production API)|${FLEX1_URL}/health" \
    "Flex-2 (Discord Bot)|${FLEX2_URL}/health" \
    "Flex-3 (Staging API)|${FLEX3_URL}/health"; do
    local name="${pair%%|*}"
    local url="${pair##*|}"
    local status
    if status=$(curl -fsS -m 8 "$url" 2>/dev/null); then
      echo "    ✅ ${name}: ${status}"
    else
      echo "    ❌ ${name}: unreachable"
    fi
  done
  echo ""
}

# ─── Entry Point ─────────────────────────────────────────────────────────────

case "$TARGET" in
  backend)  deploy_backend ;;
  staging)  deploy_staging ;;
  bot)      deploy_bot ;;
  api-all)  deploy_backend; deploy_staging ;;
  all)      deploy_backend; deploy_bot; deploy_staging ;;
  health)   health_all; exit 0 ;;
  *) echo "usage: $0 [all|backend|staging|bot|api-all|health]" >&2; exit 2 ;;
esac

health_all
echo "==> Done."
