# مرجع واجهات برمجة التطبيقات (API Reference)
# Service Desk REST Endpoints Reference

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  
**Base URL:** `/api/v1/tickets`  

---

## 1. التذاكر الأساسية (Tickets CRUD)
- **`GET /api/v1/tickets`**: استعلام التذاكر المفلترة مع الترقيم والبحث.
- **`POST /api/v1/tickets`**: فتح تذكرة جديدة مع دعم دليل الخدمات والحقول الديناميكية.
- **`GET /api/v1/tickets/{id}`**: استرجاع تفاصيل التذكرة، سجل الردود، مواصفات العتاد، والاعتمادات.
- **`POST /api/v1/tickets/{id}/status`**: تحديث حالة التذكرة مع تسجيل التدقيق.
- **`POST /api/v1/tickets/{id}/comments`**: إضافة رد عام أو ملاحظة فنية داخلية (`is_internal: true`).
- **`POST /api/v1/tickets/{id}/convert-to-task`**: تحويل التذكرة إلى مهمة تشغيلية.
- **`POST /api/v1/tickets/voice/upload`**: رفع ملف صوتي والحصول على رابط الملاحظة الصوتية.

---

## 2. دليل الخدمات (Service Catalog)
- **`GET /api/v1/tickets/catalog`**: قائمة عناصر دليل الخدمات (يتم زرع العناصر الافتراضية آلياً إذا كانت فارغة).
- **`POST /api/v1/tickets/catalog`**: إضافة خدمة جديدة إلى الدليل (صلاحية مدير).
- **`PUT /api/v1/tickets/catalog/{id}`**: تعديل بيانات الخدمة والنموذج الديناميكي.
- **`DELETE /api/v1/tickets/catalog/{id}`**: إلغاء تفعيل عنصر الخدمة (Soft Delete).

---

## 3. الاعتمادات الإدارية (Approvals)
- **`GET /api/v1/tickets/approvals`**: استعلام قائمة طلبات الاعتماد (تصفية تلقائية حسب دور المستخدم).
- **`POST /api/v1/tickets/approvals/{id}/decision`**: تسجيل قرار القبول أو الرفض (`decision: "Approved" | "Rejected"`).

---

## 4. مسارات العمل وسياسات SLA (Workflows & SLAs)
- **`GET /api/v1/tickets/workflows`**: استعلام مسارات العمل المنشورة للشركة.
- **`POST /api/v1/tickets/workflows`**: حفظ وتحديث مسار عمل تفاعلي مع زيادة رقم الإصدار.
- **`GET /api/v1/tickets/slas`**: استعلام مصفوفة سياسات مستوى الخدمة.
- **`POST /api/v1/tickets/slas`**: إنشاء سياسة مستوى خدمة جديدة.
- **`PUT /api/v1/tickets/slas/{id}`**: تعديل أهداف الاستجابة والحل لسياسة معينة.

---

## 5. قاعدة المعرفة والحلول (Knowledge Base)
- **`GET /api/v1/tickets/knowledge/list`**: بحث فوري في مقالات المعرفة بحسب التصنيف والكلمات المفتاحية.
- **`POST /api/v1/tickets/knowledge`**: إضافة مقال معرفي جديد أو تحويل حل تذكرة ناجحة إلى مقال.
