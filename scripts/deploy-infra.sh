#!/usr/bin/env bash
# Deploy current backend + Discord bot source to the Oracle Cloud instances and
# restart them. Run from the repo root after committing a change that touches
# backend/ or the bot, so the servers match what was just released.
#
#   bash scripts/deploy-infra.sh            # deploy everything
#   bash scripts/deploy-infra.sh backend    # Flex-1 API only
#   bash scripts/deploy-infra.sh bot        # Flex-2 Discord bot only
#
# Secrets are never copied by this script. Each server keeps its own env file
# (Flex-1: ~/streamio-backend/secrets.env, Flex-2: ~/streamio-bot/.env) and
# those are left untouched.

set -euo pipefail

FLEX1_HOST="ubuntu@163.192.40.120"
FLEX1_KEY="$HOME/.ssh/streamio_oracle_e5"
FLEX2_HOST="ubuntu@170.9.15.10"
FLEX2_KEY="$HOME/.ssh/streamio_oracle_flex2"

SSH_OPTS="-o ConnectTimeout=15 -o StrictHostKeyChecking=no"
TARGET="${1:-all}"

deploy_backend() {
  echo "==> Flex-1: syncing backend/api"
  # --delete keeps the server from accumulating files removed from the repo.
  # secrets.env / .env are excluded so a deploy can never clobber credentials.
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude 'secrets.env' \
    --exclude '.env' \
    -e "ssh -i $FLEX1_KEY $SSH_OPTS" \
    backend/api/ "$FLEX1_HOST:~/streamio-backend/api/"

  rsync -az -e "ssh -i $FLEX1_KEY $SSH_OPTS" \
    backend/docker-compose.yml "$FLEX1_HOST:~/streamio-backend/docker-compose.yml"

  echo "==> Flex-1: rebuilding and restarting API"
  ssh -i "$FLEX1_KEY" $SSH_OPTS "$FLEX1_HOST" \
    'cd ~/streamio-backend && docker compose up -d --build api'

  echo "==> Flex-1: waiting for health"
  for i in $(seq 1 20); do
    if curl -fsS -m 8 "https://163-192-40-120.sslip.io/health" >/dev/null 2>&1; then
      echo "    healthy: $(curl -sS -m 8 https://163-192-40-120.sslip.io/health)"
      return 0
    fi
    sleep 3
  done
  echo "    ERROR: backend did not come back healthy" >&2
  ssh -i "$FLEX1_KEY" $SSH_OPTS "$FLEX1_HOST" \
    'docker logs --tail 30 streamio-backend-api-1' >&2 || true
  return 1
}

deploy_bot() {
  echo "==> Flex-2: syncing Discord bot"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" 'mkdir -p ~/streamio-bot'
  rsync -az --delete \
    --exclude 'node_modules' \
    --exclude '.env' \
    -e "ssh -i $FLEX2_KEY $SSH_OPTS" \
    backend/bot/ "$FLEX2_HOST:~/streamio-bot/"

  echo "==> Flex-2: rebuilding and restarting bot"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" \
    'cd ~/streamio-bot && docker compose up -d --build'

  sleep 8
  echo "==> Flex-2: recent bot log"
  ssh -i "$FLEX2_KEY" $SSH_OPTS "$FLEX2_HOST" \
    'docker logs --tail 15 streamio-bot-bot-1 2>&1'
}

case "$TARGET" in
  backend) deploy_backend ;;
  bot)     deploy_bot ;;
  all)     deploy_backend; deploy_bot ;;
  *) echo "usage: $0 [all|backend|bot]" >&2; exit 2 ;;
esac

echo "==> Done."
