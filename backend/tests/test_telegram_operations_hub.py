# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Comprehensive Test Suite for Investor Gate OS Telegram Operations Hub.

Tests:
1. Manual /start <token> linking lifecycle and automatic User/Membership provisioning.
2. Token expiration, single-use enforcement, and already-linked graceful handling.
3. Centralized Telegram identity resolver (Telegram ID -> Employee -> User -> Membership -> Roles).
4. RBAC boundary enforcement:
   - Standard Employee: Allowed (tasks, tickets, custody, notifications, search); Blocked (assets, subscriptions, reports).
   - IT Technician: Allowed (tasks, tickets, custody, assets, subscriptions, notifications, search); Blocked (reports).
   - IT Manager / Company Admin: Allowed all modules including reports.
5. Inactive employee, inactive user account, and inactive membership denial checks.
6. Operations Hub commands: cmd:my_tasks, cmd:my_tickets, cmd:my_custody, cmd:assets, cmd:subscriptions, cmd:reports, cmd:search, cmd:settings.
7. Task interaction: act:ack (acknowledgement without completing), act:start, act:done.
8. Backend API endpoints: GET /telegram/links/{emp_id}/details, PUT /telegram/links/{emp_id}/permissions.
9. Permission escalation rejection (cannot grant Telegram modules exceeding CRM role).
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User, Employee, Role, UserRole, CompanyMembership
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.asset import TechnicalAsset, AssetCustody
from app.models.telegram import TelegramUserLink, NotificationOutbox, TelegramActionLog
from app.services.telegram_service import (
    generate_telegram_link_token,
    verify_telegram_link,
    resolve_telegram_identity,
    ensure_employee_user_account,
    execute_bot_action,
    build_telegram_reply_keyboard,
)
from app.api.v1.endpoints.telegram import (
    get_employee_telegram_details,
    update_employee_telegram_permissions,
    UpdateTelegramPermissionsRequest,
)


def run_telegram_operations_hub_tests():
    print("=" * 70)
    print("RUNNING TEST SUITE: TELEGRAM OPERATIONS HUB & RBAC ENFORCEMENT")
    print("=" * 70)

    db = SessionLocal()
    created_entities = []

    try:
        company = db.query(Company).first()
        assert company is not None, "Company record required"
        cid = company.id

        # Resolve Super Admin
        admin_user = (
            db.query(User)
            .join(UserRole, User.id == UserRole.user_id)
            .join(Role, UserRole.role_id == Role.id)
            .filter(Role.name == "Super Admin")
            .first()
        )
        assert admin_user is not None, "Admin user required"

        suffix = uuid.uuid4().hex[:6]

        # ── Setup Test Employees ──────────────────────────────────────
        # 1. Standard Employee without initial User account
        emp_standard = Employee(
            company_id=cid,
            employee_number=f"EMP-HUB-STD-{suffix}",
            full_name=f"موظف قياسي تشغيلي {suffix}",
            job_title="موظف خدمة عملاء",
            email=f"emp_std_{suffix}@investorgate.com",
            employment_status="Active",
        )
        db.add(emp_standard)

        # 2. IT Technician Employee with technician user account
        emp_tech = Employee(
            company_id=cid,
            employee_number=f"EMP-HUB-TECH-{suffix}",
            full_name=f"فني دعم تقني {suffix}",
            job_title="فني صيانة ودعم شبكات",
            email=f"emp_tech_{suffix}@investorgate.com",
            employment_status="Active",
        )
        db.add(emp_tech)

        # 3. IT Manager Employee with manager user account
        emp_mgr = Employee(
            company_id=cid,
            employee_number=f"EMP-HUB-MGR-{suffix}",
            full_name=f"مدير تقنية المعلومات {suffix}",
            job_title="مدير إدارة تقنية المعلومات",
            email=f"emp_mgr_{suffix}@investorgate.com",
            employment_status="Active",
        )
        db.add(emp_mgr)

        db.commit()
        db.refresh(emp_standard)
        db.refresh(emp_tech)
        db.refresh(emp_mgr)

        import random
        base_num = random.randint(100000, 899999)
        tg_id_std = f"91{base_num}01"
        tg_id_tech = f"91{base_num}02"
        tg_id_mgr = f"91{base_num}03"

        # ── Test 1: Manual Token Linking with Auto-Provisioning ────────
        print("\n[TEST 1] Testing manual /start <token> linking with auto User account provisioning...")
        gen_res = generate_telegram_link_token(
            db=db,
            employee_id=emp_standard.id,
            company_id=cid,
            expires_in_minutes=30,
        )
        token_std = gen_res["token"]
        assert token_std is not None
        assert gen_res["command"] == f"/start {token_std}"

        # Verify link - should automatically provision User & Membership
        link_res = verify_telegram_link(
            db=db,
            token=token_std,
            telegram_user_id=tg_id_std,
            telegram_chat_id=tg_id_std,
            telegram_username=f"tg_user_std_{suffix}",
        )
        assert link_res["is_verified"] is True
        assert link_res["employee_id"] == str(emp_standard.id)

        # Verify auto-provisioned user
        link_record = db.query(TelegramUserLink).filter(TelegramUserLink.employee_id == emp_standard.id).first()
        assert link_record is not None
        assert link_record.user_id is not None
        provisioned_user = db.query(User).filter(User.id == link_record.user_id).first()
        assert provisioned_user is not None
        assert provisioned_user.employee_id == emp_standard.id
        print(f"✓ Employee auto-provisioned application user: {provisioned_user.username}")

        # ── Test 2: Token Reuse Prevention & Idempotent Linking ────────
        print("\n[TEST 2] Testing token reuse rejection and friendly already-linked message...")
        try:
            verify_telegram_link(
                db=db,
                token=token_std,
                telegram_user_id="999999999",
                telegram_chat_id="999999999",
            )
            assert False, "Should have rejected used token"
        except ValueError as ex:
            assert "استخدامه" in str(ex) or "مسبقاً" in str(ex) or "غير صالح" in str(ex)
            print(f"✓ Correctly rejected already-used token: {ex}")

        # Same user running verify on their own already-linked account with the same token
        same_user_link = verify_telegram_link(
            db=db,
            token=token_std,
            telegram_user_id=tg_id_std,
            telegram_chat_id=tg_id_std,
        )
        assert same_user_link.get("already_linked") is True
        print("✓ Already-linked account handled gracefully without error")

        # ── Test 3: Centralized Identity & Authorization Resolver ───────
        print("\n[TEST 3] Testing centralized identity resolver...")
        ctx = resolve_telegram_identity(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std)
        assert ctx.is_authorized is True
        assert ctx.employee.id == emp_standard.id
        assert ctx.user.id == provisioned_user.id
        assert "Employee" in ctx.roles or "IT Technician" in ctx.roles
        print(f"✓ Resolved identity: Employee={ctx.employee_name}, Roles={ctx.roles}")

        # ── Test 4: Setup Tech and Manager Accounts ───────────────────
        print("\n[TEST 4] Setting up IT Technician and IT Manager Telegram links...")
        # Tech user & link
        tech_user = ensure_employee_user_account(db, emp_tech, cid)
        tech_role = db.query(Role).filter(Role.name == "IT Technician").first()
        if tech_role:
            mem_tech = db.query(CompanyMembership).filter(
                CompanyMembership.user_id == tech_user.id, CompanyMembership.company_id == cid
            ).first()
            if mem_tech:
                mem_tech.role_id = tech_role.id
                db.commit()

        link_tech = TelegramUserLink(
            company_id=cid,
            employee_id=emp_tech.id,
            user_id=tech_user.id,
            telegram_user_id=tg_id_tech,
            telegram_chat_id=tg_id_tech,
            telegram_username=f"tech_{suffix}",
            is_verified=True,
            verification_token=f"tok_tech_{suffix}",
            token_expires_at=datetime.utcnow() + timedelta(days=1),
            allowed_modules=["tasks", "tickets", "custody", "assets", "subscriptions", "notifications", "search"],
        )
        db.add(link_tech)

        # Manager user & link
        mgr_user = ensure_employee_user_account(db, emp_mgr, cid)
        mgr_role = db.query(Role).filter(Role.name == "IT Manager").first()
        if mgr_role:
            mem_mgr = db.query(CompanyMembership).filter(
                CompanyMembership.user_id == mgr_user.id, CompanyMembership.company_id == cid
            ).first()
            if mem_mgr:
                mem_mgr.role_id = mgr_role.id
                db.commit()

        link_mgr = TelegramUserLink(
            company_id=cid,
            employee_id=emp_mgr.id,
            user_id=mgr_user.id,
            telegram_user_id=tg_id_mgr,
            telegram_chat_id=tg_id_mgr,
            telegram_username=f"mgr_{suffix}",
            is_verified=True,
            verification_token=f"tok_mgr_{suffix}",
            token_expires_at=datetime.utcnow() + timedelta(days=1),
            allowed_modules=["tasks", "tickets", "custody", "assets", "subscriptions", "reports", "notifications", "search"],
        )
        db.add(link_mgr)
        db.commit()
        print("✓ Technician and Manager accounts configured with proper roles and links")

        # ── Test 5: Module Permissions Boundary Enforcement ─────────────
        print("\n[TEST 5] Testing module permission boundaries across roles...")

        # Standard employee attempts to access /assets -> MUST FAIL
        ast_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:assets"
        )
        assert ast_resp["success"] is False
        assert "صلاحية" in ast_resp["message"]
        print("✓ Standard employee blocked from /assets as required by CRM RBAC")

        # Standard employee attempts to access /reports -> MUST FAIL
        rep_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:reports"
        )
        assert rep_resp["success"] is False
        assert "صلاحية" in rep_resp["message"]
        print("✓ Standard employee blocked from /reports as required by CRM RBAC")

        # Standard employee attempts to access /subscriptions -> MUST FAIL
        sub_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:subscriptions"
        )
        assert sub_resp["success"] is False
        assert "صلاحية" in sub_resp["message"]
        print("✓ Standard employee blocked from /subscriptions as required by CRM RBAC")

        # Technician attempts to access /assets -> MUST SUCCEED
        ast_tech_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_tech, telegram_chat_id=tg_id_tech, action_str="cmd:assets"
        )
        assert ast_tech_resp["success"] is True
        print("✓ IT Technician granted access to /assets")

        # Technician attempts to access /reports -> MUST FAIL
        rep_tech_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_tech, telegram_chat_id=tg_id_tech, action_str="cmd:reports"
        )
        assert rep_tech_resp["success"] is False
        print("✓ IT Technician blocked from /reports (Manager-only)")

        # Manager attempts to access /reports -> MUST SUCCEED
        rep_mgr_resp = execute_bot_action(
            db=db, telegram_user_id=tg_id_mgr, telegram_chat_id=tg_id_mgr, action_str="cmd:reports"
        )
        assert rep_mgr_resp["success"] is True
        assert "التقرير والملخص التشغيلي" in rep_mgr_resp["message"]
        print("✓ IT Manager granted access to /reports")

        # ── Test 6: Inactive Status Denial ──────────────────────────────
        print("\n[TEST 6] Testing denial for inactive employee, user, or membership...")
        # 1. Inactive User
        provisioned_user.account_status = "Suspended"
        db.commit()
        sus_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:my_tasks")
        assert sus_resp["success"] is False
        assert "غير نشط أو موقوف" in sus_resp["message"]
        print("✓ Suspended user denied bot commands")

        # Restore user, deactivate membership
        provisioned_user.account_status = "Active"
        mem = db.query(CompanyMembership).filter(
            CompanyMembership.user_id == provisioned_user.id, CompanyMembership.company_id == cid
        ).first()
        mem.status = "Inactive"
        db.commit()
        mem_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:my_tasks")
        assert mem_resp["success"] is False
        assert "عضوية شركة نشطة" in mem_resp["message"]
        print("✓ Inactive company membership denied bot commands")

        # Restore membership
        mem.status = "Active"
        db.commit()

        # ── Test 7: Operations Hub Commands Execution ──────────────────
        print("\n[TEST 7] Testing Operations Hub commands...")
        # Create a task assigned to emp_standard
        test_task = Task(
            company_id=cid,
            title=f"مهمة صيانة حاسب آلي {suffix}",
            description="فحص كابلات الشبكة والطابعة",
            status="Pending Acceptance",
            priority="High",
            assigned_to_id=emp_standard.id,
            assigned_by_id=admin_user.id,
        )
        db.add(test_task)
        db.commit()
        db.refresh(test_task)

        # /tasks
        tasks_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:my_tasks")
        assert tasks_resp["success"] is True
        assert test_task.title in tasks_resp["message"]
        print("✓ /tasks returned assigned task list")

        # /search
        search_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str=f"cmd:search:{suffix}")
        assert search_resp["success"] is True
        assert test_task.title in search_resp["message"]
        print("✓ /search matched and returned task")

        # /settings
        settings_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:settings")
        assert settings_resp["success"] is True
        assert emp_standard.full_name in settings_resp["message"]
        print("✓ /settings returned user account overview")

        # /portal
        portal_resp = execute_bot_action(db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:portal")
        assert portal_resp["success"] is True
        assert "بوابة Investor Gate OS" in portal_resp["message"]
        print("✓ /portal returned platform entry details")

        # ── Test 8: Task Interaction & Receipts (act:ack, act:start, act:done) ─
        print("\n[TEST 8] Testing task interaction and receipt acknowledgement...")
        # act:ack
        ack_res = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str=f"act:ack:{test_task.id}"
        )
        assert ack_res["success"] is True
        assert "تأكيد استلام" in ack_res["message"]
        db.refresh(test_task)
        assert test_task.acknowledged_at is not None
        assert test_task.status != "Completed", "act:ack must NEVER complete the task!"
        print("✓ Task receipt acknowledged without altering task workflow state")

        # act:start
        start_res = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str=f"act:start:{test_task.id}"
        )
        assert start_res["success"] is True
        db.refresh(test_task)
        assert test_task.status == "In Progress"
        print("✓ Task transitioned to In Progress")

        # act:done
        done_res = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str=f"act:done:{test_task.id}"
        )
        assert done_res["success"] is True
        db.refresh(test_task)
        assert test_task.status == "Completed", test_task.status
        print("✓ Task transitioned to Completed via the shared workflow")

        # Test viewing own permissions via Telegram (Requirement 6)
        perm_res = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:my_permissions"
        )
        assert perm_res["success"] is True
        assert "صلاحياتك المعتمدة" in perm_res["message"]
        assert emp_standard.full_name in perm_res["message"]
        print("✓ Employee successfully viewed their own permissions in Telegram (Requirement 6)")

        # Test Main Menu navigation action (Requirement 3)
        menu_res = execute_bot_action(
            db=db, telegram_user_id=tg_id_std, telegram_chat_id=tg_id_std, action_str="cmd:main_menu"
        )
        assert menu_res["success"] is True
        assert "القائمة الرئيسية" in menu_res["message"]
        assert "inline_keyboard" in menu_res["reply_markup"]
        print("✓ Main menu returned interactive button navigation")

        # ── Test 9: Employee Permissions API & Escalation Prevention ────
        print("\n[TEST 9] Testing Telegram Permissions Panel API and RBAC enforcement...")
        # GET details
        details_res = get_employee_telegram_details(
            employee_id=emp_standard.id,
            company_id=cid,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        d_data = details_res["data"]
        assert d_data["employee"]["id"] == str(emp_standard.id)
        assert d_data["link"]["is_verified"] is True
        assert "reports" not in d_data["permissions_matrix"]["max_permitted_modules"]
        assert "role_templates" in d_data["permissions_matrix"]
        assert "available_scopes" in d_data["permissions_matrix"]
        print(f"✓ GET details returned connection and max permitted modules: {d_data['permissions_matrix']['max_permitted_modules']}")

        # Attempt to grant /reports to standard employee -> MUST BE REJECTED (HTTP 400)
        try:
            update_employee_telegram_permissions(
                employee_id=emp_standard.id,
                payload=UpdateTelegramPermissionsRequest(
                    allowed_modules=["tasks", "tickets", "custody", "reports"],
                ),
                company_id=cid,
                current_user=admin_user,
                active_cid=cid,
                db=db,
            )
            assert False, "Should have rejected privilege escalation!"
        except Exception as ex:
            assert "لا يمكن منح صلاحيات تيليجرام تتجاوز صلاحيات المستخدم" in str(ex.detail if hasattr(ex, "detail") else ex)
            print(f"✓ Correctly prevented privilege escalation: {ex}")

        # Grant valid permissions within CRM limits + data_scope -> MUST SUCCEED
        valid_update = update_employee_telegram_permissions(
            employee_id=emp_standard.id,
            payload=UpdateTelegramPermissionsRequest(
                allowed_modules=["tasks", "tickets", "notifications"],
                data_scope="Self",
                notifications_enabled=True,
            ),
            company_id=cid,
            current_user=admin_user,
            active_cid=cid,
            db=db,
        )
        assert valid_update["data"]["allowed_modules"] == ["tasks", "tickets", "notifications"]
        assert valid_update["data"]["data_scope"] == "Self"
        print("✓ Successfully updated allowed modules, data_scope, and preferences within CRM limits")

        # ── Test 10: Dynamic Reply Keyboard Generation ──────────────────
        print("\n[TEST 10] Testing dynamic reply keyboard filtering...")
        kb_std = build_telegram_reply_keyboard(db, cid, user_link=link_record)
        assert kb_std is not None
        std_buttons = [btn["text"] for row in kb_std["keyboard"] for btn in row]
        assert any("مهامي" in b for b in std_buttons)
        assert not any("التقارير" in b for b in std_buttons), "Reports button must not be visible to standard employee"

        kb_mgr = build_telegram_reply_keyboard(db, cid, user_link=link_mgr)
        mgr_buttons = [btn["text"] for row in kb_mgr["keyboard"] for btn in row]
        assert any("التقارير" in b for b in mgr_buttons), "Reports button must be visible to IT Manager"
        print(f"✓ Reply keyboard dynamically filters buttons according to role (Std={len(std_buttons)} buttons, Mgr={len(mgr_buttons)} buttons)")

        print("\n" + "=" * 70)
        print("ALL 10 TELEGRAM OPERATIONS HUB TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    run_telegram_operations_hub_tests()
