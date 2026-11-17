"""End-to-End Integration & Security Tests for Investor Gate OS AI Action Agent."""

import io
import json
import os
import sys
import unittest
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite://"

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.v1.router import api_router
from app.core.database import get_db
from app.core.security import get_current_user
from app.models import Base
from app.models.asset import TechnicalAsset
from app.models.company import Company, Department
from app.models.integration import IntegrationConfig
from app.models.notification import Notification
from app.models.task import Task
from app.models.telegram import NotificationOutbox, TelegramUserLink
from app.models.ticket import HelpDeskTicket
from app.models.user import CompanyMembership, Employee, Role, User


class _FakeUrllibResponse:
    def __init__(self, payload: dict, status: int = 200):
        self._raw = json.dumps(payload).encode("utf-8")
        self.status = status

    def read(self):
        return self._raw

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class AiActionAgentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        self.company_a = Company(company_name_ar="شركة بوابة المستثمر", company_name_en="Investor Gate", company_code="IGT")
        self.company_b = Company(company_name_ar="شركة أخرى", company_name_en="Other Co", company_code="OTH")
        self.db.add_all([self.company_a, self.company_b])
        self.db.flush()

        self.dept_it = Department(company_id=self.company_a.id, department_name="تقنية المعلومات")
        self.db.add(self.dept_it)
        self.db.flush()

        self.role_admin = Role(name="Company Admin")
        self.role_tech = Role(name="IT Technician")
        self.role_emp = Role(name="Employee")
        self.db.add_all([self.role_admin, self.role_tech, self.role_emp])
        self.db.flush()

        # Users & Employees
        self.admin_user = User(username="admin_a", email="admin@igt.test", password_hash="x", is_superadmin=False)
        self.tech_user = User(username="tech_ali", email="ali@igt.test", password_hash="x", is_superadmin=False)
        self.plain_emp_user = User(username="emp_basic", email="basic@igt.test", password_hash="x", is_superadmin=False)
        self.other_co_user = User(username="other_mgr", email="other@oth.test", password_hash="x", is_superadmin=False)
        self.db.add_all([self.admin_user, self.tech_user, self.plain_emp_user, self.other_co_user])
        self.db.flush()

        self.emp_muhammad = Employee(
            company_id=self.company_a.id, department_id=self.dept_it.id,
            employee_number="EMP-101", full_name="محمد الحربي", job_title="مهندس نظم",
            email="mohammed@igt.test", employment_status="Active",
        )
        self.emp_salem = Employee(
            company_id=self.company_a.id, department_id=self.dept_it.id,
            employee_number="EMP-102", full_name="سالم العتيبي", job_title="موظف",
            email="salem@igt.test", employment_status="Active",
        )
        self.emp_unlinked = Employee(
            company_id=self.company_a.id, department_id=self.dept_it.id,
            employee_number="EMP-103", full_name="فيصل الدوسري", job_title="فني دعم",
            email="faisal@igt.test", employment_status="Active",
        )
        self.emp_other_co = Employee(
            company_id=self.company_b.id,
            employee_number="EMP-B01", full_name="زياد الخارجي", job_title="مدير",
            email="ziyad@oth.test", employment_status="Active",
        )
        self.db.add_all([self.emp_muhammad, self.emp_salem, self.emp_unlinked, self.emp_other_co])
        self.db.flush()

        self.admin_user.employee_id = None
        self.tech_user.employee_id = self.emp_muhammad.id
        self.plain_emp_user.employee_id = self.emp_salem.id
        self.other_co_user.employee_id = self.emp_other_co.id

        self.db.add_all([
            CompanyMembership(user_id=self.admin_user.id, company_id=self.company_a.id, role_id=self.role_admin.id, is_default=True, status="Active"),
            CompanyMembership(user_id=self.tech_user.id, company_id=self.company_a.id, role_id=self.role_tech.id, is_default=True, status="Active"),
            CompanyMembership(user_id=self.plain_emp_user.id, company_id=self.company_a.id, role_id=self.role_emp.id, is_default=True, status="Active"),
            CompanyMembership(user_id=self.other_co_user.id, company_id=self.company_b.id, role_id=self.role_admin.id, is_default=True, status="Active"),
        ])

        # Telegram config + verified link for محمد الحربي
        self.db.add(IntegrationConfig(
            company_id=self.company_a.id,
            service_name="telegram",
            display_name="Telegram",
            is_enabled=True,
            config_data={"bot_token": "123456:TESTTOKEN_ABC", "bot_username": "IGTTestBot", "chat_id": "555000"},
            status="Connected",
        ))
        self.db.add(TelegramUserLink(
            company_id=self.company_a.id,
            employee_id=self.emp_muhammad.id,
            user_id=self.tech_user.id,
            telegram_user_id="777888999",
            telegram_chat_id="777888999",
            telegram_username="mohammed_tg",
            verification_token="tok-verified-101",
            token_expires_at=datetime.utcnow() + timedelta(days=30),
            is_verified=True,
            notifications_enabled=True,
        ))

        # Seed existing Help Desk Ticket #125 and Overdue Task
        self.ticket_125 = HelpDeskTicket(
            company_id=self.company_a.id,
            ticket_number="TCK-2026-0125",
            issue_title="بطء شديد في VPN الشركة",
            issue_description="فشل الاتصال المتكرر بخدمة الشبكة الافتراضية",
            requester_id=self.emp_salem.id,
            priority="High",
            status="Open",
            category="Network",
        )
        self.overdue_task = Task(
            company_id=self.company_a.id,
            title="فحص جدار الحماية",
            assigned_to_id=self.emp_muhammad.id,
            assigned_by_id=self.admin_user.id,
            priority="Urgent",
            status="Assigned",
            due_date=date.today() - timedelta(days=2),
        )
        self.db.add_all([self.ticket_125, self.overdue_task])
        self.db.commit()

        self.current_user = self.admin_user
        app = FastAPI()
        app.include_router(api_router, prefix="/api")
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.current_user
        self.client = TestClient(app)
        self.headers_a = {"X-Company-ID": str(self.company_a.id)}

    def tearDown(self):
        self.client.close()
        self.db.close()
        self.engine.dispose()

    def _confirm_turn(self, first_data: dict, idem_key: str = None) -> dict:
        self.assertEqual(first_data["status"], "needs_confirmation", first_data)
        tok = first_data["pending_confirmation"]["confirmation_token"]
        res = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={
                "message": "تأكيد التنفيذ",
                "confirmation_token": tok,
                "confirm_decision": "confirm",
                **({"idempotency_key": idem_key} if idem_key else {}),
            },
        )
        self.assertEqual(res.status_code, 200, res.text)
        return res.json()["data"]

    def test_01_create_task_and_notify_e2e_and_idempotency(self):
        idem = f"idem-{uuid.uuid4().hex[:8]}"
        with patch("app.services.telegram_service.urllib.request.urlopen") as mock_tg:
            mock_tg.return_value = _FakeUrllibResponse({"ok": True, "result": {"message_id": 401}})
            res = self.client.post(
                "/api/v1/ai/agent/chat",
                headers=self.headers_a,
                json={"message": "أنشئ مهمة لمحمد لمراجعة السيرفر غدًا وأرسل له إشعارًا."},
            )
            self.assertEqual(res.status_code, 200, res.text)
            ask = res.json()["data"]
            self.assertEqual(ask["status"], "needs_confirmation")
            self.assertEqual(self.db.query(Task).filter(Task.title.contains("مراجعة السيرفر")).count(), 0)

            body = self._confirm_turn(ask, idem_key=idem)
            self.assertEqual(body["status"], "executed")
            self.assertFalse(body["duplicate"])
            card = body["result_card"]
            self.assertEqual(card["assignee_name"], "محمد الحربي")
            self.assertEqual(card["due_date"], (date.today() + timedelta(days=1)).isoformat())
            self.assertEqual(card["in_app_status"], "Sent")
            self.assertEqual(card["telegram_status"], "Sent")
            self.assertTrue(card["reference"].startswith("TASK-"))

            # Verify DB persistence
            created_task = self.db.query(Task).filter(Task.id == uuid.UUID(card["task_id"])).first()
            self.assertIsNotNone(created_task)
            self.assertIn("مراجعة السيرفر", created_task.title)

            # Re-confirming SAME token must NOT create a 2nd task
            dup_res = self.client.post(
                "/api/v1/ai/agent/chat",
                headers=self.headers_a,
                json={
                    "message": "تأكيد التنفيذ",
                    "confirmation_token": ask["pending_confirmation"]["confirmation_token"],
                    "confirm_decision": "confirm",
                },
            )
            self.assertEqual(dup_res.status_code, 200)
            dup_body = dup_res.json()["data"]
            self.assertTrue(dup_body["duplicate"])
            self.assertEqual(dup_body["result_card"]["task_id"], card["task_id"])

            matching_tasks = self.db.query(Task).filter(Task.title.contains("مراجعة السيرفر")).count()
            self.assertEqual(matching_tasks, 1)

    def test_02_ambiguous_employee_resolution(self):
        emp_a1 = Employee(company_id=self.company_a.id, employee_number="EMP-201", full_name="أحمد المنصور", job_title="فني شبكات", employment_status="Active")
        emp_a2 = Employee(company_id=self.company_a.id, employee_number="EMP-202", full_name="أحمد السالم", job_title="فني أنظمة", employment_status="Active")
        self.db.add_all([emp_a1, emp_a2])
        self.db.commit()

        res = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أنشئ مهمة لأحمد لترقية النسخ الاحتياطي غدًا"},
        )
        self.assertEqual(res.status_code, 200, res.text)
        data = res.json()["data"]
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(len(data["clarification_options"]), 2)
        self.assertEqual(self.db.query(Task).filter(Task.title.contains("النسخ الاحتياطي")).count(), 0)

        # Resolve with chosen employee_id cleanly -> moves to confirmation before DB write
        res2 = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={
                "message": "أحمد المنصور",
                "resolved_employee_id": str(emp_a1.id),
                "pending_intent": data["pending_intent"],
            },
        )
        self.assertEqual(res2.status_code, 200, res2.text)
        ask2 = res2.json()["data"]
        self.assertEqual(ask2["status"], "needs_confirmation")
        self.assertEqual(self.db.query(Task).filter(Task.title.contains("النسخ الاحتياطي")).count(), 0)

        data2 = self._confirm_turn(ask2)
        self.assertIn(data2["status"], {"executed", "partial_failure"})
        self.assertEqual(data2["result_card"]["assignee_name"], "أحمد المنصور")
        self.assertEqual(self.db.query(Task).filter(Task.title.contains("النسخ الاحتياطي")).count(), 1)

    def test_03_rbac_enforcement_and_company_isolation(self):
        # Plain Employee must NOT assign tasks or notify coworkers
        self.current_user = self.plain_emp_user
        res_task = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أنشئ مهمة لمحمد لفحص الخادم اليوم"},
        )
        self.assertEqual(res_task.status_code, 200)
        self.assertEqual(res_task.json()["data"]["status"], "denied")

        res_notif = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أرسل إشعارًا لمحمد بضرورة مراجعة التذكرة رقم 125."},
        )
        self.assertEqual(res_notif.json()["data"]["status"], "denied")

        # Cross-company access attempt rejected at API scope boundary
        res_cross = self.client.post(
            "/api/v1/ai/agent/chat",
            headers={"X-Company-ID": str(self.company_b.id)},
            json={"message": "اعرض الملخص التشغيلي الحالي"},
        )
        self.assertEqual(res_cross.status_code, 403)

    def test_04_partial_failure_handling_and_unlinked_employee(self):
        # Case A: Telegram API fails on linked employee -> task MUST still succeed with partial_failure warning
        with patch("app.services.telegram_service.urllib.request.urlopen", side_effect=RuntimeError("Telegram Timeout")):
            res = self.client.post(
                "/api/v1/ai/agent/chat",
                headers=self.headers_a,
                json={"message": "أنشئ مهمة لمحمد لفحص طوارئ السيرفر اليوم وأرسل له إشعارًا."},
            )
            self.assertEqual(res.status_code, 200, res.text)
            body = self._confirm_turn(res.json()["data"])
            self.assertEqual(body["status"], "partial_failure")
            self.assertIn(body["result_card"]["telegram_status"], {"Failed", "Pending"})
            self.assertIn("RuntimeError", body["result_card"]["telegram_error"] or "")
            self.assertIsNotNone(self.db.query(Task).filter(Task.id == uuid.UUID(body["result_card"]["task_id"])).first())

        # Case B: Unlinked employee ("فيصل الدوسري") -> task created, Telegram Skipped (Unlinked), partial_failure reported honestly
        res_unlinked = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أنشئ مهمة لفيصل لمراجعة المولدات اليوم وأرسل له إشعارًا."},
        )
        self.assertEqual(res_unlinked.status_code, 200)
        body_u = self._confirm_turn(res_unlinked.json()["data"])
        self.assertEqual(body_u["status"], "partial_failure")
        self.assertEqual(body_u["result_card"]["telegram_status"], "Skipped (Unlinked)")

    def test_05_direct_notification_ticket_conversion_status_and_confirmation(self):
        # 1. Direct notification referencing Ticket 125 requires confirmation before sending
        with patch("app.services.telegram_service.urllib.request.urlopen") as mock_tg:
            mock_tg.return_value = _FakeUrllibResponse({"ok": True, "result": {"message_id": 502}})
            res_n = self.client.post(
                "/api/v1/ai/agent/chat",
                headers=self.headers_a,
                json={"message": "أرسل إشعارًا لمحمد بضرورة مراجعة التذكرة رقم 125."},
            )
            self.assertEqual(res_n.status_code, 200, res_n.text)
            dn = self._confirm_turn(res_n.json()["data"])
            self.assertEqual(dn["status"], "executed")
            self.assertEqual(dn["result_card"]["ticket_number"], "TCK-2026-0125")
            self.assertEqual(dn["result_card"]["telegram_status"], "Sent")

        # 2. Convert Ticket 125 -> Task requires confirmation before creating
        res_conv = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "حوّل التذكرة رقم 125 إلى مهمة وأسندها لمحمد"},
        )
        self.assertEqual(res_conv.status_code, 200)
        conv_data = self._confirm_turn(res_conv.json()["data"])
        created_ref = conv_data["result_card"]["reference"]

        # 3. High-impact cancellation triggers confirmation guard before executing
        res_cancel_ask = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": f"إلغاء المهمة {created_ref}"},
        )
        self.assertEqual(res_cancel_ask.status_code, 200)
        ask_data = res_cancel_ask.json()["data"]
        self.assertEqual(ask_data["status"], "needs_confirmation")
        conf_token = ask_data["pending_confirmation"]["confirmation_token"]

        # Task must still NOT be Cancelled yet
        tk_obj = self.db.query(Task).filter(Task.id == uuid.UUID(conv_data["result_card"]["task_id"])).first()
        self.assertNotEqual(tk_obj.status, "Cancelled")

        # Confirm cancellation
        res_confirm = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={
                "message": "تأكيد الإلغاء",
                "confirmation_token": conf_token,
                "confirm_decision": "confirm",
            },
        )
        self.assertEqual(res_confirm.status_code, 200)
        self.assertEqual(res_confirm.json()["data"]["status"], "executed")
        self.db.refresh(tk_obj)
        self.assertEqual(tk_obj.status, "Cancelled")

    def test_06_live_gemini_function_calling_loop_and_stream_endpoint(self):
        # Configure live company Gemini config (fake key) and mock 2-hop tool calling + final reply
        self.db.add(IntegrationConfig(
            company_id=self.company_a.id,
            service_name="gemini",
            display_name="Gemini",
            is_enabled=True,
            config_data={"api_key": "AIzaSyFakeTestKeyForGeminiUnitTest123456", "model": "gemini-2.0-flash"},
            status="Connected",
        ))
        self.db.commit()

        # Verify /capabilities never exposes plaintext api_key
        caps = self.client.get("/api/v1/ai/agent/capabilities", headers=self.headers_a).json()["data"]
        self.assertTrue(caps["gemini_live_configured"])
        self.assertNotIn("api_key", caps)

        call_seq = iter([
            _FakeUrllibResponse({
                "candidates": [{"content": {"parts": [{"functionCall": {"name": "resolve_employee", "args": {"name": "محمد"}}}]}}]
            }),
            _FakeUrllibResponse({
                "candidates": [{"content": {"parts": [{"functionCall": {"name": "query_operations", "args": {"query_type": "overdue_tasks", "filter_mode": "team"}}}]}}]
            }),
            _FakeUrllibResponse({
                "candidates": [{"content": {"parts": [{"text": "توجد مهمة متأخرة واحدة خاصة بفريقك حالياً وهي فحص جدار الحماية."}]}}]
            }),
        ])

        with patch("app.services.ai_agent_service.urllib.request.urlopen", side_effect=lambda *a, **k: next(call_seq)):
            stream_res = self.client.post(
                "/api/v1/ai/agent/chat/stream",
                headers=self.headers_a,
                json={"message": "اعرض المهام المتأخرة الخاصة بفريقي."},
            )
            self.assertEqual(stream_res.status_code, 200)
            events = [json.loads(line) for line in stream_res.text.strip().splitlines() if line.strip()]
            self.assertTrue(any(e["type"] == "progress" for e in events))
            complete_evt = next(e for e in events if e["type"] == "complete")
            self.assertEqual(complete_evt["data"]["status"], "executed")
            self.assertGreaterEqual(complete_evt["data"]["result_card"]["count"], 1)
            self.assertIn("Gemini AI", complete_evt["data"]["engine_source"])

    def test_07_english_ticket_completion_and_summary(self):
        # 1. English create task + notify -> confirmation required before execution
        with patch("app.services.telegram_service.urllib.request.urlopen") as mock_tg:
            mock_tg.return_value = _FakeUrllibResponse({"ok": True, "result": {"message_id": 601}})
            res_en = self.client.post(
                "/api/v1/ai/agent/chat",
                headers=self.headers_a,
                json={"message": "Create a task for محمد الحربي to inspect backup server tomorrow and notify him"},
            )
            self.assertEqual(res_en.status_code, 200, res_en.text)
            en_data = self._confirm_turn(res_en.json()["data"])
            self.assertEqual(en_data["status"], "executed")
            en_ref = en_data["result_card"]["reference"]
            self.assertEqual(en_data["result_card"]["title"], "inspect backup server")
            self.assertEqual(en_data["result_card"]["due_date"], (date.today() + timedelta(days=1)).isoformat())

        # 2. Mark task complete via Arabic status update
        res_done = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": f"غيّر حالة المهمة {en_ref} إلى مكتملة"},
        )
        self.assertEqual(res_done.status_code, 200, res_done.text)
        done_data = res_done.json()["data"]
        self.assertEqual(done_data["status"], "executed")
        self.assertEqual(done_data["result_card"]["status"], "Completed")

        # 3. Create urgent ticket with auto-categorization
        res_tk = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "افتح تذكرة عاجلة عن انقطاع اتصال الراوتر في الدور الثاني"},
        )
        self.assertEqual(res_tk.status_code, 200, res_tk.text)
        tk_data = res_tk.json()["data"]
        self.assertEqual(tk_data["status"], "executed")
        self.assertEqual(tk_data["result_card"]["priority"], "Urgent")
        self.assertEqual(tk_data["result_card"]["category"], "Network")

        # 4. Operational summary query
        res_sum = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "اعرض الملخص التشغيلي"},
        )
        self.assertEqual(res_sum.status_code, 200, res_sum.text)
        sum_data = res_sum.json()["data"]
        self.assertEqual(sum_data["status"], "executed")
        self.assertEqual(sum_data["result_card"]["type"], "summary")
        self.assertGreaterEqual(sum_data["result_card"]["open_tickets"], 2)

    def test_08_role_prefix_multitask_followup_memory_and_filtered_listings(self):
        emp_motaz = Employee(
            company_id=self.company_a.id, department_id=self.dept_it.id,
            employee_number="EMP-301", full_name="معتز قاسم", job_title="مهندس أنظمة", employment_status="Active",
        )
        self.db.add(emp_motaz)
        self.db.commit()

        # 1. "الموظف معتز قاسم" must NOT extract "الموظف"
        r_search = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "ابحث عن الموظف معتز قاسم"},
        )
        self.assertEqual(r_search.status_code, 200)
        d_search = r_search.json()["data"]
        self.assertEqual(d_search["status"], "executed")
        self.assertEqual(d_search["result_card"]["type"], "employee_list")
        self.assertEqual(d_search["result_card"]["items"][0]["full_name"], "معتز قاسم")

        r_notify_pref = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أرسل إشعارًا إلى الموظف معتز قاسم بخصوص مراجعة السيرفر"},
        )
        self.assertEqual(r_notify_pref.status_code, 200)
        d_np = r_notify_pref.json()["data"]
        self.assertEqual(d_np["status"], "needs_confirmation")
        self.assertIn("معتز قاسم", d_np["pending_confirmation"]["summary"])

        # 2. Multi-task commands must NOT extract "ة" & require confirmation before DB write
        r_multi = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أنشئ مهام لـ معتز قاسم: مهمة فحص الخادم ومهمة فحص النسخ الاحتياطي"},
        )
        self.assertEqual(r_multi.status_code, 200)
        d_multi_ask = r_multi.json()["data"]
        self.assertEqual(d_multi_ask["status"], "needs_confirmation")
        self.assertNotIn("• ة", d_multi_ask["pending_confirmation"]["summary"])
        d_multi_done = self._confirm_turn(d_multi_ask)
        self.assertEqual(d_multi_done["result_card"]["type"], "task_batch")
        self.assertEqual(d_multi_done["result_card"]["count"], 2)
        titles = [t["title"] for t in d_multi_done["result_card"]["tasks"]]
        self.assertTrue(all(len(t) > 3 and t != "ة" for t in titles), titles)

        # 3. Conversation Memory: missing assignee -> bare typed "الموظف معتز قاسم" -> typed "نعم" executes seamlessly!
        r_m1 = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "أرسل إشعارًا بضرورة مراجعة التذكرة رقم 125"},
        )
        d_m1 = r_m1.json()["data"]
        self.assertEqual(d_m1["status"], "needs_clarification")
        # Must NOT misread "تذكرة" as employee name!
        self.assertNotIn("«تذكرة»", d_m1["reply"])

        r_m2 = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "الموظف معتز قاسم"},
        )
        d_m2 = r_m2.json()["data"]
        self.assertEqual(d_m2["status"], "needs_confirmation", d_m2)
        self.assertIn("معتز قاسم", d_m2["pending_confirmation"]["summary"])

        r_m3 = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "نعم"},
        )
        d_m3 = r_m3.json()["data"]
        self.assertIn(d_m3["status"], {"executed", "partial_failure"})
        self.assertEqual(d_m3["result_card"]["assignee_name"], "معتز قاسم")

        # 4. Accurate filtered task listings + team overdue across Employee & Admin (no 500!)
        t_comp = self.db.query(Task).filter(Task.company_id == self.company_a.id, Task.title.contains("فحص الخادم")).first()
        t_comp.status = "Completed"
        self.db.commit()

        r_comp = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "اعرض المهام المكتملة"},
        )
        d_comp = r_comp.json()["data"]
        self.assertEqual(d_comp["status"], "executed")
        self.assertTrue(all(it["status"] == "Completed" for it in d_comp["result_card"]["items"]))
        self.assertEqual(d_comp["result_card"]["total_count"], 1)

        self.current_user = self.plain_emp_user
        r_ov_emp = self.client.post(
            "/api/v1/ai/agent/chat",
            headers=self.headers_a,
            json={"message": "اعرض المهام المتأخرة الخاصة بفريقي"},
        )
        self.assertEqual(r_ov_emp.status_code, 200)
        self.assertEqual(r_ov_emp.json()["data"]["status"], "executed")


if __name__ == "__main__":
    unittest.main(verbosity=2)
