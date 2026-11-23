#!/usr/bin/env bash
# Run on the VPS as root:  bash deploy.sh <domain>
# Installs Docker if needed, fetches the code from GitHub, creates .env once, and (re)starts the stack.
set -euo pipefail
DOMAIN="${1:?usage: deploy.sh <domain>, for example 172-232-225-76.sslip.io}"
REPO="https://github.com/sharing-123/facial-plastic-surgery-planner.git"
DIR=/root/facestudio
if ! command -v docker >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y && apt-get install -y ca-certificates curl git
  curl -fsSL https://get.docker.com | sh
fi
apt-get install -y git >/dev/null 2>&1 || true
if [ -d "$DIR/.git" ]; then git -C "$DIR" fetch --all -q && git -C "$DIR" reset --hard origin/main -q; else git clone -q "$REPO" "$DIR"; fi
cd "$DIR/deploy/vps"
if [ ! -f .env ]; then
  umask 077
  printf 'DOMAIN=%s\nPOSTGRES_PASSWORD=%s\n' "$DOMAIN" "$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 28)" > .env
fi
sed -i "s/^DOMAIN=.*/DOMAIN=$DOMAIN/" .env
# a little swap helps the first image build on a 2 GB machine
if [ ! -f /swapfile ]; then fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab; fi
docker compose up -d --build
docker compose ps
