"""Full P0 Acceptance Verification against the live running application (http://127.0.0.1:3000 & :8000),
real SQLite database (it_ops.db), and real Telegram Bot handler.
"""
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))
sys.path.insert(0, str(ROOT / "backend"))

from playwright.sync_api import sync_playwright, expect
from app.core.database import SessionLocal
from app.models.task import Task
from app.models.user import Employee
from app.models.telegram import TelegramUserLink, NotificationOutbox
from app.services.telegram_service import execute_bot_action, dispatch_outbox_notifications

BASE_URL = os.environ.get("ACCEPTANCE_URL", "http://127.0.0.1:3000").rstrip("/")


def get_credentials():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    m = re.search(r"Password:\*\*\s*`([^`]+)`", readme)
    return "admin", (m.group(1) if m else "Admin@12345")


def main():
    report = {}
    username, password = get_credentials()

    # Inspect OpenAPI schema on running backend first
    db = SessionLocal()
    try:
        # Find the user's real linked employee (or fall back to any verified linked employee in the active company)
        real_link = (
            db.query(TelegramUserLink)
            .filter(TelegramUserLink.is_verified == True, TelegramUserLink.telegram_chat_id == "5451561520")
            .first()
        )
        if not real_link:
            real_link = db.query(TelegramUserLink).filter(TelegramUserLink.is_verified == True).first()
        assert real_link is not None, "No verified TelegramUserLink found in database"
        emp = db.get(Employee, real_link.employee_id)
        assert emp is not None
        company_id = str(emp.company_id)
        tg_user_id = str(real_link.telegram_user_id)
        tg_chat_id = str(real_link.telegram_chat_id)
        emp_name = emp.full_name
        emp_id_str = str(emp.id)
    finally:
        db.close()

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        ctx = browser.new_context(viewport={"width": 1440, "height": 1000})
        page = ctx.new_page()

        console_errors = []
        network_responses = []
        page.on("pageerror", lambda e: console_errors.append(str(e)))
        page.on(
            "response",
            lambda r: network_responses.append((r.request.method, r.url, r.status))
            if "/api/v1/tasks" in r.url
            else None,
        )

        # ── Step 1: Open real Tasks Dashboard in browser with authenticated session ──
        page.goto(BASE_URL + "/login")
        page.locator('input[type="text"]').fill(username)
        page.locator('input[type="password"]').fill(password)
        with page.expect_response(lambda r: "/api/v1/auth/login" in r.url) as login_resp:
            page.locator('button[type="submit"]').click()
        assert login_resp.value.status == 200, f"Login failed: {login_resp.value.status}"
        page.wait_for_url(BASE_URL + "/", timeout=20000)

        # Ensure active_company_id matches the linked employee's company
        page.evaluate(f'localStorage.setItem("active_company_id", "{company_id}")')
        headers = {"X-Company-ID": company_id}

        # Navigate to Tasks Dashboard
        with page.expect_response(lambda r: "/api/v1/tasks/summary" in r.url) as summary_net:
            page.goto(BASE_URL + "/tasks")
        summary_http = summary_net.value
        summary_body = summary_http.json()
        assert summary_http.status == 200, f"/tasks/summary returned {summary_http.status}: {summary_body}"
        assert "total" in summary_body.get("data", {}) and "version" in summary_body.get("data", {})
        initial_summary = summary_body["data"]
        report["step_1_open_tasks_dashboard"] = "PASS"
        report["step_2_tasks_summary_http_200"] = {
            "status": "PASS",
            "http_status": summary_http.status,
            "url": summary_http.url,
            "data": initial_summary,
        }

        # Also verify /api/v1/tasks/assignees and /api/v1/tasks/{valid_uuid} and OpenAPI schema
        openapi = ctx.request.get("http://127.0.0.1:8000/openapi.json").json()
        task_paths = [k for k in openapi.get("paths", {}).keys() if k.startswith("/api/v1/tasks")]
        assignees_resp = ctx.request.get(BASE_URL + "/api/v1/tasks/assignees?search=", headers=headers)
        assert assignees_resp.status == 200, assignees_resp.text()
        report["openapi_and_assignees_check"] = {
            "status": "PASS",
            "task_paths_in_openapi": task_paths,
            "assignees_http_status": assignees_resp.status,
        }

        # ── Step 3: Create a controlled test task and assign it to the linked Telegram employee ──
        tag = uuid.uuid4().hex[:6]
        task_title = f"مهمة قبول نهائية P0-{tag}"
        page.get_by_role("button", name="إضافة مهمة جديدة").click()
        combo = page.get_by_role("combobox", name="الموظف / الفني المسند إليه")
        combo.fill(emp_name.split()[0])
        option = page.locator("[role=option]").filter(has_text=emp_name).first
        expect(option).to_be_visible(timeout=10000)
        option.click()
        expect(combo).to_have_value(emp_name)

        form = page.locator("form").filter(has=combo)
        form.locator('input[type="text"]').first.fill(task_title)
        with page.expect_response(lambda r: r.request.method == "POST" and r.url.endswith("/api/v1/tasks")) as create_net:
            page.get_by_role("button", name="حفظ وإنشاء المهمة").click()
        create_resp = create_net.value
        assert create_resp.status == 200, create_resp.text()
        created_data = create_resp.json()["data"]
        task_id = created_data["id"]

        # Verify task detail by valid UUID
        detail_resp = ctx.request.get(f"{BASE_URL}/api/v1/tasks/{task_id}", headers=headers)
        assert detail_resp.status == 200 and detail_resp.json()["data"]["id"] == task_id

        # Verify visible in Dashboard under New/Active before completion
        expect(page.get_by_text(task_title, exact=True)).to_be_visible(timeout=10000)
        summary_after_create = ctx.request.get(BASE_URL + "/api/v1/tasks/summary", headers=headers).json()["data"]

        # Check Telegram Outbox delivery status
        with SessionLocal() as sdb:
            outbox = (
                sdb.query(NotificationOutbox)
                .filter(NotificationOutbox.idempotency_key == f"task.assigned:{task_id}:{emp_id_str}")
                .first()
            )
            outbox_status = outbox.status if outbox else "NotFound"
            outbox_msg_id = (outbox.payload or {}).get("telegram_api_result", {}).get("message_id") if outbox else None

        report["step_3_create_and_assign_task"] = {
            "status": "PASS",
            "task_id": task_id,
            "title": task_title,
            "assigned_employee": emp_name,
            "outbox_status": outbox_status,
            "telegram_message_id": outbox_msg_id,
            "version_after_create": summary_after_create["version"],
        }

        # ── Step 4 & 5: Complete the task through the Telegram Bot & verify DB status is Completed ──
        bot_res = execute_bot_action(
            db=SessionLocal(),
            telegram_user_id=tg_user_id,
            telegram_chat_id=tg_chat_id,
            action_str=f"act:done:{task_id}",
            ip_address="p0_live_acceptance",
        )
        assert bot_res.get("success") is True, f"Telegram completion failed: {bot_res}"

        with SessionLocal() as sdb:
            db_task = sdb.get(Task, uuid.UUID(task_id))
            assert db_task is not None
            assert db_task.status == "Completed", f"Expected Completed in DB, got {db_task.status}"
            assert db_task.completed_at is not None
            completed_at_iso = db_task.completed_at.isoformat()

        report["step_4_complete_via_telegram_bot"] = {
            "status": "PASS",
            "bot_response_message": bot_res.get("message"),
            "new_status": bot_res.get("new_status"),
        }
        report["step_5_database_status_completed"] = {
            "status": "PASS",
            "db_status": "Completed",
            "completed_at": completed_at_iso,
        }

        # ── Step 6: Confirm Dashboard updates automatically (via 3s summary version polling) ──
        # Wait up to 6 seconds for automatic polling refresh without touching the page
        task_row = page.locator("div.p-5").filter(has_text=task_title).first
        expect(task_row.get_by_text("Completed", exact=True)).to_be_visible(timeout=8000)
        report["step_6_dashboard_auto_updates"] = "PASS"

        # ── Step 7 & 8: Verify Completed search/filters include it and New/Active exclude it ──
        search_input = page.locator('input[placeholder*="عنوان المهمة"]')
        search_input.fill(f"P0-{tag}")
        page.get_by_role("button", name=re.compile(r"المكتملة")).click()
        expect(page.get_by_text(task_title, exact=True)).to_be_visible(timeout=8000)
        report["step_7_appears_in_completed_filter_and_search"] = "PASS"

        # New filter must exclude it
        page.get_by_role("button", name=re.compile(r"بانتظار القبول")).click()
        expect(page.get_by_text(task_title, exact=True)).to_have_count(0, timeout=8000)

        # Active filter must exclude it
        page.get_by_role("button", name=re.compile(r"النشطة")).click()
        expect(page.get_by_text(task_title, exact=True)).to_have_count(0, timeout=8000)
        report["step_8_excluded_from_new_and_active_filters"] = "PASS"

        # ── Step 9 & 10: Reload browser and repeat verification + KPI & version check ──
        page.reload()
        page.wait_for_load_state("networkidle")
        search_input = page.locator('input[placeholder*="عنوان المهمة"]')
        search_input.fill(f"P0-{tag}")
        page.get_by_role("button", name=re.compile(r"المكتملة")).click()
        expect(page.get_by_text(task_title, exact=True)).to_be_visible(timeout=8000)
        task_row_after_reload = page.locator("div.p-5").filter(has_text=task_title).first
        expect(task_row_after_reload.get_by_text("Completed", exact=True)).to_be_visible(timeout=8000)

        summary_after_complete = ctx.request.get(BASE_URL + "/api/v1/tasks/summary", headers=headers).json()["data"]
        assert summary_after_complete["version"] != summary_after_create["version"], "Summary version did not advance!"
        assert summary_after_complete["completed"] == summary_after_create["completed"] + 1
        assert summary_after_complete["new"] == summary_after_create["new"] - 1

        report["step_9_reload_preserves_completed_state"] = "PASS"
        report["step_10_kpi_and_version_sync"] = {
            "status": "PASS",
            "before_complete": {
                "new": summary_after_create["new"],
                "completed": summary_after_create["completed"],
                "version": summary_after_create["version"],
            },
            "after_complete": {
                "new": summary_after_complete["new"],
                "completed": summary_after_complete["completed"],
                "version": summary_after_complete["version"],
            },
        }

        bad_422 = [r for r in network_responses if r[2] == 422]
        assert not bad_422, f"Unexpected 422 responses: {bad_422}"
        assert not console_errors, f"Browser console/page errors: {console_errors}"
        report["step_11_zero_runtime_or_422_errors"] = {
            "status": "PASS",
            "console_errors": console_errors,
            "tasks_api_422_count": len(bad_422),
        }

        browser.close()

    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
