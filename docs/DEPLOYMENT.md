# Investor Gate IT Operations Management System — Deployment Guide

## 1. Prerequisites
- **Target OS:** Ubuntu Server 22.04 LTS or 24.04 LTS (Clean installation recommended).
- **Hardware Specs:**
  - Minimum: 2 CPU cores, 4 GB RAM, 40 GB NVMe/SSD storage.
  - Recommended: 4 CPU cores, 8 GB RAM, 100 GB SSD storage.
- **Network Ports:**
  - Port 80 (HTTP for ACME challenge & HTTPS redirection).
  - Port 443 (HTTPS for encrypted web access).
  - Port 51820 UDP (WireGuard VPN service).

---

## 2. Automated One-Command Installation

Execute the automated provisioning script directly on the Ubuntu server:

```bash
git clone <repository_url> /opt/itops
cd /opt/itops
chmod +x scripts/*.sh
./scripts/setup.sh
```

The script will automatically:
1. Update system packages.
2. Install Docker Engine and Docker Compose plugin.
3. Generate high-entropy secrets for `.env` (`SECRET_KEY`, `DB_PASSWORD`).
4. Generate self-signed TLS certificates for development/local use.
5. Pull and build the Docker containers (`db`, `backend`, `frontend`, `nginx`).
6. Populate the database with initial seed data and seed companies.

---

## 3. Manual Step-by-Step Deployment

### Step A: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
nano .env
```
Ensure you set:
- `SECRET_KEY`: A 64-character random hexadecimal string (`openssl rand -hex 32`).
- `DB_PASSWORD`: Strong password for PostgreSQL.
- `CORS_ORIGINS`: Allowed origins (e.g. `https://itops.investorgate.com`).

### Step B: Generate or Install TLS Certificates
For production using Let's Encrypt / Certbot:
```bash
sudo apt install -y certbot
sudo certbot certonly --standalone -d itops.investorgate.com
cp /etc/letsencrypt/live/itops.investorgate.com/fullchain.pem nginx/ssl/server.crt
cp /etc/letsencrypt/live/itops.investorgate.com/privkey.pem nginx/ssl/server.key
```
For local intranet usage:
```bash
./scripts/generate-ssl.sh itops.local
```

### Step C: Build and Run Containers
```bash
docker compose build --pull
docker compose up -d
```

Verify service status:
```bash
docker compose ps
```

### Step D: Database Initialization & Seeding
```bash
docker compose exec backend python seed_data.py
```

Default administrator credentials:
- **Username:** `admin`
- **Password:** `Admin@12345`

*Note: Change this password immediately upon initial login.*

---

## 4. Setting up WireGuard VPN (Zero-Trust Remote Access)

To prevent opening the administration interface directly to the public internet, use WireGuard:

1. Copy the template:
```bash
sudo cp wireguard/wg0.conf.example /etc/wireguard/wg0.conf
```
2. Generate server keys:
```bash
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
```
3. Enable packet forwarding in `/etc/sysctl.conf`:
```bash
net.ipv4.ip_forward = 1
```
Apply: `sudo sysctl -p`
4. Start WireGuard interface:
```bash
sudo systemctl enable wg-quick@wg0
sudo systemctl start wg-quick@wg0
```
5. Bind Nginx exclusively to the WireGuard interface IP (`10.10.0.1`) if absolute internal isolation is required.
