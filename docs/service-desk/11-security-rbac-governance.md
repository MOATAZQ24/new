# الأمان وحوكمة الصلاحيات (RBAC & Multi-Tenancy)
# Security, Multi-Tenant Isolation & Role-Based Access Control

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. عزل الشركات المتعددة على مستوى الخادم (Server-Side Isolation)
- كل طلب موجه إلى واجهات التذاكر، دليل الخدمات، الاعتمادات، أو مسارات العمل يمر عبر دالة التحقق الحتمية `resolve_company_scope`.
- يُمنع تماماً تمرير معرّف شركة من جانب العميل بدون التحقق من عضوية المستخدم الصريحة فيها.
- يتم عزل البيانات على مستوى قاعدة البيانات بحيث لا يستطيع فني أو موظف في شركة الاطلاع على تذاكر أو عتاد شركة أخرى في المجموعة القابضة.

---

## 2. مصفوفة الصلاحيات (RBAC Matrix)
- **Super Admin:** وصول كامل لكافة الشركات، إدارة مسارات العمل والسياسات العامة.
- **Company Admin / IT Manager:** إدارة دليل الخدمات، نشر مسارات العمل، تعديل سياسات SLA، واعتماد كافة طلبات الشركة.
- **IT Technician:** الاطلاع على التذاكر المسندة، إضافة ملاحظات فنية داخلية (`is_internal: true`)، تحديث الحالات، وتحويل البلاغات لمهام.
- **Employee (الموظف العادي):** فتح تذاكر جديدة عبر دليل الخدمات، استعراض تذاكره فقط، إضافة ردود عامة (لا يرى الملاحظات الفنية الداخلية إطلاقاً)، والبحث في قاعدة المعرفة المنشورة.

---

## 3. حماية الملاحظات الفنية الداخلية (Internal Notes Confidentiality)
يتم التحقق من الصلاحيات على مستوى الخادم:
```python
user_roles = get_user_roles(current_user, db, company_id=ticket.company_id)
is_staff = any(r in ["Super Admin", "Company Admin", "IT Manager", "IT Technician"] for r in user_roles)

comment_query = db.query(TicketComment).filter(TicketComment.ticket_id == ticket_id)
if not is_staff:
    comment_query = comment_query.filter(TicketComment.is_internal == False)
```
يضمن هذا الكود عدم إرسال الملاحظات الفنية الحساسة أو نتائج الفحص الداخلي إلى متصفح الموظف العادي حتى لو تم فحص استجابة الشبكة (Network Payload).
