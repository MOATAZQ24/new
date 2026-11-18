#!/usr/bin/env bash
# ==============================================================================
# Investor Gate IT Operations Management System — Setup Script
# Ubuntu Server 22.04 / 24.04 LTS
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting Setup: Investor Gate IT Operations Platform     "
echo "=========================================================="

# 1. Update system packages
echo "--> Updating system packages..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Install essential packages
echo "--> Installing prerequisites..."
sudo apt-get install -y --no-install-recommends \
    curl \
    wget \
    git \
    openssl \
    ca-certificates \
    wireguard \
    iptables \
    tar \
    gzip

# 3. Install Docker Engine and Docker Compose if not present
if ! command -v docker &> /dev/null; then
    echo "--> Installing Docker Engine..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker "$USER"
    rm get-docker.sh
fi

# 4. Generate SSL Certificates if not present
echo "--> Checking SSL Certificates..."
mkdir -p nginx/ssl
if [ ! -f nginx/ssl/server.crt ]; then
    echo "--> Generating self-signed SSL certificate for HTTPS..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout nginx/ssl/server.key \
        -out nginx/ssl/server.crt \
        -subj "/C=SA/ST=Riyadh/L=Riyadh/O=Investor Gate/CN=itops.local"
    chmod 600 nginx/ssl/server.key
fi

# 5. Environment configuration
if [ ! -f .env ]; then
    echo "--> Generating .env from .env.example..."
    cp .env.example .env
    SECRET_KEY=$(openssl rand -hex 32)
    DB_PASS=$(openssl rand -hex 16)
    APP_DB_PASS=$(openssl rand -hex 16)
    sed -i "s/replace-with-64-char-cryptographic-random-hex-string/$SECRET_KEY/" .env
    sed -i "s/replace-with-strong-postgres-superuser-password/$DB_PASS/" .env
    sed -i "s/replace-with-strong-least-privilege-app-db-password/$APP_DB_PASS/" .env
fi

# 6. Build and launch Docker Compose stack
echo "--> Building and starting containers..."
docker compose build --pull
docker compose up -d

# 7. Clean structural database initialization (NO demo data, NO default admin)
echo "--> Waiting for database to initialize..."
sleep 10
docker compose exec -T backend python seed_data.py --clean-init || true

echo "=========================================================="
echo " Setup Completed Successfully!                           "
echo " Platform URL: https://localhost (or server IP)           "
echo " First-Run Admin Setup: Open https://localhost/setup      "
echo "=========================================================="
