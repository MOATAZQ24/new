# Investor Gate OS 3.0 — Enterprise Architecture, ERD & 15 System Diagrams

## 1. Overall System Architecture (Modular Monolith)

```mermaid
flowchart TB
    subgraph Client["Frontend Layer (Next.js 16 + React 19 + Tailwind v4 RTL)"]
        UI_Exec["Executive & BI Dashboards"]
        UI_Emp360["360° Employee Profile & Directory"]
        UI_HRM["HRM & Attendance Workspace"]
        UI_CRM["CRM & Sales Pipeline"]
        UI_Proj["Enterprise Projects & Gantt"]
        UI_App["BPMN Approvals & Procurement"]
        UI_IT["ITAM / ITSM / Custody / Tasks"]
        UI_AI["AI Action Agent Side Panel"]
    end

    subgraph API["FastAPI Modular Monolith (/api/v1)"]
        AuthRBAC["Auth, Session & Tenant-Scoped RBAC"]
        EntRouter["Enterprise Endpoints (/hrm, /crm, /projects, /approvals)"]
        CoreRouter["Core Endpoints (/employees, /tasks, /tickets, /assets, /custody)"]
        AIRouter["AI Agent Orchestrator & SSE Stream (/ai/agent)"]
    end

    subgraph Domain["Canonical Domain Services"]
        EntSvc["enterprise_service.py (Canonical Identity & 360° Aggregator)"]
        TaskSvc["task_workflow.py & task_assignment.py"]
        AISvc["ai_agent_service.py + ai_agent_tools.py + arabic_nlp.py"]
        NotifSvc["notification_service.py + telegram_service.py"]
        AuditSvc["audit_service.py"]
    end

    subgraph Data["Unified Relational Database (PostgreSQL / SQLite)"]
        DB[(Single Authoritative Schema)]
    end

    Client --> AuthRBAC
    AuthRBAC --> EntRouter
    AuthRBAC --> CoreRouter
    AuthRBAC --> AIRouter
    EntRouter --> EntSvc
    CoreRouter --> EntSvc
    CoreRouter --> TaskSvc
    AIRouter --> AISvc
    AISvc --> EntSvc
    AISvc --> TaskSvc
    AISvc --> NotifSvc
    EntSvc --> AuditSvc
    EntSvc --> DB
    TaskSvc --> DB
    AuditSvc --> DB
```

---

## 2. Unified Enterprise Database ERD

```mermaid
erDiagram
    COMPANY ||--o{ BRANCH : has
    COMPANY ||--o{ DEPARTMENT : has
    COMPANY ||--o{ EMPLOYEE : employs
    BRANCH ||--o{ EMPLOYEE : hosts
    DEPARTMENT ||--o{ EMPLOYEE : groups
    EMPLOYEE ||--o| USER : linked_account
    USER ||--o{ COMPANY_MEMBERSHIP : scoped_role
    EMPLOYEE ||--o{ EMPLOYEE_ASSIGNMENT_HISTORY : immutable_history
    EMPLOYEE ||--o{ ATTENDANCE_RECORD : records
    EMPLOYEE ||--o{ LEAVE_REQUEST : requests
    EMPLOYEE ||--o{ EMPLOYEE_OBJECTIVE : targets
    EMPLOYEE ||--o{ PERFORMANCE_EVALUATION : evaluated_in
    EMPLOYEE ||--o{ ASSET_CUSTODY : holds
    TECHNICAL_ASSET ||--o{ ASSET_CUSTODY : assigned_via
    EMPLOYEE ||--o{ TASK : assigned_to
    PROJECT ||--o{ TASK : contains
    PROJECT ||--o{ PROJECT_MILESTONE : schedules
    EMPLOYEE ||--o{ CRM_CUSTOMER : manages
    CRM_CUSTOMER ||--o{ CRM_OPPORTUNITY : pipeline
    EMPLOYEE ||--o{ PURCHASE_REQUEST : requisitions
    EMPLOYEE ||--o{ WORKFLOW_APPROVAL : initiates
```

---

## 3. Company & Branch Hierarchy

```mermaid
flowchart TD
    Holding["Group / Multi-Company Tenant Scope"]
    CoA["Company A (شركة بوابة المستثمر - IGT)"]
    CoB["Company B (Isolated Tenant Scope)"]
    BrHQ["الفرع الرئيسي - الرياض"]
    BrOlaya["فرع العليا"]
    BrMalqa["فرع الملقا"]
    DeptIT["إدارة تقنية المعلومات"]
    DeptSec["إدارة الأمن السيبراني"]
    DeptOps["إدارة العمليات والمشاريع"]

    Holding --> CoA
    Holding --> CoB
    CoA --> BrHQ
    CoA --> BrOlaya
    CoA --> BrMalqa
    BrHQ --> DeptIT
    BrHQ --> DeptSec
    BrOlaya --> DeptOps
```

---

## 4. Canonical Employee Relationships (One Identity Everywhere)

```mermaid
flowchart LR
    Emp["Canonical Employee (employees.id UUID)"]
    Emp --> Dir["Employee Directory & 360° Profile"]
    Emp --> HRM["HRM: Attendance, Leaves, OKRs, Reviews"]
    Emp --> Tasks["Tasks & Project Assignments"]
    Emp --> Custody["Technical Assets & Custody"]
    Emp --> Tickets["Help Desk Requester & Technician"]
    Emp --> CRM["CRM Account & Opportunity Owner"]
    Emp --> Approvals["Purchase & Workflow Initiator"]
    Emp --> Telegram["Verified Telegram Link"]
    Emp --> AIAgent["AI Agent Entity Resolution"]
```

---

## 5. RBAC & Resource-Level Permission Architecture

```mermaid
flowchart TD
    Req["Incoming HTTP / AI Tool Request"]
    Auth["Verify JWT Session & Active User"]
    Scope["resolve_company_scope (Tenant Isolation)"]
    RoleCheck["get_user_effective_roles (CompanyMembership)"]
    ModPerm["has_module_permission (Module + Action)"]
    HRGuard["Confidential HR Guard (can_view_confidential_hr)"]
    Allow["Execute Authorized Domain Service"]
    Deny["HTTP 403 Forbidden + Audit Log"]

    Req --> Auth --> Scope --> RoleCheck --> ModPerm
    ModPerm -->|Authorized| HRGuard
    ModPerm -->|Denied| Deny
    HRGuard --> Allow
```

---

## 6. CRM Opportunity Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Lead
    Lead --> Qualified : Qualification Verified
    Qualified --> Proposal : Quotation Sent
    Proposal --> Negotiation : Commercial Review
    Negotiation --> Won : Contract Signed (100%)
    Negotiation --> Lost : Closed Lost (0%)
    Lead --> Lost : Disqualified
```

---

## 7. Technical Asset & Custody Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Available : Asset Registered
    Available --> Assigned : Custody Handover
    Assigned --> Available : Custody Returned
    Assigned --> UnderMaintenance : Maintenance Opened
    Available --> UnderMaintenance : Preventive Maintenance
    UnderMaintenance --> Available : Repair Verified
    Assigned --> Damaged : Incident Reported
    Damaged --> Retired : Decommissioned
```

---

## 8. Attendance & Leave Data Flow

```mermaid
sequenceDiagram
    participant Emp as Employee / HR Officer
    participant API as POST /api/v1/hrm/attendance
    participant Svc as enterprise_service.py
    participant DB as AttendanceRecord & AuditLog

    Emp->>API: Submit Check-In / Check-Out / Leave
    API->>Svc: Validate Company Scope & WorkSchedule (Asia/Riyadh)
    Svc->>DB: Upsert AttendanceRecord (Compute Late & Worked Minutes)
    Svc->>DB: Append AuditLog Event
    DB-->>Emp: Verified Attendance Status (Never Inferred from Login)
```

---

## 9. Task Assignment & Telegram Synchronization Workflow

```mermaid
sequenceDiagram
    participant Mgr as Manager / AI Agent
    participant API as Task Service
    participant DB as PostgreSQL / SQLite
    participant TG as Telegram Bot Outbox

    Mgr->>API: Create & Assign Task (Canonical employee_id)
    API->>DB: Persist Task (Status = Assigned)
    API->>TG: Enqueue NotificationOutbox (if Telegram Linked)
    TG-->>Mgr: Delivery Status Recorded (Sent / Internal Only)
```

---

## 10. Help Desk Ticket Escalation Workflow

```mermaid
stateDiagram-v2
    [*] --> Open : Requester Submits Ticket
    Open --> Assigned : Technician Assigned
    Assigned --> InProgress : Investigation Started
    InProgress --> WaitingForUser : Clarification Needed
    WaitingForUser --> InProgress : User Responded
    InProgress --> Resolved : Root Cause Fixed
    Resolved --> Closed : Verified by Requester
```

---

## 11. Purchase Request & Unified BPMN Approval Workflow

```mermaid
stateDiagram-v2
    [*] --> Pending : Purchase / Leave / Change Submitted
    Pending --> Approved : Authorized Approver Decision
    Pending --> Rejected : Rejected with Notes
    Pending --> Cancelled : Withdrawn by Initiator
    Approved --> Executed : Cascaded to Domain Record
```

---

## 12. AI Action Agent Execution Lifecycle

```mermaid
flowchart LR
    U["1. Understand (Arabic/Dialect/English)"] --> R["2. Retrieve Context"]
    R --> E["3. Resolve Canonical UUIDs"]
    E --> P["4. Plan Tool Execution"]
    P --> V["5. Validate RBAC & Tenant Scope"]
    V --> Pr["6. Preview Dry-Run Card"]
    Pr --> C["7. Explicit User Confirmation"]
    C --> Ex["8. Execute Domain Transaction"]
    Ex --> Ve["9. Verify & Audit"]
```

---

## 13. Cross-Module Enterprise Integrations

```mermaid
flowchart TB
    CRM["CRM Opportunities"] --> Proj["Enterprise Projects"]
    Proj --> Tasks["Operational Tasks"]
    Tickets["Help Desk Tickets"] --> Tasks
    Purchase["Purchase Requests"] --> Approvals["Unified BPMN Approvals"]
    Leaves["HRM Leave Requests"] --> Approvals
    Maint["Maintenance Changes"] --> Approvals
    Approvals --> Attendance["Attendance Calendar (On Leave)"]
```

---

## 14. Self-Hosted Deployment Architecture

```mermaid
flowchart LR
    Browser["Enterprise Browser (RTL Desktop & Mobile)"] --> NextJS["Next.js 16 Frontend (:3000)"]
    NextJS --> FastAPI["FastAPI Backend (:8000)"]
    FastAPI --> PG[("PostgreSQL / SQLite Database")]
    FastAPI --> Poller["Telegram Poller Worker"]
    FastAPI --> Gemini["Google Gemini API (gemini-3-flash-preview)"]
```

---

## 15. Non-Destructive Database Migration Flow

```mermaid
flowchart LR
    Start["Application Startup"] --> CreateAll["Base.metadata.create_all()"]
    CreateAll --> MigrateCols["_migrate_columns() Idempotent ALTER TABLE"]
    MigrateCols --> HistoryBackfill["Preserve Existing Employees & Tasks"]
    HistoryBackfill --> Ready["Zero-Downtime Verified Schema"]
```
