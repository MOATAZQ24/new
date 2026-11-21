# محرك مسارات العمل والاعتمادات المتعددة
# Workflow & Multi-Stage Approval Engine Specification

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. نموذج الحالة والتحويلات (State Machine & Transitions)
يتبع النظام مسار عمل متوافق مع ITIL 4 لإدارة الحوادث والطلبات:

```
[Open] ──(assign)──> [Assigned] ──(start_work)──> [In Progress]
                                                        │
                      ┌───────────────┬─────────────────┘
                      │               │
            (request_approval)  (request_info)
                      │               │
                      ▼               ▼
             [Pending Approval]   [Waiting for User]
              │             │          │ (provide_info)
         (approve)      (reject)       │
              │             │          │
              ▼             ▼          │
        [In Progress]  [Cancelled]     │
              ▲                        │
              └────────────────────────┘
                      │
                  (resolve)
                      │
                      ▼
                  [Resolved] ──(close)──> [Closed]
                      │
                   (reopen)
                      │
                      ▼
                 [In Progress]
```

---

## 2. محرك الاعتمادات الإدارية (Approval Engine)
- عندما يختار المستخدم خدمة مصنفة بعلم `requires_approval = True` (مثل طلب استبدال جهاز أو منح صلاحيات حساسة):
  1. يتم تعيين حالة التذكرة المبدئية إلى `Pending Approval`.
  2. يتم توليد سجل اعتماد في جدول `ticket_approvals` مع تحديد المرحلة والمستخدم المعتمد.
  3. لا يتم تكليف الفني ببدء العمل إلا بعد صدور قرار الاعتماد الرسمي.
- عند الاعتماد (`Approved`):
  - تتحول حالة التذكرة إلى `Assigned` ويتم إشعار الفني ببدء التنفيذ.
- عند الرفض (`Rejected`):
  - تتحول التذكرة إلى `Cancelled` ويتم توثيق مبررات الرفض في سجل التدقيق وإشعار الموظف.

---

## 3. محاكي المسارات التفاعلي (Interactive Simulation Mode)
يتيح مكون `WorkflowBuilder.tsx` لمدراء تقنية المعلومات تشغيل محاكاة حية للمسار لاختبار الانتقالات قبل اعتمادها في بيئة الإنتاج:
- يبدأ المحاكي من مرحلة `Open`.
- يعرض الأزرار والإجراءات المتاحة انطلاقاً من الحالة الحالية.
- يتيح التحقق من اكتمال المسار وسلامة الانتقالات دون التأثير على التذاكر الحقيقية.
