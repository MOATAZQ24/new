# مواصفات دليل الخدمات والنماذج الديناميكية
# Service Catalog & Dynamic Form Schema Specification

**Project:** Investor Gate OS (IGOS)  
**Original Developer:** Moataz Qasem (2026)  
**Governance Framework:** IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)  

---

## 1. فلسفة دليل الخدمات (Service Catalog Philosophy)
بدلاً من استقبال بلاغات نصية غير مكتملة، يقدم النظام دليلاً مبوباً للخدمات التقنية يغطي 6 مجالات أساسية مع نماذج ديناميكية (Dynamic Form Schemas) تلزم المستخدم بتقديم البيانات الفنية الضرورية لتشخيص العطل من أول لحظة.

### عناصر الدليل الافتراضية المدمجة (Default Catalog Offerings):
1. **صيانة حاسب آلي محمول أو مكتبي (Hardware Maintenance):**
   - العتاد المتأثر، الأعراض الملاحظة، التحقق من توصيل مصدر الطاقة.
2. **طلب استبدال جهاز معطوب أو ترقية عتاد (Hardware Replacement):**
   - يتطلب اعتماد إداري (Manager Approval)، بيان سبب الاستبدال، وحالة النسخ الاحتياطي للملفات.
3. **مشاكل انقطاع الشبكة الداخلية أو الواي فاي (Network Connectivity):**
   - نوع الاتصال (سلكي/لاسلكي)، نطاق التأثير (جهاز واحد أم القسم كاملاً)، عنوان IP التقريبي.
4. **طلب منح أو تعديل صلاحيات وصول (Access & Permissions):**
   - يتطلب اعتماد أمن المعلومات (IT Security Approval)، النظام المستهدف، مستوى الصلاحية، والمبرر التشغيلي.
5. **تهيئة وحل مشكلات البريد الإلكتروني (Corporate Email & Outlook):**
   - نظام التشغيل، تطبيق البريد، نوع المشكلة (إرسال/استقبال/سعة الصندوق).
6. **تثبيت أو ترخيص برمجيات الأعمال (Software Licensing):**
   - البرنامج المطلوب، الغرض من الاستخدام، ومدة الترخيص.

---

## 2. معيار JSON للنماذج الديناميكية (Form Schema Standard)
تُخزن النماذج في حقل `dynamic_form_schema` بتنسيق JSON قياسي يدعم الأنواع التالية:
- `text`: حقل نصي قصير مع placeholder.
- `textarea`: حقل نصي متعدد الأسطر مع عدد أسطر محدد.
- `select`: قائمة منسدلة بخيارات محددة.
- `radio`: أزرار اختيار حصرية مبوبة.
- `checkbox`: خانات اختيار متعددة.

```json
{
  "fields": [
    {
      "name": "hardware_type",
      "label_ar": "نوع الجهاز المتأثر",
      "type": "select",
      "required": true,
      "options": ["كمبيوتر محمول (Laptop)", "كمبيوتر مكتبي (Desktop)", "شاشة خارجية (Monitor)"]
    },
    {
      "name": "is_power_connected",
      "label_ar": "هل تم التأكد من توصيل محول الطاقة ومصدر الكهرباء؟",
      "type": "radio",
      "required": true,
      "options": ["نعم، موصول ويعمل", "لا، لم يتم التأكد"]
    }
  ]
}
```
يتم عرض هذه الحقول آلياً في الخطوة الثالثة من معالج التذاكر التفاعلي، ويتم حفظ إجابات المستخدم في حقل `custom_fields_data` على التذكرة.
