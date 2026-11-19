"""Automated test suite for Investor Gate OS 3.0 enhancements.
Tests:
1. Ticket KPI consistency: /tickets/summary vs /tickets list pagination
2. Employee Soft Delete / Archive and Restore lifecycle
3. Employee directory archive filtering (include_archived=true vs false)
4. Multi-company tenant scoping and KPI integrity
"""

import sys
import os
import uuid
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import SessionLocal
from app.models.company import Company
from app.models.user import User, Employee
from app.models.ticket import HelpDeskTicket
from app.api.v1.endpoints import tickets, employees, companies
from fastapi import HTTPException


def run_tests():
    db = SessionLocal()
    print("=== Running Investor Gate OS 3.0 Enhancements Test Suite ===")

    try:
        # Find active admin user and IGT company
        admin = db.query(User).filter(User.username == "admin").first()
        if not admin:
            # Fallback to any superadmin
            admin = db.query(User).filter(User.is_superadmin == True).first()
        assert admin is not None, "Admin user must exist"

        igt = db.query(Company).filter(Company.company_code == "IGT").first()
        assert igt is not None, "IGT company must exist"
        active_cid = igt.id

        # -------------------------------------------------------------
        # TEST 1: Help Desk Summary & Pagination Consistency
        # -------------------------------------------------------------
        print("\n[TEST 1] Testing /tickets/summary authoritative KPI endpoint...")
        summary_resp = tickets.get_tickets_summary(
            company_id=active_cid,
            branch_id=None,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert summary_resp["data"]["total"] >= 20, f"Expected at least 20 tickets for IGT, got {summary_resp['data']['total']}"
        print(f"  -> Total tickets for IGT: {summary_resp['data']['total']}")
        print(f"  -> Open: {summary_resp['data']['open']}, In Progress: {summary_resp['data']['in_progress']}, Resolved: {summary_resp['data']['resolved']}")

        # List tickets with per_page=10
        list_resp = tickets.list_tickets(
            page=1,
            per_page=10,
            company_id=active_cid,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert len(list_resp["data"]) == 10, f"Expected 10 items on page 1, got {len(list_resp['data'])}"
        assert list_resp["pagination"]["total"] == summary_resp["data"]["total"], "Pagination total must match summary total!"
        assert list_resp["pagination"]["total_pages"] >= 2, "Expected multiple pages"
        print(f"  -> Page 1 returned 10 items. Total pagination: {list_resp['pagination']}")
        print("  [PASS] Ticket KPI consistency verified!")

        # -------------------------------------------------------------
        # TEST 2: Employee Soft Delete / Archive & Restore Lifecycle
        # -------------------------------------------------------------
        print("\n[TEST 2] Testing Employee Soft Delete / Archive & Restore Lifecycle...")
        test_emp_num = f"TEST-EMP-{uuid.uuid4().hex[:6].upper()}"
        test_emp = Employee(
            company_id=active_cid,
            employee_number=test_emp_num,
            full_name="موظف تجربة الأرشفة المؤقت",
            job_title="مهندس اختبارات",
            email="test.archive@investorgate.sa",
            phone="0500000000",
            employment_status="Active",
            is_deleted=False,
        )
        db.add(test_emp)
        db.commit()
        db.refresh(test_emp)
        emp_id = test_emp.id
        print(f"  -> Created test employee ID: {emp_id} ({test_emp_num})")

        # Verify employee appears in standard directory
        active_list = employees.list_employees(
            page=1,
            per_page=50,
            company_id=active_cid,
            include_archived=False,
            search=test_emp_num,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert any(e["employee_number"] == test_emp_num for e in active_list["data"]), "Active employee must appear in active list"

        # Now SOFT DELETE (Archive) the employee
        del_resp = employees.delete_employee(
            employee_id=emp_id,
            permanent=False,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        print(f"  -> delete_employee response: {del_resp['message']}")

        # Verify DB state
        db.expire_all()
        archived_emp = db.query(Employee).filter(Employee.id == emp_id).first()
        assert archived_emp is not None, "Employee record must NOT be deleted from DB (soft delete)"
        assert archived_emp.is_deleted == True, "is_deleted must be True"
        assert archived_emp.employment_status == "Archived", "employment_status must be 'Archived'"
        assert archived_emp.deleted_at is not None, "deleted_at must be populated"
        print("  -> Employee successfully soft-deleted/archived in database")

        # Verify employee does NOT appear in default active list
        active_list_after = employees.list_employees(
            page=1,
            per_page=50,
            company_id=active_cid,
            include_archived=False,
            search=test_emp_num,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert not any(e["employee_number"] == test_emp_num for e in active_list_after["data"]), "Archived employee must NOT appear in active list"
        print("  -> Verified archived employee is hidden from active list")

        # Verify employee DOES appear when include_archived=True
        archived_list = employees.list_employees(
            page=1,
            per_page=50,
            company_id=active_cid,
            include_archived=True,
            search=test_emp_num,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert any(e["employee_number"] == test_emp_num for e in archived_list["data"]), "Archived employee must appear when include_archived=True"
        print("  -> Verified archived employee appears in archive view")

        # Now RESTORE the employee
        restore_resp = employees.restore_employee(
            employee_id=emp_id,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        print(f"  -> restore_employee response: {restore_resp['message']}")

        # Verify DB state after restore
        db.expire_all()
        restored_emp = db.query(Employee).filter(Employee.id == emp_id).first()
        assert restored_emp.is_deleted == False, "is_deleted must be False after restore"
        assert restored_emp.employment_status == "Active", "employment_status must be 'Active' after restore"
        assert restored_emp.deleted_at is None, "deleted_at must be None after restore"
        print("  -> Employee successfully restored to Active state")

        # Verify employee reappears in standard directory
        active_list_restored = employees.list_employees(
            page=1,
            per_page=50,
            company_id=active_cid,
            include_archived=False,
            search=test_emp_num,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        assert any(e["employee_number"] == test_emp_num for e in active_list_restored["data"]), "Restored employee must reappear in active list"
        print("  -> Verified restored employee reappears in active list")

        # Cleanup test employee record
        db.delete(restored_emp)
        db.commit()
        print("  -> Cleaned up test employee record")
        print("  [PASS] Employee Soft Delete / Archive & Restore lifecycle verified!")

        # -------------------------------------------------------------
        # TEST 3: Multi-company KPI Summary Consistency
        # -------------------------------------------------------------
        print("\n[TEST 3] Testing Directory Summary KPIs...")
        emp_summary = employees.get_employees_summary(
            company_id=active_cid,
            current_user=admin,
            active_cid=active_cid,
            db=db,
        )
        print(f"  -> Employee summary for IGT: {emp_summary['data']}")
        assert emp_summary["data"]["total"] >= 200, "Expected >= 200 employees for IGT"
        print("  [PASS] Directory summary KPIs verified!")

        # -------------------------------------------------------------
        # TEST 4: Company Impact, Archive, Restore & Safeguards Lifecycle
        # -------------------------------------------------------------
        print("\n[TEST 4] Testing Company Impact Analysis, Archival & Safeguards...")

        # 4.1 Check impact analysis for active company with records
        igt_impact = companies.get_company_impact(
            company_id=active_cid,
            current_user=admin,
            db=db,
        )
        print(f"  -> IGT operational impact: {igt_impact['data']}")
        assert igt_impact["data"]["can_delete"] is False, "Active company with records must not be eligible for hard delete"
        assert igt_impact["data"]["can_archive"] is True, "Active company must be eligible for archival"
        assert igt_impact["data"]["employees_count"] >= 200, "Expected >= 200 employees in impact analysis"
        assert len(igt_impact["data"]["reasons"]) > 0, "Reasons must be provided for blocked deletion"

        # 4.2 Verify safeguard blocks hard delete on active company
        try:
            companies.delete_company(company_id=active_cid, current_user=admin, db=db)
            assert False, "delete_company must raise 400 when operational records exist"
        except HTTPException as e:
            assert e.status_code == 400
            print(f"  -> Verified hard delete blocked by safeguard: {e.detail}")

        # 4.3 Create a standalone test company
        test_company = Company(
            company_name_ar="شركة الاختبار التجريبية",
            company_name_en="Experimental Test Corp",
            company_code=f"TC-{uuid.uuid4().hex[:6].upper()}",
            status="Active",
            company_type="Internal",
            is_deleted=False,
        )
        db.add(test_company)
        db.commit()
        db.refresh(test_company)
        print(f"  -> Created standalone test company: {test_company.company_name_ar} ({test_company.id})")

        # 4.4 Test impact on empty company
        empty_impact = companies.get_company_impact(
            company_id=test_company.id,
            current_user=admin,
            db=db,
        )
        assert empty_impact["data"]["can_delete"] is True, "Empty company with 0 records should be eligible for delete"

        # 4.5 Test Archive
        archive_resp = companies.archive_company(company_id=test_company.id, current_user=admin, db=db)
        print(f"  -> Archive response: {archive_resp['message']}")
        db.refresh(test_company)
        assert test_company.is_deleted is True
        assert test_company.status == "Archived"

        # 4.6 Test Restore
        restore_resp = companies.restore_company(company_id=test_company.id, current_user=admin, db=db)
        print(f"  -> Restore response: {restore_resp['message']}")
        db.refresh(test_company)
        assert test_company.is_deleted is False
        assert test_company.status == "Active"

        # 4.7 Test Clean Delete
        del_resp = companies.delete_company(company_id=test_company.id, current_user=admin, db=db)
        print(f"  -> Delete response: {del_resp['message']}")
        check_deleted = db.query(Company).filter(Company.id == test_company.id).first()
        assert check_deleted is None, "Company must be permanently deleted"
        print("  [PASS] Company Impact, Archive, Restore & Safeguards verified!")

        print("\n=== ALL OS 3.0 TESTS PASSED SUCCESSFULLY! ===")

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
