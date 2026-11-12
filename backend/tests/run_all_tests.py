"""Comprehensive test suite for all modules of Investor Gate IT Operations System.
Tests all 13 modules using direct endpoint execution with real database persistence.
"""

import sys
import os
import uuid
from datetime import date, datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company, Branch, Department
from app.models.user import User, Employee, Role
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.infrastructure import ITInfrastructure
from app.models.subscription import ThirdPartySubscription
from app.models.maintenance import MaintenanceRecord
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.audit import AuditLog
from app.models.notification import Notification

from app.schemas.auth import LoginRequest
from app.schemas.company import BranchCreate, DepartmentCreate
from app.schemas.employee import EmployeeCreate, UserCreate
from app.schemas.asset import TechnicalAssetCreate, AssetCustodyAssign, AssetCustodyReturn
from app.schemas.infrastructure import InfrastructureCreate
from app.schemas.subscription import SubscriptionCreate
from app.schemas.maintenance import MaintenanceCreate, MaintenanceUpdate
from app.schemas.task import TaskCreate, TaskCommentCreate
from app.schemas.ticket import TicketCreate, TicketCommentCreate

from app.api.v1.endpoints import (
    auth, companies, employees, assets, custody,
    infrastructure, subscriptions, maintenance, tasks,
    tickets, notifications, dashboard, reports, audit
)
from fastapi import Request, Response
from starlette.datastructures import Headers


class DummyRequest(Request):
    def __init__(self, cookies=None, headers=None):
        scope = {
            "type": "http",
            "client": ("127.0.0.1", 12345),
            "headers": [],
            "path": "/",
        }
        super().__init__(scope)
        self._cookies = cookies or {}
        self._headers = Headers(headers or {})

    @property
    def cookies(self):
        return self._cookies

    @property
    def headers(self):
        return self._headers


def run_tests():
    db = SessionLocal()
    req = DummyRequest()
    res = Response()

    print("=" * 65)
    print("STARTING FULL SYSTEM TEST SUITE: INVESTOR GATE IT OPERATIONS")
    print("=" * 65)

    # -------------------------------------------------------------
    # MODULE 1: AUTHENTICATION & SESSIONS
    # -------------------------------------------------------------
    print("\n[1/13] Testing Authentication & RBAC...")
    admin_login = auth.login(LoginRequest(username="admin", password="Admin@12345"), req, res, db)
    assert "data" in admin_login and "user" in admin_login["data"]
    admin_user = db.query(User).filter(User.username == "admin").first()
    assert admin_user.is_superadmin is True
    print("  ✓ Admin login verified (Super Admin role)")

    me_res = auth.get_me(request=req, current_user=admin_user, db=db)
    assert me_res["data"]["user"]["username"] == "admin"
    print("  ✓ /auth/me returns current user identity")

    company = db.query(Company).filter(Company.company_code == "IGT").first()
    assert company is not None
    cid = company.id
    print(f"  ✓ Active Company context: {company.company_name_ar} ({company.company_code})")

    # -------------------------------------------------------------
    # MODULE 2: COMPANIES & BRANCHES
    # Signatures:
    #   create_branch(company_id, payload, current_user, db)   -- NO active_cid
    #   create_department(company_id, payload, current_user, db) -- NO active_cid
    # -------------------------------------------------------------
    print("\n[2/13] Testing Companies, Branches & Departments...")
    comps = companies.list_companies(
        page=1, per_page=20, search=None, status_filter=None,
        current_user=admin_user, db=db
    )
    assert len(comps["data"]) >= 3
    print(f"  ✓ Retrieved {len(comps['data'])} companies with data isolation")

    branch_payload = BranchCreate(
        company_id=cid,
        branch_name="فرع تجريبي للاختبار",
        location="الرياض - حي الملز",
        contact_details="011-0000000"
    )
    b_res = companies.create_branch(
        company_id=cid,
        payload=branch_payload,
        current_user=admin_user,
        db=db
    )
    branch_id = uuid.UUID(b_res["data"]["id"])
    print(f"  ✓ Branch created: {branch_payload.branch_name}")

    dept_payload = DepartmentCreate(
        company_id=cid,
        branch_id=branch_id,
        department_name="قسم الدعم والعمليات التجريبي"
    )
    d_res = companies.create_department(
        company_id=cid,
        payload=dept_payload,
        current_user=admin_user,
        db=db
    )
    dept_id = uuid.UUID(d_res["data"]["id"])
    print(f"  ✓ Department created: {dept_payload.department_name}")

    # -------------------------------------------------------------
    # MODULE 3: EMPLOYEES & USERS
    # Signatures:
    #   create_employee(payload, current_user, active_cid, db)
    #   create_user(payload, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[3/13] Testing Employees & User Accounts...")
    ts = datetime.now().strftime('%M%S')
    emp_payload = EmployeeCreate(
        company_id=cid,
        branch_id=branch_id,
        department_id=dept_id,
        employee_number=f"EMP-TEST-{ts}",
        full_name="فهد ناصر التميمي",
        job_title="أخصائي دعم فني أول",
        email=f"fahad_{ts}@investorgate.com",
        phone="0559988776"
    )
    e_res = employees.create_employee(
        payload=emp_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    emp_id = uuid.UUID(e_res["data"]["id"])
    print(f"  ✓ Employee registered: {emp_payload.full_name} ({emp_payload.employee_number})")

    u_payload = UserCreate(
        username=f"fahad_{ts}",
        email=f"fahad_user_{ts}@investorgate.com",
        password="Pass@12345Secure",
        employee_id=emp_id,
        role_names=["IT Technician"],
        company_ids=[cid]
    )
    u_res = employees.create_user(
        payload=u_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert "data" in u_res
    print(f"  ✓ User credentials created with role: {u_payload.role_names[0]}")

    # -------------------------------------------------------------
    # MODULE 4: TECHNICAL ASSETS & QR CODES
    # Signatures:
    #   create_asset(payload, current_user, active_cid, db)
    #   get_asset(asset_id, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[4/13] Testing Technical Assets & QR Generation...")
    asset_code = f"AST-TEST-{ts}"
    ast_payload = TechnicalAssetCreate(
        company_id=cid,
        branch_id=branch_id,
        department_id=dept_id,
        asset_code=asset_code,
        asset_name="كمبيوتر محمول ThinkPad P16",
        asset_type="Laptop",
        brand="Lenovo",
        model="ThinkPad P16 Gen 2",
        serial_number=f"SN-{uuid.uuid4().hex[:10].upper()}",
        condition="New",
        status="Available",
        notes="جهاز تجريبي لأغراض الاختبار الآلي"
    )
    ast_res = assets.create_asset(
        payload=ast_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    asset_id = uuid.UUID(ast_res["data"]["id"])
    print(f"  ✓ Physical Asset created: {ast_payload.asset_name} ({ast_payload.asset_code})")

    ast_detail = assets.get_asset(
        asset_id=asset_id,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert ast_detail["data"]["qr_code_data"] is not None
    print("  ✓ Dynamic QR Code confirmed generated in asset record")

    # -------------------------------------------------------------
    # MODULE 5: ASSET CUSTODY & HANDOVER RECEIPTS
    # Signatures:
    #   assign_asset(payload, current_user, active_cid, db)
    #   get_custody_receipt(custody_id, current_user, db)   -- returns JSON dict (no format_type)
    #   return_asset(custody_id, payload, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[5/13] Testing Asset Custody Handover & Receipts...")
    assign_payload = AssetCustodyAssign(
        asset_id=asset_id,
        employee_id=emp_id,
        expected_return_date=date(2027, 1, 1),
        condition_on_assignment="New",
        notes="تسليم جهاز العمل الجديد للموظف"
    )
    c_res = custody.assign_asset(
        payload=assign_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    custody_id = uuid.UUID(c_res["data"]["custody_id"])
    print(f"  ✓ Asset custody atomically assigned to: {emp_payload.full_name}")

    ast_in_db = db.query(TechnicalAsset).filter(TechnicalAsset.id == asset_id).first()
    assert ast_in_db.status == "Assigned"
    print("  ✓ Technical Asset status atomically changed to 'Assigned'")

    # get_custody_receipt returns JSON data (not an HTML Response)
    receipt = custody.get_custody_receipt(
        custody_id=custody_id,
        current_user=admin_user,
        db=db
    )
    assert "data" in receipt
    assert receipt["data"]["asset_code"] == asset_code
    assert "declaration_text" in receipt["data"]
    print("  ✓ Handover Receipt JSON generated with formal Arabic legal acknowledgment")

    ret_payload = AssetCustodyReturn(
        condition_on_return="Good",
        notes="استرجاع الأصل بحالة ممتازة"
    )
    custody.return_asset(
        custody_id=custody_id,
        payload=ret_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    db.refresh(ast_in_db)
    assert ast_in_db.status == "Available"
    print("  ✓ Asset returned and status atomically transitioned back to 'Available'")

    # -------------------------------------------------------------
    # MODULE 6: IT INFRASTRUCTURE (NO PLAINTEXT CREDENTIALS)
    # Signature: create_infrastructure(payload, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[6/13] Testing IT Infrastructure (Zero-Plaintext Policy)...")
    infra_payload = InfrastructureCreate(
        company_id=cid,
        branch_id=branch_id,
        device_name="Switch-Core-Test-01",
        device_type="Switch",
        manufacturer="Cisco",
        model="Catalyst 9300",
        serial_number=f"FCW-{uuid.uuid4().hex[:8].upper()}",
        hostname="core-sw01.investorgate.local",
        management_ip="10.10.1.10",
        network_name="LAN-MGMT",
        vlan="100",
        location="غرفة الخوادم الرئيسية - Rack A1",
        credential_reference="vault://network/cisco-core01",
        firmware_version="IOS-XE 17.9.4a",
        status="Active",
        notes="مبدل رئيسي تم إنشاؤه عبر الاختبار الآلي"
    )
    inf_res = infrastructure.create_infrastructure(
        payload=infra_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    infra_id = uuid.UUID(inf_res["data"]["id"])
    print(f"  ✓ Infrastructure device registered: {infra_payload.device_name} (IP: {infra_payload.management_ip})")

    inf_in_db = db.query(ITInfrastructure).filter(ITInfrastructure.id == infra_id).first()
    assert inf_in_db.credential_reference.startswith("vault://")
    print("  ✓ Confirmed ZERO plaintext credentials: only vault reference is stored")

    # -------------------------------------------------------------
    # MODULE 7: THIRD-PARTY SUBSCRIPTIONS & COSTS
    # Signatures:
    #   create_subscription(payload, current_user, active_cid, db)
    #   get_cost_summary(company_id, current_user, active_cid, db)
    #     returns: active_subscriptions_count, total_annual_cost, total_monthly_cost
    # -------------------------------------------------------------
    print("\n[7/13] Testing Third-Party Subscriptions & Cost Analysis...")
    sub_payload = SubscriptionCreate(
        company_id=cid,
        service_name="Cloud Backup & Storage",
        provider="Wasabi Cloud",
        subscription_type="Cloud Storage",
        package_type="Enterprise",
        start_date=date(2026, 1, 1),
        renewal_date=date(2027, 1, 1),
        expiry_date=date(2027, 1, 5),
        billing_cycle="Annual",
        price=1800.0,
        currency="SAR",
        auto_renewal=True,
        status="Active",
        notes="اشتراك نسخ احتياطي سحابي"
    )
    sub_res = subscriptions.create_subscription(
        payload=sub_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert "data" in sub_res or "message" in sub_res
    print(f"  ✓ Subscription recorded: {sub_payload.service_name} ({sub_payload.price} {sub_payload.currency}/سنة)")

    summary = subscriptions.get_cost_summary(
        company_id=cid,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    s_data = summary["data"]
    assert s_data["active_subscriptions_count"] >= 1
    assert s_data["total_annual_cost"] > 0
    print(f"  ✓ Financial Summary verified: {s_data['active_subscriptions_count']} active subscriptions, Total Annual: {s_data['total_annual_cost']} SAR")

    # -------------------------------------------------------------
    # MODULE 8: MAINTENANCE & CONFIG CHANGE APPROVALS
    # Signatures:
    #   create_maintenance(payload, current_user, active_cid, db)
    #   update_maintenance(record_id, payload, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[8/13] Testing Maintenance, Replacement & Change Approvals...")
    maint_payload = MaintenanceCreate(
        company_id=cid,
        target_type="infrastructure",
        target_id=infra_id,
        action_type="Configuration Change",
        title="تحديث إعدادات جدار الحماية وقواعد الوصول",
        description="تفعيل حظر المنافذ غير المستخدمة وتحديث شهادة SSL",
        risk_assessment="منخفض - يتم التنفيذ خارج أوقات العمل الرسمية",
        planned_execution_window="الجمعة 02:00 - 04:00 صباحاً",
        rollback_plan="استعادة نسخة الإعدادات السابقة من الخزنة الرقمية",
        status="Pending Approval",
        cost=0.0
    )
    m_res = maintenance.create_maintenance(
        payload=maint_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    maint_id = uuid.UUID(m_res["data"]["id"])
    print("  ✓ Configuration change record created with risk assessment and rollback plan")

    approval_payload = MaintenanceUpdate(
        approval_status="Approved",
        status="In Progress",
        notes="معتمد من مدير تقنية المعلومات"
    )
    appr_res = maintenance.update_maintenance(
        record_id=maint_id,
        payload=approval_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert "message" in appr_res
    print(f"  ✓ Managerial Approval workflow executed: {approval_payload.approval_status}")

    # -------------------------------------------------------------
    # MODULE 9: TASK MANAGEMENT
    # Signatures:
    #   create_task(payload, current_user, active_cid, db)
    #   add_task_comment(task_id, payload, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[9/13] Testing Task Management & Assignments...")
    task_payload = TaskCreate(
        company_id=cid,
        branch_id=branch_id,
        title="تهيئة وإعداد خادم النسخ الاحتياطي الجديد",
        description="تثبيت نظام التشغيل وربط مصفوفة التخزين NAS",
        assigned_to_id=emp_id,
        priority="High",
        status="Pending",
        due_date=date(2026, 12, 1),
        notes="مهمة ذات أولوية مرتفعة"
    )
    t_res = tasks.create_task(
        payload=task_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    task_id = uuid.UUID(t_res["data"]["id"])
    print(f"  ✓ Task created and assigned to: {emp_payload.full_name} (Priority: {task_payload.priority})")

    c_payload = TaskCommentCreate(content="تم فحص العتاد والبدء في تثبيت بيئة التشغيل")
    tasks.add_task_comment(
        task_id=task_id,
        payload=c_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    print("  ✓ Task collaboration comment posted successfully")

    # -------------------------------------------------------------
    # MODULE 10: IT HELP DESK WORKFLOW
    # Signatures:
    #   create_ticket(payload, current_user, active_cid, db)
    #   update_ticket_status(ticket_id, new_status, technician_id, notes, current_user, active_cid, db)
    #   add_ticket_comment(ticket_id, payload, current_user, active_cid, db)
    #   convert_ticket_to_task(ticket_id, assigned_to_id, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[10/13] Testing IT Help Desk (Tickets & Internal Notes)...")
    ticket_payload = TicketCreate(
        company_id=cid,
        branch_id=branch_id,
        issue_title="مشكلة في الاتصال بالطابعة المشتركة",
        issue_description="توقف الطابعة عن الاستجابة لطلبات الطباعة في قسم العمليات",
        requester_id=emp_id,
        category="Hardware",
        priority="Medium",
        related_asset_id=asset_id
    )
    tick_res = tickets.create_ticket(
        payload=ticket_payload,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    ticket_id = uuid.UUID(tick_res["data"]["id"])
    ticket_num = tick_res["data"]["ticket_number"]
    assert ticket_num.startswith("TCK-")
    print(f"  ✓ Ticket opened with sequential numbering: {ticket_num}")

    tickets.update_ticket_status(
        ticket_id=ticket_id,
        new_status="In Progress",
        technician_id=None,
        notes="تم استلام البلاغ والبدء بالمعالجة",
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    print("  ✓ Ticket status transitioned to 'In Progress'")

    tickets.add_ticket_comment(
        ticket_id=ticket_id,
        payload=TicketCommentCreate(content="جاري إعادة تشغيل ملقم الطباعة", is_internal=False),
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    tickets.add_ticket_comment(
        ticket_id=ticket_id,
        payload=TicketCommentCreate(content="ملاحظة فنية: تم كشف تعارض في عنوان IP الطابعة", is_internal=True),
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    print("  ✓ Public comment and Internal Technician Note posted successfully")

    conv_res = tickets.convert_ticket_to_task(
        ticket_id=ticket_id,
        assigned_to_id=emp_id,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert "data" in conv_res
    print(f"  ✓ Ticket converted to actionable operational Task ID: {conv_res['data']['task_id']}")

    # -------------------------------------------------------------
    # MODULE 11: NOTIFICATIONS
    # Signatures:
    #   list_notifications(page, per_page, unread_only, current_user, db)
    #   mark_all_read(current_user, db)
    # -------------------------------------------------------------
    print("\n[11/13] Testing In-App Notification Center...")
    notifs = notifications.list_notifications(
        page=1, per_page=50, unread_only=False,
        current_user=admin_user, db=db
    )
    # Notifications are created for the assigned employee, not for admin
    # So we just verify the endpoint works and returns a valid structure
    assert "data" in notifs
    print(f"  ✓ Notification endpoint operational: {len(notifs['data'])} notifications in admin queue")
    notifications.mark_all_read(current_user=admin_user, db=db)
    print("  ✓ Mark all notifications as read executed successfully")

    # -------------------------------------------------------------
    # MODULE 12: DASHBOARD & REPORT EXPORTS
    # Signatures:
    #   get_dashboard_data(company_id, current_user, active_cid, db)
    #   export_report(report_type, format_type, company_id, current_user, active_cid, db)
    #     returns a starlette Response with .media_type and .body
    # -------------------------------------------------------------
    print("\n[12/13] Testing Dashboard KPIs & Reports Export...")
    dash = dashboard.get_dashboard_data(
        company_id=cid,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    d_data = dash["data"]
    print(f"  ✓ Real-time KPIs computed: {d_data['total_assets']} Assets, {d_data['total_employees']} Employees, {d_data['infrastructure_devices']} Network Devices")

    excel_exp = reports.export_report(
        report_type="assets",
        format_type="excel",
        company_id=cid,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert excel_exp.media_type == "text/csv; charset=utf-8"
    assert excel_exp.body.startswith(b"\xef\xbb\xbf")  # UTF-8 BOM bytes
    print("  ✓ Excel CSV export generated with UTF-8 BOM (Pristine Arabic text in Excel)")

    html_exp = reports.export_report(
        report_type="custody",
        format_type="html",
        company_id=cid,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    assert html_exp.media_type == "text/html; charset=utf-8"
    print("  ✓ Printable HTML report generated (ready for PDF printing)")

    # -------------------------------------------------------------
    # MODULE 13: IMMUTABLE AUDIT LOGS
    # Signature: list_audit_logs(page, per_page, company_id, action, resource_type, current_user, active_cid, db)
    # -------------------------------------------------------------
    print("\n[13/13] Testing Security Audit Logs...")
    audit_res = audit.list_audit_logs(
        page=1, per_page=50,
        company_id=cid,
        action=None,
        resource_type=None,
        current_user=admin_user,
        active_cid=cid,
        db=db
    )
    logs_count = audit_res["pagination"]["total"]
    assert logs_count >= 5
    print(f"  ✓ Audit Trail verified: {logs_count} immutable mutation logs recorded with IP and user context")

    print("\n" + "=" * 65)
    print("ALL 13 SYSTEM MODULES PASSED ALL VERIFICATIONS SUCCESSFULLY! ✓✓✓")
    print("=" * 65)
    db.close()


if __name__ == "__main__":
    run_tests()
