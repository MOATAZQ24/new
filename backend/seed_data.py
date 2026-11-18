"""Seed script for Multi-Company IT Operations Management System.
Populates realistic data for 3 companies, branches, departments, employees,
roles, users, technical assets, custody assignments, IT infrastructure,
subscriptions, maintenance, tasks, and help desk tickets.
"""

import sys
import os
from datetime import datetime, date, timedelta
import uuid

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.database import SessionLocal, init_db
from app.core.security import hash_password
from app.models.company import Company, Branch, Department
from app.models.user import Employee, User, Role, UserRole, CompanyMembership
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task, TaskComment
from app.models.ticket import HelpDeskTicket, TicketComment
from app.models.notification import Notification
from app.models.audit import AuditLog


def seed(include_demo: bool | None = None):
    if include_demo is None:
        include_demo = os.environ.get("SEED_DEMO_DATA", "").strip().lower() in ("1", "true", "yes") or ("--demo" in sys.argv)
    print(f"Initializing database tables (include_demo={include_demo})...")
    init_db()
    db = SessionLocal()

    try:
        # Check if already seeded
        admin_check = db.query(User).filter(User.username == "admin").first()
        if admin_check:
            print("Database already contains admin user. Skipping seed to preserve existing records.")
            return

        print("1. Creating System Roles...")
        role_definitions = [
            ("Super Admin", "مدير النظام العام", "صلاحيات كاملة على مستوى جميع الشركات والعمليات"),
            ("Company Admin", "مدير الشركة", "إدارة كافة بيانات الشركة والموظفين والأصول والتقارير"),
            ("IT Manager", "مدير تقنية المعلومات", "إدارة البنية التحتية والمهام والموافقات ومكتب المساعدة"),
            ("IT Technician", "فني تقنية معلومات", "استلام التذاكر وتنفيذ مهام الصيانة وتسليم العهد"),
            ("Employee", "موظف", "طلب الدعم الفني واستلام العهد ورفع التذاكر"),
            ("Auditor", "مدقق ومراجع", "الاطلاع على التقارير وسجلات المراجعة بدون تعديل"),
        ]
        roles_dict = {}
        for name, name_ar, desc in role_definitions:
            r = Role(name=name, name_ar=name_ar, description=desc, is_system_role=True)
            db.add(r)
            db.commit()
            db.refresh(r)
            roles_dict[name] = r

        print("2. Creating Super Admin User...")
        superadmin = User(
            username="admin",
            password_hash=hash_password("Admin@12345"),
            email="admin@investorgate.sa",
            account_status="Active",
            is_superadmin=True,
        )
        db.add(superadmin)
        db.commit()
        db.refresh(superadmin)

        # Assign Super Admin role
        ur_admin = UserRole(user_id=superadmin.id, role_id=roles_dict["Super Admin"].id)
        db.add(ur_admin)

        # ── 3 Canonical Companies & 5 Canonical Branches ─────────────────
        print("3. Creating Canonical Companies & 5 Branches...")
        from app.services.enterprise_service import ensure_canonical_internal_companies, ensure_canonical_five_branches

        canonical_branches = [
            ("الرياض – السلي (مخرج 17)", "الرياض - حي السلي (مخرج 17)"),
            ("الرياض – الفيصلية (مخرج 18)", "الرياض - حي الفيصلية (مخرج 18)"),
            ("الرياض – العليا", "الرياض - حي العليا"),
            ("الدمام", "الدمام - المنطقة الشرقية"),
            ("جدة", "جدة - منطقة مكة المكرمة"),
        ]

        companies_data = [
            {
                "ar": "شركة بوابة المستثمر للتقنية",
                "en": "Investor Gate Technology Co.",
                "code": "IGT",
                "email": "info@investorgate.sa",
                "phone": "+966 11 200 1111",
                "branches": canonical_branches,
                "departments": [
                    "تقنية المعلومات والأنظمة",
                    "الأمن السيبراني والبنية التحتية",
                    "العمليات والدعم الفني",
                    "الموارد البشرية والشؤون الإدارية",
                    "المالية والمحاسبة",
                ],
            },
            {
                "ar": "شركة بلينك بيل للتقنية المالية",
                "en": "BlinkBill FinTech",
                "code": "BLB",
                "email": "ops@blinkbill.sa",
                "phone": "+966 11 200 2222",
                "branches": canonical_branches,
                "departments": [
                    "الدعم الفني ومكتب المساعدة",
                    "إدارة الأنظمة والمنصات",
                    "العمليات المالية والفوترة",
                    "خدمة العملاء",
                ],
            },
            {
                "ar": "منصة إنفستيا للاستثمار",
                "en": "Invesstia Investment Platform",
                "code": "INV",
                "email": "ops@invesstia.sa",
                "phone": "+966 11 200 3333",
                "branches": canonical_branches,
                "departments": [
                    "إدارة المنصة والتقنية",
                    "العمليات الاستثمارية",
                    "الأمن والامتثال",
                    "خدمة المستثمرين",
                ],
            },
        ]

        today = date.today()

        for c_idx, c_info in enumerate(companies_data):
            company = db.query(Company).filter(Company.company_code == c_info["code"]).first()
            if not company:
                company = Company(
                    company_name_ar=c_info["ar"],
                    company_name_en=c_info["en"],
                    company_code=c_info["code"],
                    contact_email=c_info["email"],
                    contact_phone=c_info["phone"],
                    company_type="Internal",
                    status="Active",
                )
                db.add(company)
                db.commit()
                db.refresh(company)
            else:
                company.contact_email = company.contact_email or c_info["email"]
                company.contact_phone = company.contact_phone or c_info["phone"]
                company.company_type = "Internal"
                company.status = "Active"
                db.commit()

            # Link Super Admin to each company
            existing_mem = db.query(CompanyMembership).filter(
                CompanyMembership.user_id == superadmin.id,
                CompanyMembership.company_id == company.id,
            ).first()
            if not existing_mem:
                db.add(CompanyMembership(user_id=superadmin.id, company_id=company.id, role_id=roles_dict["Super Admin"].id, is_default=(c_idx == 0)))

            # Canonical 5 Branches
            branches = ensure_canonical_five_branches(db, company.id)
            db.commit()

            # Departments
            depts = []
            for d_name in c_info["departments"]:
                d = db.query(Department).filter(
                    Department.company_id == company.id,
                    Department.department_name == d_name,
                ).first()
                if not d:
                    d = Department(
                        company_id=company.id,
                        branch_id=branches[0].id,
                        department_name=d_name,
                        status="Active",
                    )
                    db.add(d)
                    db.commit()
                    db.refresh(d)
                depts.append(d)

            if not include_demo:
                db.add(AuditLog(
                    user_id=superadmin.id,
                    company_id=company.id,
                    action="INITIALIZE_COMPANY",
                    resource_type="Company",
                    resource_id=str(company.id),
                    new_values={"company_name": company.company_name_ar, "code": company.company_code, "mode": "clean_release"},
                ))
                db.commit()
                continue

            # 10 Employees per company
            employee_names = [
                ("سعود عبدالله القحطاني", "Saud Al-Qahtani", "مدير تقنية المعلومات", "saud"),
                ("فهد عبدالعزيز الشمري", "Fahad Al-Shammari", "أخصائي شبكات وبنية تحتية", "fahad"),
                ("نورة خالد الدوسري", "Noura Al-Dossary", "مشرفة الدعم الفني", "noura"),
                ("محمد إبراهيم الزهراني", "Mohammed Al-Zahrani", "فني صيانة ودعم ميداني", "mohammed"),
                ("سارة أحمد المطيري", "Sarah Al-Mutairi", "محلل نظم معلومات", "sarah"),
                ("عبدالرحمن صالح الغامدي", "Abdulrahman Al-Ghamdi", "أخصائي أمن سيبراني", "abdulrahman"),
                ("منى يوسف العتيبي", "Mona Al-Otaibi", "مديرة موارد بشرية", "mona"),
                ("عمر سليمان الحربي", "Omar Al-Harbi", "محاسب أول", "omar"),
                ("ريم طلال العنزى", "Reem Al-Anzi", "منسقة عمليات وإسناد", "reem"),
                ("خالد منصور الشهري", "Khalid Al-Shehri", "مسؤول المشتريات والخدمات", "khalid"),
            ]

            employees = []
            users = []
            for e_idx, (name_ar, name_en, title, username_prefix) in enumerate(employee_names):
                emp_code = f"EMP-{c_info['code']}-{(e_idx + 1):03d}"
                email = f"{username_prefix}@{c_info['code'].lower()}.sa"
                phone = f"+966 55 {c_idx+1}{e_idx:02d} 1234"

                dept_assigned = depts[e_idx % len(depts)]
                branch_assigned = branches[e_idx % len(branches)]

                emp = Employee(
                    company_id=company.id,
                    branch_id=branch_assigned.id,
                    department_id=dept_assigned.id,
                    employee_number=emp_code,
                    full_name=name_ar,
                    job_title=title,
                    email=email,
                    phone=phone,
                    employment_status="Active",
                )
                db.add(emp)
                db.commit()
                db.refresh(emp)
                employees.append(emp)

                # Create user accounts for key staff
                # 0: Company Admin & IT Manager, 1-3: IT Technicians, 4-9: Standard Employees
                u_name = f"{username_prefix}_{c_info['code'].lower()}"
                u_role = "Employee"
                if e_idx == 0:
                    u_role = "Company Admin"
                elif e_idx in [1, 2]:
                    u_role = "IT Manager"
                elif e_idx == 3:
                    u_role = "IT Technician"
                elif e_idx == 4:
                    u_role = "Auditor"

                user = User(
                    employee_id=emp.id,
                    username=u_name,
                    password_hash=hash_password("Pass@12345"),
                    email=email,
                    account_status="Active",
                    is_superadmin=False,
                )
                db.add(user)
                db.commit()
                db.refresh(user)
                users.append(user)

                # Link user role
                db.add(UserRole(user_id=user.id, role_id=roles_dict[u_role].id))
                # Link company membership
                db.add(CompanyMembership(user_id=user.id, company_id=company.id, is_default=True))
                db.commit()

            print(f"   Created 10 employees & users for {c_info['code']}")

            # ── Technical Assets (8-10 assets per company) ───────────────────
            asset_specs = [
                ("LAP-001", "MacBook Pro 16", "Laptop", "Apple", "M3 Pro 36GB", "C02G123456", "New"),
                ("LAP-002", "Dell Latitude 5540", "Laptop", "Dell", "i7 16GB 512GB", "DL98765432", "Excellent"),
                ("LAP-003", "Lenovo ThinkPad T14", "Laptop", "Lenovo", "Ryzen 7 32GB", "PF345678", "Good"),
                ("LAP-004", "HP EliteBook 840", "Laptop", "HP", "G10 i7 16GB", "5CG1234ABC", "Good"),
                ("DSK-001", "Dell OptiPlex 7090", "Desktop", "Dell", "Core i7 16GB", "DL7090XYZ", "Excellent"),
                ("MON-001", "Dell UltraSharp 27 4K", "Monitor", "Dell", "U2723QE", "CN012345", "Excellent"),
                ("MON-002", "LG Ergo 32 4K", "Monitor", "LG", "32UN880", "LG880XYZ", "Good"),
                ("MOB-001", "iPhone 15 Pro", "Mobile Phone", "Apple", "128GB Titanium", "F17X9999", "New"),
                ("TAB-001", "iPad Air 11", "Tablet", "Apple", "M2 128GB Wi-Fi", "DMP98765", "Good"),
                ("PRN-001", "HP LaserJet Pro MFP", "Printer", "HP", "M428fdw", "PHB12345", "Good"),
            ]

            tech_assets = []
            for a_idx, (code_suffix, a_name, a_type, brand, model, serial, cond) in enumerate(asset_specs):
                full_code = f"AST-{c_info['code']}-{code_suffix}"
                assigned_emp = employees[a_idx % len(employees)] if a_idx < 6 else None
                status_val = "Assigned" if assigned_emp else ("Under Maintenance" if a_idx == 6 else "Available")

                qr_text = f"ASSET:{full_code}|CID:{company.id}"
                qr_svg = f"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%23123D32'/><text x='50%' y='50%' text-anchor='middle' fill='%23ffffff' font-size='10'>{full_code}</text></svg>"

                asset = TechnicalAsset(
                    company_id=company.id,
                    branch_id=branches[a_idx % len(branches)].id,
                    department_id=depts[a_idx % len(depts)].id,
                    assigned_employee_id=assigned_emp.id if assigned_emp else None,
                    asset_code=full_code,
                    asset_name=a_name,
                    asset_type=a_type,
                    brand=brand,
                    model=model,
                    serial_number=f"{serial}-{c_info['code']}",
                    purchase_date=today - timedelta(days=200 + a_idx * 30),
                    warranty_expiry=today + timedelta(days=365 - a_idx * 20),
                    condition=cond,
                    status=status_val,
                    qr_code_data=qr_svg,
                    notes=f"أصل رسمي تابع لـ {c_info['ar']}",
                )
                db.add(asset)
                db.commit()
                db.refresh(asset)
                tech_assets.append(asset)

                # If assigned, create active custody record
                if assigned_emp:
                    cust = AssetCustody(
                        asset_id=asset.id,
                        company_id=company.id,
                        employee_id=assigned_emp.id,
                        assigned_by=superadmin.id,
                        assignment_date=datetime.utcnow() - timedelta(days=100 - a_idx * 10),
                        expected_return_date=today + timedelta(days=200),
                        condition_on_assignment=cond,
                        acknowledgment=True,
                        status="Active",
                        notes=f"تم تسليم العهدة للموظف {assigned_emp.full_name} وفق نموذج الاستلام المعتمد",
                    )
                    db.add(cust)

            db.commit()
            print(f"   Created 10 technical assets & custody for {c_info['code']}")

            # ── IT Infrastructure (4-5 devices per company) ──────────────────
            infra_devices = [
                ("FW-01", "Cisco Firepower 1120", "Firewall", "Cisco", "FPR1120-NGFW", "10.0.1.1", "VLAN 10 - MGMT"),
                ("SW-CORE-01", "Cisco Catalyst 9300", "Switch", "Cisco", "C9300-48P", "10.0.1.2", "VLAN 10 - CORE"),
                ("RTR-EDGE-01", "Fortinet FortiGate 80F", "Router", "Fortinet", "FG-80F", "10.0.1.254", "VLAN 1 - WAN"),
                ("AP-OFFICE-01", "Aruba AP-515 Wi-Fi 6", "Access Point", "Aruba", "AP-515", "10.0.20.10", "VLAN 20 - WLAN"),
                ("SRV-PROD-01", "Dell PowerEdge R750", "Server", "Dell", "R750 2x Xeon 128GB", "10.0.50.10", "VLAN 50 - SERVERS"),
            ]

            for d_idx, (d_name, full_title, d_type, mfr, mdl, ip, vlan) in enumerate(infra_devices):
                dev = ITInfrastructure(
                    company_id=company.id,
                    branch_id=branches[0].id,
                    device_name=f"{d_name}-{c_info['code']}",
                    device_type=d_type,
                    manufacturer=mfr,
                    model=mdl,
                    serial_number=f"SN-{c_info['code']}-{d_idx+1001}",
                    hostname=f"{d_name.lower()}.{c_info['code'].lower()}.local",
                    management_ip=ip,
                    network_name=f"NET-{c_info['code']}-INTERNAL",
                    vlan=vlan,
                    location="غرفة الخوادم الرئيسية (MDF Room)",
                    responsible_person_id=employees[1].id,
                    credential_reference=f"vault://it-ops/credentials/{c_info['code'].lower()}/{d_name.lower()}",
                    firmware_version="v17.9.4a LTS",
                    last_configuration_change=datetime.utcnow() - timedelta(days=15),
                    status="Active",
                    notes="جهاز بنية تحتية حيوي - لا يتم تعديل الإعدادات إلا بعد إذن التغيير المعتمد",
                )
                db.add(dev)
            db.commit()

            # ── Third-Party Subscriptions (5-6 services per company) ─────────
            subscriptions_data = [
                ("Microsoft 365 Business Premium", "Microsoft", "SaaS", "Business", "Monthly", 85.00, 15),
                ("AWS Cloud Infrastructure Hosting", "Amazon Web Services", "Cloud Hosting", "Enterprise", "Monthly", 1850.00, 25),
                ("FortiGuard Security Services Bundle", "Fortinet", "Security", "Standard", "Annual", 4200.00, 45),
                ("Domain Registration & DNS (.sa / .com)", "SaudiNIC & Cloudflare", "Domain Registration", "Standard", "Annual", 350.00, 20),
                ("CrowdStrike Falcon Endpoint Security", "CrowdStrike", "Security", "Professional", "Annual", 6500.00, 80),
                ("Zendesk Support Enterprise Suite", "Zendesk", "SaaS", "Enterprise", "Annual", 8900.00, 110),
            ]

            for s_name, prov, stype, pkg, cycle, price, ren_offset in subscriptions_data:
                ren_date = today + timedelta(days=ren_offset)
                exp_date = ren_date + timedelta(days=5)

                sub = ThirdPartySubscription(
                    company_id=company.id,
                    service_name=s_name,
                    provider=prov,
                    subscription_type=stype,
                    package_type=pkg,
                    assigned_owner_id=employees[0].id,
                    payment_responsible_id=employees[7].id,
                    account_email=f"billing@{c_info['code'].lower()}.sa",
                    start_date=today - timedelta(days=365),
                    renewal_date=ren_date,
                    expiry_date=exp_date,
                    billing_cycle=cycle,
                    price=price,
                    currency="SAR",
                    auto_renewal=True,
                    status="Active" if ren_offset > 30 else "Expiring Soon",
                    notes=f"اشتراك أساسي معتمد لـ {c_info['ar']}",
                )
                db.add(sub)
            db.commit()

            # ── Maintenance & Configuration Changes ──────────────────────────
            maint_records = [
                (
                    "Configuration Change",
                    "تحديث قواعد جدار الحماية وعزل خوادم التطبيقات",
                    "تعديل قواعد جدار الحماية FortiGate لعزل شبكة التطبيقات عن شبكة الضيوف",
                    "رفع مستوى الأمان وسد ثغرات المنافذ غير الضرورية",
                    "Approved",
                    "In Progress",
                ),
                (
                    "Maintenance",
                    "استبدال معجون التبريد وتنظيف خادم البيانات الرئيسي",
                    "صيانة وقائية دورية ومراقبة درجات الحرارة وتنظيف الفلاتر",
                    "صيانة وقائية دورية مجدولة نصف سنوية",
                    "Approved",
                    "Completed",
                ),
                (
                    "Replacement",
                    "استبدال قرص تخزين تالف في مصفوفة RAID للخادم",
                    "استبدال قرص SAS 1.2TB بقرص بديل جديد من نفس الموديل",
                    "فشل في القرص رقم 3 بمصفوفة RAID 5",
                    "Approved",
                    "Completed",
                ),
            ]

            for action_t, title, desc, reason, app_stat, stat in maint_records:
                mrec = MaintenanceRecord(
                    company_id=company.id,
                    target_type="infrastructure",
                    target_id=tech_assets[0].id,  # Linked to first asset
                    action_type=action_t,
                    title=title,
                    description=desc,
                    reported_by_id=employees[1].id,
                    assigned_technician_id=users[3].id,
                    start_date=datetime.utcnow() - timedelta(days=3),
                    completion_date=datetime.utcnow() if stat == "Completed" else None,
                    change_reason=reason,
                    risk_assessment="مستوى الخطورة: متوسط. يتطلب نافذة عمل بعد ساعات الدوام الرسمي",
                    approval_status=app_stat,
                    planned_execution_window="الجمعة 11:00 مساءً حتى 02:00 صباحاً",
                    rollback_plan="استعادة نسخة الإعدادات الاحتياطية v2026-11-backup.cfg",
                    verification_result="تم فحص الربط واختبار سرعة الاستجابة بنجاح" if stat == "Completed" else "قيد الاختبار",
                    cost=450.00 if action_t == "Replacement" else 0.0,
                    status=stat,
                    notes="تم التوثيق والمراجعة وفق سياسة إدارة التغييرات",
                )
                db.add(mrec)
            db.commit()

            # ── Tasks ────────────────────────────────────────────────────────
            tasks_data = [
                ("تجهيز حاسب محمول للموظف الجديد في المبيعات", "تثبيت النظام وحزمة البرامج وإعداد البريد والربط مع الدومين", "High", "To Do", today + timedelta(days=2)),
                ("إجراء الفحص الأسبوعي للنسخ الاحتياطي لقاعدة البيانات", "التحقق من سلامة ملفات النسخ وتجربة استرجاع تجريبية", "Medium", "In Progress", today + timedelta(days=3)),
                ("تجديد شهادة SSL لبوابة الموظفين الداخلية", "تثبيت شهادة النطاق الجديدة وتحديث إعدادات Nginx", "Urgent", "To Do", today + timedelta(days=1)),
                ("جرد العهد التقنية للربع السنوي لفرع جدة", "مطابقة الأرقام التسلسلية وفحص حالة الأجهزة المسلمة", "Low", "Completed", today - timedelta(days=5)),
            ]

            for t_title, t_desc, prio, t_stat, d_date in tasks_data:
                task = Task(
                    company_id=company.id,
                    branch_id=branches[0].id,
                    title=t_title,
                    description=t_desc,
                    assigned_to_id=employees[3].id,
                    assigned_by_id=users[0].id,
                    priority=prio,
                    status=t_stat,
                    start_date=today - timedelta(days=2),
                    due_date=d_date,
                    completed_at=datetime.utcnow() if t_stat == "Completed" else None,
                    notes="مهمة تشغيلية في قسم تقنية المعلومات",
                )
                db.add(task)
                db.commit()
                db.refresh(task)

                # Add a task comment
                db.add(TaskComment(
                    task_id=task.id,
                    user_id=users[3].id,
                    content="بدأت بالعمل على المتطلبات وسيتم الانتهاء حسب الموعد المحدد بإذن الله.",
                ))
            db.commit()

            # ── IT Help Desk Tickets ─────────────────────────────────────────
            tickets_data = [
                ("بطء شديد في الاتصال بشبكة الإنترنت والبريد", "منذ الصباح نواجه انقطاعات متكررة عند الدخول على منصة الأعمال والبريد الإلكتروني", "Hardware", "High", "In Progress"),
                ("طلب صلاحية دخول على المجلد المشترك للمالية", "أحتاج صلاحية قراءة وكتابة على مجلد الفواتير والعقود الخاص بالربع الرابع", "Access / Account", "Medium", "Assigned"),
                ("شاشة الحاسب المكتبي تومض ولا تعمل بشكل صحيح", "الشاشة تغلق فجأة وتظهر خطوط بيضاء متقطعة عند تحريك الكيبل", "Hardware", "Urgent / Critical", "Open"),
                ("مشكلة في عدم استجابة الطابعة المركزية", "الطابعة تظهر حالة أوفلاين رغم اتصالها بالشبكة وإعادة تشغيلها", "Hardware", "Low", "Resolved"),
            ]

            for t_idx, (t_title, t_desc, cat, prio, t_stat) in enumerate(tickets_data):
                t_num = f"TCK-{today.year}-{(c_idx*10 + t_idx + 1):04d}"
                ticket = HelpDeskTicket(
                    company_id=company.id,
                    branch_id=branches[0].id,
                    ticket_number=t_num,
                    issue_title=t_title,
                    issue_description=t_desc,
                    requester_id=employees[4 + t_idx].id,
                    assigned_technician_id=users[3].id if t_stat != "Open" else None,
                    priority=prio,
                    status=t_stat,
                    category=cat,
                    related_asset_id=tech_assets[t_idx].id if t_idx < len(tech_assets) else None,
                    resolved_at=datetime.utcnow() if t_stat in ["Resolved", "Closed"] else None,
                    notes="تذكرة دعم فني عبر البوابة الذاتية",
                )
                db.add(ticket)
                db.commit()
                db.refresh(ticket)

                # Comments
                db.add(TicketComment(
                    ticket_id=ticket.id,
                    user_id=users[3].id,
                    content="تم استلام التذكرة من قِبل الدعم الفني وجاري فحص المشكلة حالياً.",
                    is_internal=False,
                ))
                # Internal note
                db.add(TicketComment(
                    ticket_id=ticket.id,
                    user_id=users[3].id,
                    content="ملاحظة فنية داخلية: تم فحص السويتش المتصل به الجهاز وهناك فقدان في الحزم (packet loss). سنقوم باستبدال كيبل الشبكة.",
                    is_internal=True,
                ))
            db.commit()

            # Notifications
            db.add(Notification(
                recipient_user_id=users[0].id,
                company_id=company.id,
                event_type="system_welcome",
                title="مرحباً بك في نظام عمليات تقنية المعلومات",
                message=f"تم إعداد وتهيئة بيئة الشركة ({c_info['ar']}) بنجاح مع كافة الأصول والبنية التحتية.",
                channel="in_app",
                delivery_status="sent",
            ))

            # Audit log
            db.add(AuditLog(
                user_id=superadmin.id,
                company_id=company.id,
                action="INITIALIZE_COMPANY",
                resource_type="Company",
                resource_id=str(company.id),
                new_values={"company_name": company.company_name_ar, "code": company.company_code},
            ))
            db.commit()

        ensure_canonical_internal_companies(db)
        db.commit()
        print("Seed completed successfully! Canonical companies and 5 branches initialized.")
        print("Default Super Admin Login: username='admin' | password='Admin@12345'")

    except Exception as e:
        db.rollback()
        print(f"Error during seeding: {str(e)}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    include_demo_flag = os.environ.get("SEED_DEMO_DATA", "").strip().lower() in ("1", "true", "yes") or ("--demo" in sys.argv)
    seed(include_demo=include_demo_flag)
    if include_demo_flag:
        try:
            from seed_digital_assets import seed_digital_assets
            seed_digital_assets()
        except Exception as e:
            print(f"Digital assets seed notice: {e}")
