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
- **Digital Assets & Secrets Vault:** Enterprise vault for corporate social media accounts (X, LinkedIn, Instagram), cloud services, and email platforms with linked recovery emails, recovery phone numbers, 2FA status, and zero-plaintext encrypted secrets (passwords, TOTP authenticator keys, recovery codes) protected by Argon2id reauthentication.

---

## 🛠 Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | Next.js 16.4 (App Router, Standalone Build), React 19, TypeScript 5, Tailwind CSS v4 |
| **Backend** | Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, Alembic 1.14, Pydantic v2 |
| **Database** | PostgreSQL 16.6 (Production/Staging via least-privilege `itops_app` role) & SQLite 3 (Local Dev/Test) |
| **Security** | Argon2id Password Hashing, HttpOnly Cookies, Server-Side 6-Role RBAC, HashiCorp Vault KV v2 |
| **Web Server** | Nginx 1.27 Reverse Proxy (TLS 1.2/1.3, HTTP/2, Rate Limiting, Gzip, Security Headers) |
| **Deployment**| Docker Engine & Docker Compose v2, Ubuntu Server 22.04 / 24.04 LTS |

---

## 🚀 How to Run the Project (دليل تشغيل النظام)

You can run the project in three ways: **One-Click Local Scripts**, **Manual Local Development**, or **Docker Compose**.

---

### Option 1: One-Click Startup Scripts (Fastest on Windows)

Use the built-in startup scripts located in the root directory to launch both Backend and Frontend in parallel:

**Using Command Prompt / Batch:**
```cmd
start_servers.bat
```

**Using PowerShell:**
```powershell
.\start_servers.ps1
```

This starts:
- **Backend API (Uvicorn):** [http://localhost:8000](http://localhost:8000) (Interactive Swagger Docs at [http://localhost:8000/docs](http://localhost:8000/docs))
- **Frontend App (Next.js):** [http://localhost:3000](http://localhost:3000)

---

### Option 2: Manual Local Development (Step-by-Step)

#### Prerequisites
- **Python**: 3.10+ or 3.12+
- **Node.js**: 18+ or 20+
- **Git**

#### 1. Backend Setup (FastAPI & SQLite / PostgreSQL)

Open a terminal and navigate to the `backend` folder:
```bash
cd backend

# Optional: Create and activate a Python virtual environment
python -m venv venv

# Windows (Command Prompt / PowerShell):
.\venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate

# Install backend dependencies
pip install -r requirements.txt

# (Optional) Seed initial demo companies, branches, employees, and assets
python seed_data.py

# Start the FastAPI server with hot-reload
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup (Next.js 16 & React 19)

Open a second terminal and navigate to the `frontend` folder:
```bash
cd frontend

# Install frontend dependencies
npm install

# Start the Next.js development server
npm run dev
# Or run Next.js directly:
node node_modules/next/dist/bin/next dev -p 3000
```

#### 3. Open the App in Your Browser
- **Web Interface:** [http://localhost:3000](http://localhost:3000)
- **Interactive API Documentation:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Default Super Admin Credentials:**
  - **Username:** `admin`
  - **Password:** `Admin@12345`

---

### Option 3: Docker Compose (Hardened Staging / Production)

#### 1. Prepare Environment Variables & TLS Certificates
```bash
cp .env.example .env
# Edit .env and set strong non-default values for DB_PASSWORD, APP_DB_PASSWORD, SECRET_KEY, and ADMIN_INITIAL_PASSWORD
```

#### 2. Build and Launch Containers
```bash
docker compose up -d --build
```

#### 3. Run PostgreSQL Migrations & Secure First-Admin Bootstrap
```bash
docker compose exec backend alembic upgrade head
docker compose exec -e ALLOW_PRODUCTION_BOOTSTRAP=true backend python seed_data.py
```

#### 4. Access the Stack (via Nginx Reverse Proxy)
- **Web Interface (HTTPS):** `https://localhost` (or configured `NGINX_HTTPS_PORT`)
- **Health & Readiness Checks:** `https://localhost/api/health` and `https://localhost/api/ready`

---

### 🧪 Running Tests & Verifications

To verify system integrity and test business logic across all modules:

```bash
# 1. Run all 13 core modules test suite
python backend/tests/run_all_tests.py

# 2. Run User Management, RBAC & Multi-Company isolation tests
python backend/tests/test_user_management.py

# 3. Run Vault, Zero-Plaintext & Customization tests
python backend/tests/test_vault_customization.py

# 4. Run Frontend TypeScript compilation & type checking
cd frontend
node node_modules/typescript/bin/tsc --noEmit
```

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
