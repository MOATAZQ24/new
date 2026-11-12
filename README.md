# Investor Gate IT Operations Management System
### نظام إدارة عمليات وأصول تقنية المعلومات — بوابة المستثمر

A production-ready, self-hosted, multi-company IT Operations, Asset Management, and Help Desk platform designed for enterprise organizations operating across distributed branches and subsidiary companies. Built strictly using Free and Open Source Software (FOSS) with **zero recurring software licensing or cloud hosting fees**.

---

## 🌟 Key Features

- **Multi-Company Architecture:** Hard multi-tenant company isolation enforced server-side. Manage multiple parent and subsidiary organizations with distinct branches, departments, and personnel.
- **Arabic RTL Native Interface:** Designed specifically for Arabic Right-to-Left workflows (using IBM Plex Sans Arabic and Tajawal) with complete English support.
- **Technical Assets & QR Codes:** Full physical asset lifecycle management (Laptops, Desktops, Monitors, Mobile Devices, Printers) with automated QR code generation for hardware tagging.
- **Asset Custody & Handover Receipts:** Atomic employee custody assignments, returns, transfers, device condition assessments, and printable Arabic handover receipts.
- **IT Infrastructure Inventory:** Management of enterprise network hardware (Routers, Switches, Firewalls, Access Points, Servers, NAS, VLANs) with zero plaintext credentials (vault references only).
- **Third-Party Subscriptions & Cost Tracking:** Track web hosting, cloud infrastructure, SaaS licenses, domains, and email hosting with automatic renewal alerts and monthly/annual cost forecasting.
- **Maintenance & Configuration Changes:** Structured tracking for hardware repairs, equipment replacements, and network configuration changes with risk assessments, rollback plans, and approval workflows.
- **Task Management:** Real-time operational task assignment, priorities, deadlines, and technician collaboration comments.
- **IT Help Desk:** Support ticketing system with automatic numbering (`TCK-YYYY-####`), status progression, SLA tracking, public employee replies vs. technician internal notes, and one-click ticket-to-task conversion.
- **In-App Notifications:** Real-time notification feed for task assignments, ticket updates, custody handovers, and upcoming contract renewals.
- **Reports & Excel Exports:** Complete export engine supporting Excel-compatible CSV with UTF-8 BOM (for pristine Arabic display in MS Excel) and printable HTML reports.
- **Security & Audit Logs:** Immutable audit trail recording every mutation with old/new values, IP addresses, and user context. Passwords hashed using Argon2id with HttpOnly session cookies and server-side RBAC.
- **Strict Scope Directives:** The legacy "Digital Assets" module has been completely removed. Domains and email accounts are managed exclusively as recurring subscriptions.

---

## 🛠 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router), React, TypeScript, Tailwind CSS v4, Lucide-style SVG Icons |
| **Backend** | Python 3.12+, FastAPI, SQLAlchemy 2.0 (Relational ORM), Pydantic v2 |
| **Database** | PostgreSQL 16 (Relational schema with UUID primary keys & indexes) |
| **Security** | Argon2id Password Hashing, HttpOnly Cookies, Server-Side RBAC, WireGuard VPN |
| **Web Server** | Nginx Reverse Proxy (SSL/TLS Termination, Rate Limiting, Security Headers) |
| **Deployment**| Docker Engine, Docker Compose, Ubuntu Server 22.04 / 24.04 LTS |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
- Docker Engine & Docker Compose
- Git
- OpenSSL

### 2. Installation (Automated)
Clone the repository and run the setup script:
```bash
git clone <repository_url>
cd itops
chmod +x scripts/*.sh
./scripts/setup.sh
```

### 3. Manual Start with Docker Compose
```bash
# 1. Prepare environment variables
cp .env.example .env

# 2. Build and start containers
docker compose up -d --build

# 3. Seed initial database records
docker compose exec backend python seed_data.py
```

### 4. Access the Application
- **Frontend Dashboard:** [http://localhost:3000](http://localhost:3000) (or `https://localhost` via Nginx)
- **FastAPI OpenAPI Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Default Super Admin:**
  - **Username:** `admin`
  - **Password:** `Admin@12345`

---

## 📁 Repository Structure

```
├── backend/                  # FastAPI Application
│   ├── app/
│   │   ├── api/v1/           # 44 REST API Endpoints
│   │   ├── core/             # Config, Database Session, Security (Argon2id)
│   │   ├── models/           # 20 SQLAlchemy 2.0 Relational Models
│   │   ├── schemas/          # Pydantic v2 Validation Schemas
│   │   └── services/         # Audit & Notification Services
│   ├── tests/                # Automated Backend Unit & Workflow Tests
│   ├── seed_data.py          # Realistic Multi-Company Seed Data Script
│   ├── requirements.txt      # Python Dependencies
│   └── Dockerfile            # Backend Docker Image
├── frontend/                 # Next.js 16 App Router
│   ├── src/
│   │   ├── app/              # 14 Full RTL Pages (Assets, Custody, HelpDesk, etc.)
│   │   ├── components/       # Layouts, Modals, Badges, Stats Cards, Icons
│   │   ├── context/          # Auth Context & Multi-Tenant Company Switcher
│   │   └── lib/              # API Client with HttpOnly Cookie Support
│   ├── package.json          # Node Dependencies
│   └── Dockerfile            # Frontend Production Image
├── nginx/                    # Reverse Proxy Configuration & TLS
├── wireguard/                # WireGuard Zero-Trust VPN Configuration
├── scripts/                  # Automated Setup, Backup, and Restore Shell Scripts
├── docs/                     # Comprehensive Architectural & Administrative Guides
│   ├── ARCHITECTURE.md       # Architecture & Multi-Tenant Isolation
│   ├── DEPLOYMENT.md         # Ubuntu Server & Production Deployment
│   ├── BACKUP.md             # Disaster Recovery & Automated Backups
│   ├── SECURITY.md           # Cybersecurity & RBAC Guidelines
│   ├── ADMIN_GUIDE.md        # Comprehensive Arabic/English Administrator Manual
│   └── API.md                # REST API Reference & Specification
├── docker-compose.yml        # Production Docker Stack
└── README.md                 # Project Overview
```

---

## 🔒 Security Best Practices
1. **Never commit secrets:** Ensure `.env` is listed in `.gitignore` and never committed to version control.
2. **Use WireGuard VPN:** Keep management ports closed to the public internet; tunnel through WireGuard for remote admin access.
3. **Change Default Credentials:** Change the default `admin` password immediately upon initial deployment.
4. **Regular Backups:** Verify automated nightly cron backups running via `scripts/backup.sh`.

---

## 📄 License
This project is released under the **MIT License**. Free for commercial and private enterprise use with zero software licensing costs.
