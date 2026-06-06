#!/usr/bin/env bash
#
# Deploy BumpLess to the VPS (rsync the app, then build + restart the prod stack).
#
#   ./deploy.sh
#
# Overridable:
#   VPS=user@host  APP_DIR=/opt/bumpless  ./deploy.sh
#
set -euo pipefail

VPS="${VPS:-root@<VPS_IP>}"
APP_DIR="${APP_DIR:-/opt/bumpless}"
HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="$HERE/road-sentinel-hk"

# Mapbox token for the production build (read from the local frontend/.env).
TOKEN="${VITE_MAPBOX_TOKEN:-$(grep -E '^VITE_MAPBOX_TOKEN=' "$LOCAL_DIR/frontend/.env" 2>/dev/null | cut -d= -f2- || true)}"
if [ -z "$TOKEN" ]; then
  echo "WARNING: no VITE_MAPBOX_TOKEN found (frontend/.env). The map will not render." >&2
fi

echo "→ Syncing app to $VPS:$APP_DIR ..."
ssh "$VPS" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.venv' \
  --exclude 'dist' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude 'hazards.db' \
  --exclude 'vite.preview.mjs' \
  --exclude '.env' \
  "$LOCAL_DIR/" "$VPS:$APP_DIR/"

echo "→ Building & starting the prod stack on $VPS ..."
ssh "$VPS" "cd '$APP_DIR' && VITE_MAPBOX_TOKEN='$TOKEN' docker compose -f docker-compose.prod.yml up -d --build"

echo "✓ Deployed. Open: https://bump-less.club/"
echo "  (first deploy: Caddy fetches a Let's Encrypt cert — give it ~30s)"
