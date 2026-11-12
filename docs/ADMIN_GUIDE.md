# Investor Gate IT Operations Management System — Administrator Guide (دليل مدير النظام)

## 1. Getting Started & Logging In
1. Open the system in your browser: `https://<server-ip>` or `http://localhost:3000`.
2. Enter your credentials on the login screen (`/login`).
   - Default Super Admin: `admin` / `Admin@12345`.
3. The interface will open in **Arabic RTL** with primary navigation along the right sidebar.

---

## 2. Company & Branch Management (إدارة الشركات والفروع)
- Navigate to **الشركات والفروع** (`/companies`).
- Use the **تبديل الشركة** (Company Switcher) dropdown in the top navbar to select your active organization context.
- Create new branches and departments under each company.
- Manage company codes, bilingual names (Arabic/English), contact information, and branding logos.

---

## 3. Employee & User Accounts (إدارة الموظفين والمستخدمين)
- Navigate to **الموظفين والمستخدمين** (`/employees`).
- Create employee records with employee numbers, job titles, and departmental hierarchy.
- Create user accounts for employees:
  - Assign RBAC roles (`Super Admin`, `Company Admin`, `IT Manager`, `IT Technician`, `Employee`, `Auditor`).
  - Set initial passwords (stored via Argon2id).
  - Deactivate or reactivate accounts as needed.

---

## 4. Technical Assets & QR Codes (الأصول التقنية)
- Navigate to **الأصول التقنية** (`/assets`).
- Add physical devices (Laptops, Desktops, Monitors, Mobile Phones, Printers).
- Generate and print dynamic QR codes for physical tagging on device chassis.
- Track warranty expiration, serial numbers, brands, models, and operational conditions (`Available`, `Assigned`, `Under Maintenance`, `Damaged`, `Retired`, `Lost`).

---

## 5. Asset Custody & Handover (إدارة العهد والتسليم)
- Navigate to **إدارة العهد والتسليم** (`/custody`).
- **تسليم عهدة (Assign):** Assign an available asset to an employee. Device status transitions atomically to `Assigned`.
- **معاينة سند الاستلام (Handover Receipt):** View and print an official Arabic handover receipt detailing serial numbers, accessories, and acknowledgment signatures.
- **إرجاع العهدة (Return):** Record device condition upon return. Device transitions back to `Available` or `Under Maintenance`.
- **نقل العهدة (Transfer):** Transfer custody directly between employees with full audit history preservation.

---

## 6. IT Infrastructure (البنية التحتية والشبكات)
- Navigate to **البنية التحتية** (`/infrastructure`).
- Register routers, switches, firewalls, servers, NAS, and access points.
- Document management IP addresses, hostnames, VLAN assignments, locations, and firmware versions.
- **Credential Reference:** Enter only vault references (e.g., `vault://network/fw01`), never plaintext credentials.

---

## 7. Third-Party Subscriptions (الاشتراكات الخارجية)
- Navigate to **الاشتراكات والخدمات** (`/subscriptions`).
- Track web hosting, cloud servers, SaaS tools, domains, and email hosting services.
- Monitor billing cycles (`Monthly`, `Quarterly`, `Annual`), prices, and currencies (SAR, USD).
- View total monthly and annual commitments, active subscriptions count, and upcoming renewal alerts.

---

## 8. Maintenance & Configuration Changes (الصيانة وتعديل الإعدادات)
- Navigate to **سجلات الصيانة والتغيير** (`/maintenance`).
- **الصيانة (Maintenance):** Hardware troubleshoot and repair records.
- **الاستبدال (Replacement):** Track original damaged asset and assigned replacement asset.
- **تعديل الإعدادات (Configuration Change):** Mandatory risk assessments, execution windows, rollback plans, and approval workflows. Authorized managers can approve or reject changes with a single click.

---

## 9. Task Management (المهام التشغيلية)
- Navigate to **المهام التشغيلية** (`/tasks`).
- Assign actionable tasks to technicians with due dates and priority levels (`Urgent`, `High`, `Medium`, `Low`).
- Filter between "جميع المهام" (All Tasks) and "مهامي المسندة إلي" (My Tasks).
- Add progress updates and collaborate via task comments.

---

## 10. IT Help Desk (مكتب المساعدة والدعم الفني)
- Navigate to **مكتب المساعدة** (`/tickets`).
- Automatically generate sequential ticket numbers (e.g. `TCK-2026-0001`).
- Move tickets through the lifecycle: `Open` -> `In Progress` -> `Waiting for User` -> `Resolved` -> `Closed`.
- Post public responses or internal technician notes (highlighted in amber, hidden from regular employees).
- Convert complex tickets into actionable IT tasks with one click.

---

## 11. Reports & Exports (التقارير والتصدير)
- Navigate to **التقارير والتصدير** (`/reports`).
- Export all 8 system datasets into **Excel-compatible CSV with UTF-8 BOM** (proper Arabic text rendering in Microsoft Excel).
- View and print standardized HTML reports ready for PDF printing.
