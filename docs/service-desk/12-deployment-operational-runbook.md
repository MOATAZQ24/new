# دليل التشغيل والنشر الميداني (Operational Runbook)
# Deployment & Production Runbook

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Branch:** `feature/enterprise-service-desk`  

---

## 1. متطلبات التشغيل (System Prerequisites)
- **الخادم (Backend):** Python 3.11+ مع الحزم المثبتة (`fastapi`, `sqlalchemy`, `uvicorn`, `psutil`, `pydantic`).
- **الواجهة (Frontend):** Node.js 20+ مع Next.js 16 و React 19 وحزم Lucide و Tailwind CSS v4.
- **قاعدة البيانات:** PostgreSQL 15+ أو SQLite (للبيئات المعزولة والتطوير السريع).

---

## 2. خطوات الترقية وتطبيق التغييرات (Migration Steps)
1. تشغيل الترحيل التلقائي لقاعدة البيانات لإضافة الجداول والأعمدة الجديدة:
   ```bash
   python -c "from app.core.database import init_db; init_db()"
   ```
2. التأكد من سلامة زرع البيانات الافتراضية (Seed Defaults):
   - يتم استدعاء دالة `seed_service_desk_defaults(db, company_id)` تلقائياً عند أول استعلام لدليل الخدمات أو مسارات العمل.
3. تشغيل خادم الواجهة والخلفية:
   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts/start-lan.ps1 -KeepRunning
   ```

---

## 3. خطة التراجع الآمن (Rollback Procedure)
في حال دعت الحاجة للتراجع إلى ما قبل دمج فرع `feature/enterprise-service-desk`:
1. الأعمدة الستة المضافة في جدول `helpdesk_tickets` جميعها قابلة للقيمة الفارغة (`nullable=True`) ولا تكسر أي كود قديم.
2. الجداول الجديدة (`service_catalog_items`, `ticket_approvals`, `service_workflows`, `sla_policies`) لا تتداخل مع الجداول الأصلية.
3. التراجع البرمجي يتم ببساطة عبر العودة إلى الفرع الرئيسي:
   ```bash
   git checkout main
   ```

---

## 4. التحقق من الحوكمة وتوثيق المطور (Attribution Verification)
قبل اعتماد أي تعديل، يجب تشغيل سكربت التحقق من الحوكمة لضمان بقاء نسبة الامتثال 100%:
```bash
python scripts/verify_attribution.py
python scripts/governance/validate_attribution.py
```
المطور الأصلي المسجل: **معتز قاسم (Moataz Qasem) — 2026**.
جميع الحقوق والتوثيقات محمية وفق إطار عمل IGOS-DAPF.
