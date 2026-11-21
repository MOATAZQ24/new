#!/usr/bin/env bash
# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

# ==============================================================================
# Investor Gate IT Operations Management System — SSL Certificate Generator
# Generates self-signed TLS certificates for development/local server use
# ==============================================================================

set -euo pipefail

SSL_DIR="./nginx/ssl"
mkdir -p "$SSL_DIR"

DOMAIN="${1:-itops.local}"
DAYS=365

echo "--> Generating self-signed TLS certificates for domain: ${DOMAIN}..."

openssl req -x509 -nodes -days "$DAYS" -newkey rsa:2048 \
    -keyout "${SSL_DIR}/server.key" \
    -out "${SSL_DIR}/server.crt" \
    -subj "/C=SA/ST=Riyadh/L=Riyadh/O=Investor Gate/OU=IT Operations/CN=${DOMAIN}"

chmod 600 "${SSL_DIR}/server.key"
chmod 644 "${SSL_DIR}/server.crt"

echo "--> Certificates generated successfully in ${SSL_DIR}:"
echo "    - Private Key: ${SSL_DIR}/server.key"
echo "    - Certificate: ${SSL_DIR}/server.crt"
