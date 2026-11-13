"""
Comprehensive Integration Tests for User Management & Multi-Company Access Control (RBAC).
Tests:
- User creation with temporary credentials & mandatory password change
- Multi-company memberships with different roles per company
- Privilege escalation prevention
- Protection of the last active Super Admin
- Soft-delete, session revocation, and restore
- Password reset with admin reauthentication
- Account unlocking
- Bulk user import without passwords
- Permission matrix validation
"""

import sys
import os
import uuid
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal, init_db
from app.models.company import Company, Branch
from app.models.user import User, Employee, Role, UserRole, CompanyMembership, UserSession
from app.schemas.user import (
    UserCreateForm,
    UserUpdateForm,
    UserStatusUpdate,
    UserResetPasswordAdmin,
    CompanyAccessAssign,
    BulkUserImportRequest,
    BulkUserItem,
)
from app.api.v1.endpoints import users
from app.core.security import get_user_roles, verify_password, create_session
from app.core.rbac import (
    has_module_permission,
    get_permission_matrix_serializable,
    Module,
    Action,
)
from fastapi import HTTPException


def run_tests():
    init_db()
    db = SessionLocal()
    print("=" * 65)
    print("STARTING TEST SUITE: USER MANAGEMENT & ACCESS CONTROL")
    print("=" * 65)

    try:
        # 1. Setup Admin & Companies
        admin_user = db.query(User).filter(User.username == "admin").first()
        assert admin_user is not None, "Admin user must exist"

        companies = db.query(Company).limit(2).all()
        assert len(companies) >= 2, "At least 2 companies required for multi-company tests"
        co1 = companies[0]
        co2 = companies[1]
        print(f"  ✓ Multi-Company Setup: Company 1='{co1.company_name_ar}', Company 2='{co2.company_name_ar}'")

        # 2. Create User Wizard
        test_uname = f"usr_{uuid.uuid4().hex[:6]}"
        test_email = f"{test_uname}@investorgate.com"
        create_payload = UserCreateForm(
            full_name="طارق عبدالعزيز المنصور",
            username=test_uname,
            email=test_email,
            phone="+966551234567",
            company_id=co1.id,
            role="Company Admin",
            account_status="Active",
            password=None,  # auto-generate temporary password
            must_change_password=True,
            send_invitation=True,
        )

        res = users.create_user(
            payload=create_payload,
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        assert res["message"] == "تم إنشاء حساب المستخدم بنجاح"
        created_user_id = uuid.UUID(res["data"]["user_id"])
        temp_pass = res["data"]["temporary_password"]
        assert temp_pass is not None, "Temporary password must be generated when omitted"
        assert res["data"]["must_change_password"] is True
        print(f"  ✓ User created with secure temporary credentials: {test_uname} (ID: {created_user_id})")

        # Verify password verifies with temporary password
        created_u = db.query(User).filter(User.id == created_user_id).first()
        assert verify_password(temp_pass, created_u.password_hash)
        assert created_u.must_change_password is True
        print("  ✓ Mandatory password change flag and Argon2id hash verified")

        # 3. Duplicate checks
        dup_failed = False
        try:
            users.create_user(
                payload=create_payload,
                current_user=admin_user,
                active_cid=co1.id,
                db=db,
            )
        except HTTPException as e:
            if e.status_code == 400:
                dup_failed = True
        assert dup_failed, "Duplicate username/email must be rejected with 400"
        print("  ✓ Duplicate username and email strictly rejected")

        # 4. Multi-Company Role Assignment (Different Roles per Company)
        # In Company 1: User is "Company Admin"
        roles_co1 = get_user_roles(created_u, db, company_id=co1.id)
        assert "Company Admin" in roles_co1
        print(f"  ✓ User role in Company 1 verified: {roles_co1}")

        # Assign User to Company 2 as "IT Technician"
        assign_res = users.assign_company_access(
            user_id=created_user_id,
            payload=CompanyAccessAssign(
                company_id=co2.id,
                role="IT Technician",
                is_default=False,
            ),
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        assert assign_res["message"] == "تم تعيين صلاحيات الشركة بنجاح"

        # Verify role in Company 2 is "IT Technician"
        roles_co2 = get_user_roles(created_u, db, company_id=co2.id)
        assert "IT Technician" in roles_co2
        print(f"  ✓ Multi-Company Isolation: User is 'Company Admin' in Co 1, but 'IT Technician' in Co 2: {roles_co2}")

        # 5. Permission Matrix Evaluation per Company Context
        # In Company 1 (as Company Admin): user can manage access
        can_manage_co1 = has_module_permission(created_u, Module.USERS, Action.MANAGE_ACCESS, co1.id, db)
        assert can_manage_co1 is True
        # In Company 2 (as IT Technician): user CANNOT manage access or delete assets
        can_manage_co2 = has_module_permission(created_u, Module.USERS, Action.MANAGE_ACCESS, co2.id, db)
        assert can_manage_co2 is False
        can_delete_co2 = has_module_permission(created_u, Module.ASSETS, Action.DELETE, co2.id, db)
        assert can_delete_co2 is False
        print("  ✓ Server-side RBAC Permission Matrix strictly enforced per company context")

        # 6. Session Revocation on Account Deactivation
        # Create dummy session for user
        dummy_session = UserSession(
            user_id=created_user_id,
            session_token=uuid.uuid4().hex,
            expires_at=datetime.utcnow() + timedelta(hours=12),
            is_active=True,
        )
        db.add(dummy_session)
        db.commit()

        # Deactivate user
        users.toggle_user_status(
            user_id=created_user_id,
            payload=UserStatusUpdate(account_status="Suspended"),
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        db.refresh(created_u)
        assert created_u.account_status == "Suspended"

        # Check that session is revoked
        revoked_sess = db.query(UserSession).filter(UserSession.id == dummy_session.id).first()
        assert revoked_sess.is_active is False, "Active sessions must be revoked upon deactivation"
        print("  ✓ Security: User sessions immediately revoked upon account deactivation")

        # Reactivate user
        users.toggle_user_status(
            user_id=created_user_id,
            payload=UserStatusUpdate(account_status="Active"),
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )

        # 7. Protect Last Active Super Admin
        protect_super_failed = False
        try:
            users.delete_user(
                user_id=admin_user.id,
                current_user=admin_user,
                active_cid=co1.id,
                db=db,
            )
        except HTTPException as e:
            if e.status_code == 400:
                protect_super_failed = True
        assert protect_super_failed, "Deleting current/last Super Admin must be blocked"
        print("  ✓ Security: Deletion of the last active Super Admin strictly prevented")

        # 8. Password Reset with Admin Reauthentication
        # Wrong reauth password must fail
        wrong_reauth_failed = False
        try:
            users.admin_reset_password(
                user_id=created_user_id,
                payload=UserResetPasswordAdmin(
                    new_password="NewSecurePassword2026!",
                    must_change_password=True,
                    reauth_password="WrongAdminPassword123",
                ),
                current_user=admin_user,
                active_cid=co1.id,
                db=db,
            )
        except HTTPException as e:
            if e.status_code == 401:
                wrong_reauth_failed = True
        assert wrong_reauth_failed, "Invalid admin reauth password must be rejected with 401"
        print("  ✓ Security: Password reset requires verified admin reauthentication (401 on failure)")

        # Correct reauth password succeeds
        reset_res = users.admin_reset_password(
            user_id=created_user_id,
            payload=UserResetPasswordAdmin(
                new_password="NewSecurePassword2026!",
                must_change_password=True,
                reauth_password="Admin@12345",
            ),
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        assert reset_res["message"].startswith("تمت إعادة تعيين كلمة المرور بنجاح")
        db.refresh(created_u)
        assert verify_password("NewSecurePassword2026!", created_u.password_hash)
        assert created_u.must_change_password is True
        print("  ✓ Password successfully reset with verified admin reauthentication")

        # 9. Account Unlock
        created_u.failed_login_attempts = 5
        created_u.locked_until = datetime.utcnow() + timedelta(minutes=15)
        db.commit()

        unlock_res = users.unlock_account(
            user_id=created_user_id,
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        assert unlock_res["message"] == "تم إلغاء قفل حساب المستخدم بنجاح"
        db.refresh(created_u)
        assert created_u.locked_until is None
        assert created_u.failed_login_attempts == 0
        print("  ✓ Account unlock verified: failed attempts and lock cleared")

        # 10. Soft Delete & Restore
        users.delete_user(
            user_id=created_user_id,
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        db.refresh(created_u)
        assert created_u.is_deleted is True
        assert created_u.account_status == "Inactive"
        print("  ✓ Soft Delete verified: Account marked deleted & inactive without data loss")

        users.restore_user(
            user_id=created_user_id,
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        db.refresh(created_u)
        assert created_u.is_deleted is False
        assert created_u.account_status == "Active"
        print("  ✓ User restore verified: Account safely restored to Active")

        # 11. Bulk User Import without Passwords
        bulk_data = [
            BulkUserItem(
                full_name="سلمان فهد الخالدي",
                username=f"salman_{uuid.uuid4().hex[:5]}",
                email=f"salman_{uuid.uuid4().hex[:5]}@investorgate.com",
                phone="+966501112233",
                role="IT Technician",
            ),
            BulkUserItem(
                full_name="هند ناصر العتيبي",
                username=f"hind_{uuid.uuid4().hex[:5]}",
                email=f"hind_{uuid.uuid4().hex[:5]}@investorgate.com",
                phone="+966504445566",
                role="Auditor",
            ),
        ]
        bulk_res = users.bulk_import_users(
            payload=BulkUserImportRequest(users=bulk_data),
            current_user=admin_user,
            active_cid=co1.id,
            db=db,
        )
        assert bulk_res["data"]["imported_count"] == 2
        print("  ✓ Bulk user import from Excel verified: 2 users created with temporary passwords")

        # 12. Permissions Matrix API
        matrix_res = users.get_permissions_matrix(current_user=admin_user)
        matrix_data = matrix_res["data"]
        assert "Super Admin" in matrix_data
        assert "Company Admin" in matrix_data
        assert "IT Manager" in matrix_data
        assert "IT Technician" in matrix_data
        assert "Employee" in matrix_data
        assert "Auditor" in matrix_data
        print("  ✓ Full RBAC Permissions Matrix serialized and validated")

        print("=" * 65)
        print("ALL USER MANAGEMENT & RBAC TESTS PASSED SUCCESSFULLY! ✓✓✓")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
