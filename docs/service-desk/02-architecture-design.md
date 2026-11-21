# التصميم المعماري والمخطط الهيكلي للنظام
# Architecture & System Design Specification

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Branch:** `feature/enterprise-service-desk`  

---

## 1. النظرة المعمارية العامة (High-Level Architecture)
يعتمد نظام الخدمة الفنية الموحد على معمارية متعددة الطبقات (Multi-Tier Layered Architecture) تدعم عزل الشركات المتعددة (Multi-Tenant Isolation) والأمان الصارم على مستوى الخادم:

```
┌──────────────────────────────────────────────────────────┐
│              Next.js 16 + React 19 Client UI             │
│  - Self-Service Portal      - Adaptive Wizard (5-Steps)  │
│  - Command Center Ribbon    - Technician Workspace       │
│  - Agile Kanban Board       - Visual Workflow Builder    │
└────────────────────────────┬─────────────────────────────┘
                             │ HTTPS / JSON REST API
┌────────────────────────────▼─────────────────────────────┐
│                 FastAPI Python Backend                   │
│  - Service Catalog Engine   - Deterministic Router (ITIL)│
│  - Multi-Stage Approvals    - SLA Milestone Tracker      │
│  - Voice Note Processor     - Audit & Telegram Dispatcher│
└────────────────────────────┬─────────────────────────────┘
                             │ SQLAlchemy ORM + JSON Fields
┌────────────────────────────▼─────────────────────────────┐
│                   PostgreSQL Database                    │
│  - helpdesk_tickets         - service_catalog_items      │
│  - ticket_approvals         - service_workflows          │
│  - sla_policies             - knowledge_articles         │
└──────────────────────────────────────────────────────────┘
```

---

## 2. مصفوفة النماذج وقاعدة البيانات (Database Schema Models)
1. **`helpdesk_tickets` (الجدول الأساسي للتذاكر):**
   - تم توسيع الجدول بـ 6 حقول جديدة: `catalog_item_id` (FK), `custom_fields_data` (JSON), `current_approval_stage`, `approval_status`, `first_response_at`, `escalated_at`.
2. **`service_catalog_items` (عناصر دليل الخدمات):**
   - يشمل تصنيف الخدمة (`category`)، الأولوية الافتراضية، المدة التقديرية، علم طلب الاعتماد (`requires_approval`)، والنموذج الديناميكي (`dynamic_form_schema`).
3. **`ticket_approvals` (مراحل الاعتمادات):**
   - يسجل مرحلة الاعتماد (`approval_stage`)، الفني أو المدير المعين (`assigned_approver_id`)، الحالة (`status`)، مبررات القرار (`decision_notes`)، والمستخدم المتخذ للقرار (`decided_by_id`).
4. **`service_workflows` (مسارات العمل التفاعلية):**
   - يسجل محطات ومصفوفة انتقالات الحالات بتنسيق JSON (`nodes_json`, `transitions_json`) مع إصدارات تراكمية (`version`).
5. **`sla_policies` (سياسات مستوى الخدمة):**
   - يسجل أهداف أول استجابة والحل النهائي بالدقائق، مع علم تطبيق ساعات العمل الرسمية (`business_hours_only`).

---

## 3. التكامل الحتمي مع الأصول والعهد (Asset & Custody Integration)
لا يحتاج النظام إلى جداول تكرارية لحفظ عتاد الموظف؛ إذ يعتمد على ربط `HelpDeskTicket.related_asset_id` مباشرة بجدول `technical_assets`. عند فتح التذكرة في مساحة عمل الفني:
- يتم جلب المواصفات التقنية (Serial Number, Model, Asset Code).
- يتم استعلام كافة التذاكر السابقة التي ارتبطت بنفس الأصل لتوفير "سجل الصيانة التاريخي" (Maintenance History Log) بضغطة زر.
