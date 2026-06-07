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

HERE="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="$HERE"

# Local, gitignored deploy config — e.g. VPS=root@your-ip  (see .deploy.env.example)
[ -f "$HERE/.deploy.env" ] && . "$HERE/.deploy.env"

VPS="${VPS:-}"
APP_DIR="${APP_DIR:-/opt/bumpless}"
if [ -z "$VPS" ]; then
  echo "ERROR: VPS not set. Put 'VPS=root@your-ip' in .deploy.env (see .deploy.env.example)," >&2
  echo "       or run:  VPS=root@your-ip ./deploy.sh" >&2
  exit 1
fi

# Mapbox token for the production build (read from the local frontend/.env).
TOKEN="${VITE_MAPBOX_TOKEN:-$(grep -E '^VITE_MAPBOX_TOKEN=' "$LOCAL_DIR/frontend/.env" 2>/dev/null | cut -d= -f2- || true)}"
if [ -z "$TOKEN" ]; then
  echo "WARNING: no VITE_MAPBOX_TOKEN found (frontend/.env). The map will not render." >&2
fi

echo "→ Syncing app to $VPS:$APP_DIR ..."
ssh "$VPS" "mkdir -p '$APP_DIR'"
rsync -az --delete \
  --exclude '.git' \
  --exclude '.deploy.env' \
  --exclude 'road-sentinel-hk' \
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
