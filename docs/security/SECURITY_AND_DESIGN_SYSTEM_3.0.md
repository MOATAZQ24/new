# Investor Gate OS 3.0 — Security Model, RBAC Matrix, Design System & QA Verification

## 1. Security Model & Saudi PDPL Alignment (`docs/security`)

- **Strict Multi-Company Tenant Isolation:** Every API endpoint and AI Agent tool resolves `target_cid = resolve_company_scope(current_user, active_cid, company_id)` and filters all SQLAlchemy queries by `company_id`.
- **Granular HR Privacy (`can_view_confidential_hr`):**
  - Ordinary employees and technicians can view general directory fields (`full_name`, `job_title`, `department_name`, `branch_name`) and their own self-service profile.
  - Confidential HR records (`PerformanceEvaluation`, confidential `EmployeeDocument`, and other employees' asset serial numbers) are restricted to `Super Admin`, `Company Admin`, `IT Manager`, and `Auditor`.
- **BPMN Approval State Machine Guard:** `decide_workflow_approval` enforces valid transitions (`Pending -> Approved | Rejected | Cancelled`) and blocks invalid re-transitions with HTTP 400 and full `AuditLog` attribution.
- **AI Agent Security Guardrail:** Blocks prompt injection, SQL injection, and secret exfiltration (`AI_AGENT_SECURITY_BLOCK`) and requires explicit confirmation tokens before executing state-changing operations.

---

## 2. Enterprise Design System Tokens (`docs/ui-ux`)

- **Brand Palette (WCAG 2.2 AA Verified):**
  - Primary Dark Green: `#123D32`
  - Secondary Emerald Green: `#187A5A`
  - Surface Background: `#F5F7F8`
  - Warm Gold Accent: `#C5A46D`
  - Card Surface: `#FFFFFF` (Light) / `#182824` (Dark)
- **Typography & RTL:**
  - Arabic: `IBM Plex Sans Arabic` (`dir="rtl"`, logical properties `ms-*`, `me-*`, `ps-*`, `pe-*`, `<bdi>` isolation for codes/emails/numbers).
  - English / Monospace: `Inter` & system monospace for IDs (`#92004`, `TASK-*`, `TCK-*`, `PRJ-*`, `CUST-*`).
- **Entity Detail Page Standard Structure:**
  `Header → Identity & Status → Key Metrics → Relevant Charts → Related Records → Timeline → Actions`
