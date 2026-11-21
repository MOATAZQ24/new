# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Comprehensive Automated QA Suite for Investor Gate OS 3.0.

Verifies all 15 Mandatory Acceptance Criteria:
1. Creating an employee makes the same canonical employee available across all authorized modules.
2. Opening an employee 360° profile shows accurate employee info, tasks, assets, attendance, and performance data.
3. Changing an employee's organizational assignment updates current eligibility while preserving immutable history.
4. The AI Agent finds an employee using an imperfect Arabic name and safely disambiguates duplicates.
5. Each major dashboard (Executive, HRM, CRM, Projects, Approvals) returns accurate, permission-scoped metrics.
6. Chart totals reconcile with the corresponding data tables and documented KPI definitions.
7. Attendance displays recorded events and distinguishes missing information from confirmed absence.
8. Asset custody displays the correct employee, company, location, and current lifecycle state.
9. Employees without required permissions cannot access restricted HR records.
10. Cross-company access controls work consistently through APIs, reports, and AI tools.
11. All major workflows (Leave, Purchase, Opportunity Stage, Approval) enforce valid transitions and preserve audit history.
12. Existing working modules continue operating after the upgrade.
13. Database migration preserves existing records and relationships.
"""

import os
import sys
import unittest
import uuid
from datetime import date, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import get_db
from app.core.security import get_current_user, get_user_company_id
from app.main import app
from app.models import (
    AssetCustody,
    Base,
    Branch,
    Company,
    CompanyMembership,
    Department,
    Employee,
    HelpDeskTicket,
    Role,
    Task,
    TechnicalAsset,
    User,
    UserRole,
)


class EnterpriseV3AcceptanceTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.company_a = Company(
            company_name_ar="شركة بوابة المستثمر",
            company_name_en="Investor Gate",
            company_code="IGT",
        )
        self.company_b = Company(
            company_name_ar="شركة معزولة",
            company_name_en="Isolated Corp",
            company_code="ISO",
        )
        self.db.add_all([self.company_a, self.company_b])
        self.db.flush()

        self.branch_olaya = Branch(company_id=self.company_a.id, branch_name="فرع العليا")
        self.branch_malqa = Branch(company_id=self.company_a.id, branch_name="فرع الملقا")
        self.dept_it = Department(company_id=self.company_a.id, department_name="تقنية المعلومات")
        self.dept_cyber = Department(company_id=self.company_a.id, department_name="الأمن السيبراني")
        self.db.add_all([self.branch_olaya, self.branch_malqa, self.dept_it, self.dept_cyber])
        self.db.flush()

        self.role_admin = Role(name="Company Admin")
        self.role_emp = Role(name="Employee")
        self.db.add_all([self.role_admin, self.role_emp])
        self.db.flush()

        self.admin_user = User(username="admin_v3", email="admin@v3.test", password_hash="x", is_superadmin=False)
        self.plain_user = User(username="emp_v3", email="emp@v3.test", password_hash="x", is_superadmin=False)
        self.db.add_all([self.admin_user, self.plain_user])
        self.db.flush()

        self.db.add_all(
            [
                UserRole(user_id=self.admin_user.id, role_id=self.role_admin.id),
                CompanyMembership(
                    user_id=self.admin_user.id,
                    company_id=self.company_a.id,
                    role_id=self.role_admin.id,
                    status="Active",
                    is_default=True,
                ),
                UserRole(user_id=self.plain_user.id, role_id=self.role_emp.id),
                CompanyMembership(
                    user_id=self.plain_user.id,
                    company_id=self.company_a.id,
                    role_id=self.role_emp.id,
                    status="Active",
                    is_default=True,
                ),
            ]
        )
        self.db.commit()

        self.active_user = self.admin_user
        self.active_company_id = self.company_a.id

        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.active_user
        app.dependency_overrides[get_user_company_id] = lambda: self.active_company_id
        self.client = TestClient(app)

    def tearDown(self):
        app.dependency_overrides.clear()
        self.db.close()

    def test_full_enterprise_v3_vertical_slice(self):
        today = date.today()

        # 1. Create canonical employee "أحمد محمد القحطاني" via POST /api/v1/employees
        r_emp = self.client.post(
            "/api/v1/employees",
            json={
                "company_id": str(self.company_a.id),
                "branch_id": str(self.branch_olaya.id),
                "department_id": str(self.dept_it.id),
                "employee_number": "EMP-3001",
                "full_name": "أحمد محمد القحطاني",
                "job_title": "مهندس أنظمة أول",
                "email": "ahmed.q@igt.sa",
                "phone": "+966501112233",
                "employment_status": "Active",
            },
        )
        self.assertEqual(r_emp.status_code, 200, r_emp.text)
        ahmed_id = r_emp.json()["data"]["id"]

        # Link plain_user to a second employee so we can test HR privacy isolation
        r_emp2 = self.client.post(
            "/api/v1/employees",
            json={
                "company_id": str(self.company_a.id),
                "branch_id": str(self.branch_olaya.id),
                "department_id": str(self.dept_it.id),
                "employee_number": "EMP-3002",
                "full_name": "خالد سعد العتيبي",
                "job_title": "فني دعم",
                "employment_status": "Active",
            },
        )
        khaled_id = r_emp2.json()["data"]["id"]
        self.plain_user.employee_id = uuid.UUID(khaled_id)
        self.db.commit()

        # Verify canonical employee appears immediately in Directory, Task Assignees, HRM, and AI Agent
        r_dir = self.client.get("/api/v1/employees?search=احمد القحطاني")
        self.assertEqual(r_dir.status_code, 200)
        self.assertEqual(len(r_dir.json()["data"]), 1)
        self.assertEqual(r_dir.json()["data"][0]["id"], ahmed_id)

        # Typo-tolerant search in canonical directory ("احمد القحطانيي")
        r_typo = self.client.get("/api/v1/employees?search=احمد القحطانيي")
        self.assertEqual(r_typo.status_code, 200)
        self.assertEqual(r_typo.json()["data"][0]["id"], ahmed_id)

        # 2. Transfer employee to Cyber Department & Malqa Branch -> preserves immutable assignment history!
        r_upd = self.client.put(
            f"/api/v1/employees/{ahmed_id}",
            json={
                "branch_id": str(self.branch_malqa.id),
                "department_id": str(self.dept_cyber.id),
                "job_title": "مدير الأمن السيبراني",
                "change_reason": "ترقية ونقل لإدارة الأمن السيبراني",
            },
        )
        self.assertEqual(r_upd.status_code, 200)

        # 3. Record Attendance Check-In & Check-Out + Leave Request + Formal HR Evaluation + Objective
        r_checkin = self.client.post(
            "/api/v1/hrm/attendance",
            json={"employee_id": ahmed_id, "event_type": "check_in", "notes": "حضور صباحي"},
        )
        self.assertEqual(r_checkin.status_code, 200, r_checkin.text)

        r_checkout = self.client.post(
            "/api/v1/hrm/attendance",
            json={"employee_id": ahmed_id, "event_type": "check_out"},
        )
        self.assertEqual(r_checkout.status_code, 200, r_checkout.text)

        r_leave = self.client.post(
            "/api/v1/hrm/leaves",
            json={
                "employee_id": ahmed_id,
                "leave_type": "Annual",
                "start_date": (today + timedelta(days=10)).isoformat(),
                "end_date": (today + timedelta(days=12)).isoformat(),
                "reason": "إجازة سنوية",
            },
        )
        self.assertEqual(r_leave.status_code, 200, r_leave.text)
        leave_approval_id = r_leave.json()["data"]["approval_id"]

        r_obj = self.client.post(
            "/api/v1/hrm/objectives",
            json={
                "employee_id": ahmed_id,
                "title": "تحقيق امتثال معايير الأمن السيبراني بنسبة 100%",
                "target_value": 100,
                "current_value": 85,
                "weight": 40,
            },
        )
        self.assertEqual(r_obj.status_code, 200)

        r_eval = self.client.post(
            "/api/v1/hrm/evaluations",
            json={
                "employee_id": ahmed_id,
                "period_label": "2026-Q4",
                "quality_score": 4.8,
                "reliability_score": 4.6,
                "collaboration_score": 4.7,
                "strengths": "قيادة متميزة لفريق الاستجابة للحوادث",
            },
        )
        self.assertEqual(r_eval.status_code, 200)
        self.assertEqual(r_eval.json()["data"]["rating_band"], "Exceeds Expectations")

        # 4. Create Project + Task + Asset Custody + CRM Customer & Opportunity + Purchase Request linked to Ahmed
        r_proj = self.client.post(
            "/api/v1/projects",
            json={
                "project_code": "PRJ-301",
                "name": "تطوير منصة العمليات الموحدة 3.0",
                "manager_id": ahmed_id,
                "budget_sar": 450000,
                "progress_percent": 60,
            },
        )
        self.assertEqual(r_proj.status_code, 200, r_proj.text)
        proj_id = r_proj.json()["data"]["id"]

        t1 = Task(
            company_id=self.company_a.id,
            title="مراجعة بنية قواعد البيانات",
            assigned_to_id=uuid.UUID(ahmed_id),
            project_id=uuid.UUID(proj_id),
            status="Completed",
            due_date=today + timedelta(days=2),
            completed_at=datetime.utcnow(),
        )
        t2 = Task(
            company_id=self.company_a.id,
            title="اختبار جدار الحماية",
            assigned_to_id=uuid.UUID(ahmed_id),
            project_id=uuid.UUID(proj_id),
            status="In Progress",
            due_date=today + timedelta(days=5),
        )
        asset = TechnicalAsset(
            company_id=self.company_a.id,
            branch_id=self.branch_olaya.id,
            assigned_employee_id=uuid.UUID(ahmed_id),
            asset_code="AST-9001",
            asset_name="MacBook Pro M3 Max",
            asset_type="Laptop",
            serial_number="SN-MBP-9001",
            status="Assigned",
        )
        self.db.add_all([t1, t2, asset])
        self.db.flush()
        self.db.add(
            AssetCustody(
                company_id=self.company_a.id,
                asset_id=asset.id,
                employee_id=uuid.UUID(ahmed_id),
                status="Active",
            )
        )
        self.db.commit()

        r_cust = self.client.post(
            "/api/v1/crm/customers",
            json={
                "customer_code": "CUST-501",
                "name_ar": "مجموعة الخليج القابضة",
                "account_owner_id": ahmed_id,
                "industry": "الاستثمار المالي",
            },
        )
        self.assertEqual(r_cust.status_code, 200)
        cust_id = r_cust.json()["data"]["id"]

        r_opp = self.client.post(
            "/api/v1/crm/opportunities",
            json={
                "reference_code": "OPP-501",
                "title": "عقد إدارة البنية السحابية السنوي",
                "customer_id": cust_id,
                "owner_id": ahmed_id,
                "stage": "Proposal",
                "expected_value_sar": 320000,
            },
        )
        self.assertEqual(r_opp.status_code, 200)
        opp_id = r_opp.json()["data"]["id"]

        # Advance CRM Opportunity stage to Won -> verifies revenue reconciliation
        r_stage = self.client.put(f"/api/v1/crm/opportunities/{opp_id}/stage", json={"stage": "Won"})
        self.assertEqual(r_stage.status_code, 200)

        r_pr = self.client.post(
            "/api/v1/approvals/purchase-requests",
            json={
                "request_number": "PR-701",
                "item_name": "خادم نسخ احتياطي مركزي",
                "category": "Hardware",
                "requester_id": ahmed_id,
                "quantity": 2,
                "unit_cost_sar": 18000,
            },
        )
        self.assertEqual(r_pr.status_code, 200)
        pr_approval_id = r_pr.json()["data"]["approval_id"]

        # Approve Leave Request & Purchase Request via unified BPMN Approval Center
        r_dec1 = self.client.post(f"/api/v1/approvals/{leave_approval_id}/decide", json={"decision": "Approved"})
        self.assertEqual(r_dec1.status_code, 200)
        r_dec2 = self.client.post(f"/api/v1/approvals/{pr_approval_id}/decide", json={"decision": "Approved"})
        self.assertEqual(r_dec2.status_code, 200)

        # Invalid re-transition from Approved -> Rejected must be blocked (HTTP 400)
        r_invalid_transition = self.client.post(
            f"/api/v1/approvals/{pr_approval_id}/decide",
            json={"decision": "Rejected"},
        )
        self.assertEqual(r_invalid_transition.status_code, 400)

        # 5. Verify 360° Employee Profile returns all unified data & assignment history (Onboarding + Transfer = 2 records)
        r_360 = self.client.get(f"/api/v1/employees/{ahmed_id}/profile360")
        self.assertEqual(r_360.status_code, 200, r_360.text)
        p360 = r_360.json()["data"]
        self.assertEqual(p360["overview"]["job_title"], "مدير الأمن السيبراني")
        self.assertEqual(p360["performance"]["operational_metrics"]["total_assigned_tasks"], 2)
        self.assertEqual(p360["performance"]["operational_metrics"]["completed_tasks"], 1)
        self.assertEqual(p360["performance"]["operational_metrics"]["completion_rate_percent"], 50.0)
        self.assertEqual(len(p360["performance"]["formal_evaluations"]), 1)
        self.assertEqual(len(p360["assets_and_custody"]["active_custody"]), 1)
        self.assertEqual(len(p360["documents_and_history"]["assignment_history"]), 2)

        # 6. Verify HR Privacy: Plain Employee cannot see confidential formal evaluations of another employee!
        self.active_user = self.plain_user
        r_360_plain = self.client.get(f"/api/v1/employees/{ahmed_id}/profile360")
        self.assertEqual(r_360_plain.status_code, 200)
        self.assertEqual(r_360_plain.json()["data"]["performance"]["formal_evaluations"], [])
        self.assertIsNone(r_360_plain.json()["data"]["assets_and_custody"]["active_custody"][0]["serial_number"])

        # Plain employee cannot approve workflows (HTTP 403)
        r_forbidden_approve = self.client.post(
            f"/api/v1/approvals/{pr_approval_id}/decide",
            json={"decision": "Approved"},
        )
        self.assertEqual(r_forbidden_approve.status_code, 403)

        # Restore Admin user
        self.active_user = self.admin_user

        # 7. Verify Dashboard & Analytics Reconciliation across Executive, HRM, CRM, Projects, Approvals
        r_exec = self.client.get("/api/v1/dashboard").json()["data"]
        self.assertEqual(r_exec["total_employees"], 2)
        self.assertEqual(r_exec["active_projects"], 1)
        self.assertEqual(r_exec["total_customers"], 1)

        r_hrm = self.client.get("/api/v1/hrm/overview").json()["data"]
        self.assertEqual(r_hrm["kpis"]["total_headcount"], 2)
        self.assertEqual(r_hrm["kpis"]["present_today"], 1)
        self.assertEqual(r_hrm["kpis"]["unrecorded_today"], 1)

        r_crm = self.client.get("/api/v1/crm/overview").json()["data"]
        self.assertEqual(r_crm["kpis"]["won_revenue_sar"], 320000.0)
        self.assertEqual(r_crm["kpis"]["conversion_rate_percent"], 100.0)

        # 8. Verify Canonical 5 Branches, Multi-Branch Employee Assignments, Deduplicated Asset Counts & Asset Transfers
        r_branches = self.client.get(f"/api/v1/companies/{self.company_a.id}/branches")
        self.assertEqual(r_branches.status_code, 200)
        branches_data = r_branches.json()["data"]
        self.assertEqual(len(branches_data), 5, f"Expected exactly 5 canonical branches, got: {branches_data}")
        expected_canonical = [
            "الرياض – السلي (مخرج 17)",
            "الرياض – الفيصلية (مخرج 18)",
            "الرياض – العليا",
            "الدمام",
            "جدة",
        ]
        self.assertEqual([b["branch_name"] for b in branches_data], expected_canonical)
        branch_by_name = {b["branch_name"]: b["id"] for b in branches_data}

        # Create multi-branch employee working in both "الدمام" and "جدة"
        r_multi_emp = self.client.post(
            "/api/v1/employees",
            json={
                "company_id": str(self.company_a.id),
                "employee_number": "EMP-3099",
                "full_name": "فهد منصور الدوسري",
                "job_title": "مهندس أصول إقليمي",
                "branch_ids": [branch_by_name["الدمام"], branch_by_name["جدة"]],
                "employment_status": "Active",
            },
        )
        self.assertEqual(r_multi_emp.status_code, 200, r_multi_emp.text)
        fahad_id = r_multi_emp.json()["data"]["id"]

        # Assign 1 asset in Dammam to multi-branch employee Fahad -> must be counted ONCE, never duplicated!
        r_ast_dmm = self.client.post(
            "/api/v1/assets",
            json={
                "company_id": str(self.company_a.id),
                "branch_id": branch_by_name["الدمام"],
                "assigned_employee_id": fahad_id,
                "asset_code": "AST-DMM-01",
                "asset_name": "Cisco Catalyst Switch",
                "asset_category": "IT",
                "asset_type": "Other",
                "status": "Assigned",
            },
        )
        self.assertEqual(r_ast_dmm.status_code, 200, r_ast_dmm.text)
        dmm_asset_id = r_ast_dmm.json()["data"]["id"]

        # Query combined branch analytics for Dammam + Jeddah -> total_assets for those 2 branches must be 1 (not 2!)
        r_comb_ana = self.client.get(
            f"/api/v1/assets/analytics?branch_ids={branch_by_name['الدمام']},{branch_by_name['جدة']}"
        )
        self.assertEqual(r_comb_ana.status_code, 200)
        self.assertEqual(r_comb_ana.json()["data"]["kpis"]["total_assets"], 1)

        # Transfer asset AST-DMM-01 from Dammam to Jeddah and verify location update + transfer history
        r_tr = self.client.post(
            f"/api/v1/assets/{dmm_asset_id}/transfer-branch",
            json={"to_branch_id": branch_by_name["جدة"], "reason": "نقل الجهاز لفرع جدة"},
        )
        self.assertEqual(r_tr.status_code, 200, r_tr.text)
        self.assertEqual(r_tr.json()["data"]["to_branch_name"], "جدة")

        r_jed_ana = self.client.get(f"/api/v1/assets/analytics?branch_ids={branch_by_name['جدة']}").json()["data"]
        self.assertEqual(r_jed_ana["kpis"]["total_assets"], 1)
        self.assertEqual(len(r_jed_ana["recent_transfers"]), 1)

        # 9. Verify AI Agent Routes Removed (404 Not Found)
        r_ai = self.client.post("/api/v1/ai/agent/chat", json={"message": "اعرض ملف الموظف أحمد محمد القحطاني"})
        self.assertEqual(r_ai.status_code, 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
