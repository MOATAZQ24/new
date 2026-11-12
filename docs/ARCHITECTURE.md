# Investor Gate IT Operations Management System — Architecture Document

## 1. System Overview
**Investor Gate IT Operations Management System** is a secure, self-hosted, multi-company platform designed for enterprise IT governance across distributed branches and subsidiary organizations.

### Primary Objectives:
- Zero recurring software licensing or cloud hosting costs (100% Free and Open Source Software stack).
- Native Arabic Right-to-Left (RTL) interface with full English localization support.
- Hard multi-tenant company isolation enforced server-side.
- Complete operational modules: Technical Assets, Asset Custody & Handover Receipts, IT Infrastructure, Third-Party Subscriptions, Maintenance & Change Approvals, Task Management, IT Help Desk, Notifications, Audit Logging, and Reports.
- **CRITICAL SCOPE DIRECTIVE:** The legacy "Digital Assets" module has been completely excised from the database, API, navigation, and user interfaces. Domains and email services are managed strictly as recurring cost items within Third-Party Subscriptions.

---

## 2. Technical Stack

```
+---------------------------------------------------------------------------------+
|                                USER INTERFACE                                   |
|   Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + Lucide-style SVGs   |
|   Arabic RTL Primary Layout (IBM Plex Sans Arabic) + English (Inter)            |
+----------------------------------------+----------------------------------------+
                                         | REST APIs (HttpOnly Cookies + X-Company-ID)
+----------------------------------------v----------------------------------------+
|                              REVERSE PROXY & SECURITY                           |
|   Nginx 1.25+ (TLSv1.2/1.3, Rate Limiting, HSTS, Gzip, CSRF & CSP Headers)     |
|   WireGuard VPN (Encrypted Site-to-Site & Remote Access Tunneling)              |
+----------------------------------------+----------------------------------------+
                                         |
+----------------------------------------v----------------------------------------+
|                                BACKEND SERVICES                                 |
|   Python 3.12+ FastAPI + Pydantic v2 + SQLAlchemy 2.0 (Relational ORM)          |
|   Argon2id Password Hashing + Server-Side RBAC + Dynamic Audit Logger           |
+----------------------------------------+----------------------------------------+
                                         |
+----------------------------------------v----------------------------------------+
|                                PERSISTENCE LAYER                                |
|   PostgreSQL 16 Relational Engine (UUID PKs, Foreign Keys, Indexes)            |
|   Local SQLite fallback support for offline developer workstation testing       |
+---------------------------------------------------------------------------------+
```

---

## 3. Multi-Company Data Isolation

Data isolation is enforced strictly on the backend:
1. Every business record includes a mandatory `company_id` foreign key referencing the `companies` table.
2. The user's active company is transmitted via the `X-Company-ID` HTTP header and validated against the `company_memberships` table for each request.
3. Super Admins possess global oversight across all tenant companies, while Company Admins, IT Managers, Technicians, and Employees are confined strictly to their authorized company boundaries.
4. Database queries automatically scope results using `.filter(Model.company_id == target_cid)`. Cross-company leaks via ID manipulation, search parameters, or CSV exports are physically prevented.

---

## 4. Database Schema & Entities

The platform manages 20 relational database tables:
1. **Core Organization:**
   - `companies`: Tenant company branding, Arabic/English names, codes.
   - `branches`: Physical branch offices and locations.
   - `departments`: Functional business units per branch/company.
2. **Identity & Access Management:**
   - `employees`: Employee personnel records and contact details.
   - `users`: Authentication identities (Argon2id hashes, account status).
   - `roles`: Role definitions (Super Admin, Company Admin, IT Manager, IT Technician, Employee, Auditor).
   - `user_roles`: Many-to-many user role assignments.
   - `company_memberships`: Company-user association mapping.
   - `user_sessions`: Active session tokens and expirations.
3. **IT Asset Operations:**
   - `technical_assets`: Physical hardware inventory (Laptops, Desktops, Monitors, Printers).
   - `asset_custody`: Atomic employee custody assignments, returns, and condition receipts.
4. **Network & Infrastructure:**
   - `it_infrastructure`: Routers, Switches, Firewalls, Access Points, Servers, NAS (Vault credential references only).
5. **Recurring Expenses:**
   - `third_party_subscriptions`: Web hosting, cloud platforms, SaaS, domains, email hosting, billing cycles, cost tracking.
6. **Maintenance & Risk Management:**
   - `maintenance_records`: Hardware repair, component replacement, and configuration changes (risk assessments, rollback plans, approval workflows).
7. **Workflows & Support:**
   - `tasks`: Actionable technical tasks, assignments, priorities, due dates.
   - `task_comments`: Progress notes and updates.
   - `help_desk_tickets`: Support requests, sequential numbering (`TCK-YYYY-####`), status workflows.
   - `ticket_comments`: Public user replies vs. technician internal notes.
8. **Observability:**
   - `notifications`: System notifications queue and read receipts.
   - `audit_logs`: Immutable security audit log tracking all mutations and IP addresses.
