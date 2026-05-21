#!/usr/bin/env bash
set -euo pipefail

# ==============================================================
# Mirror.ng — Oracle Cloud Always Free VM Bootstrap
# Run this ONCE on a fresh Ubuntu 22.04+ VM.
# Usage: curl -fsSL https://raw.githubusercontent.com/YOUR_USER/mirror-ng/main/scripts/bootstrap-oracle.sh | bash
# ==============================================================

REPO_URL="https://github.com/YOUR_USER/mirror-ng.git"
APP_DIR="$HOME/mirror-ng"

echo "=== 1. Installing Docker ==="
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | bash
    sudo usermod -aG docker "$USER"
    newgrp docker || true
fi

if ! command -v docker compose &>/dev/null; then
    sudo apt-get update
    sudo apt-get install -y docker-compose-plugin
fi

echo "=== 2. Cloning repo ==="
if [ -d "$APP_DIR" ]; then
    cd "$APP_DIR"
    git pull
else
    git clone "$REPO_URL" "$APP_DIR"
    cd "$APP_DIR"
fi

echo "=== 3. Creating .env ==="
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo ""
    echo ">>> Edit backend/.env with your credentials:"
    echo "    nano $APP_DIR/backend/.env"
    echo "    Then run: cd $APP_DIR && docker compose up -d"
    echo ""
else
    echo "    .env already exists"
fi

echo "=== 4. Starting services ==="
docker compose build
docker compose up -d

echo ""
echo "=== Done! ==="
echo "    App should be running at http://$(curl -4 -fsSL ifconfig.me)"
echo ""
echo "    For HTTPS, put Cloudflare in front or run:"
echo "    docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo ""
echo "    To deploy updates after git push:"
echo "    cd $APP_DIR && git pull && docker compose build && docker compose up -d"
