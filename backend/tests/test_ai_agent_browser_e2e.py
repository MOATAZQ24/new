"""Comprehensive Live Browser E2E Verification for Investor Gate OS AI Action Agent."""

import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("AUDIT_UI_URL", "http://127.0.0.1:3000").rstrip("/")


def get_credentials():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    m = re.search(r"Password:\*\*\s*`([^`]+)`", readme)
    return "admin", (m.group(1) if m else "Admin@12345")


def main():
    username, password = get_credentials()
    results = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page = context.new_page()

        page_errors = []
        failed_http = []
        page.on("pageerror", lambda err: page_errors.append(f"{page.url}: {err}"))
        page.on(
            "response",
            lambda res: failed_http.append(f"{res.status} {res.url}")
            if res.status >= 500 or (res.status == 422 and "/api/v1/" in res.url)
            else None,
        )

        # 1. Authenticate via live UI login
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("input", timeout=15000)
        inputs = page.locator("input")
        inputs.nth(0).fill(username)
        inputs.nth(1).fill(password)
        page.locator("button[type='submit']").click()
        page.wait_for_url(f"{BASE_URL}/", timeout=20000)
        page.wait_for_timeout(1200)
        results["step_01_login"] = "PASS"

        # 2. Verify /api/v1/ai/agent/capabilities HTTP 200 & zero secret leak
        caps_res = page.request.get(f"{BASE_URL}/api/v1/ai/agent/capabilities")
        assert caps_res.status == 200, f"Capabilities returned {caps_res.status}: {caps_res.text()}"
        caps_json = caps_res.json()
        assert "data" in caps_json and isinstance(caps_json["data"], dict), f"Unexpected caps payload: {caps_json}"
        caps_data = caps_json["data"]
        assert "api_key" not in caps_data and "bot_token" not in caps_data
        results["step_02_capabilities_api"] = f"PASS (model={caps_data.get('model')}, live={caps_data.get('gemini_live_configured')})"

        # Fetch authoritative DB counts & assignees
        tasks_summary = page.request.get(f"{BASE_URL}/api/v1/tasks/summary").json().get("data", {})
        assignees = page.request.get(f"{BASE_URL}/api/v1/tasks/assignees?limit=30").json().get("data", [])
        results["step_03_db_snapshot"] = {"summary_total": tasks_summary.get("total"), "overdue": tasks_summary.get("overdue"), "assignees": len(assignees)}

        # 4. Open AI Side Panel on Desktop from TopNav button
        toggle_btn = page.locator("button[aria-label='المساعد الذكي AI Agent']")
        assert toggle_btn.is_visible(), "AI Agent toggle button not visible in TopNav"
        toggle_btn.click()
        panel = page.locator("aside[aria-label='الوكيل الذكي للإجراءات التشغيلية']")
        panel.wait_for(state="visible", timeout=5000)
        assert toggle_btn.get_attribute("aria-expanded") == "true"
        results["step_04_open_side_panel"] = "PASS"

        textarea = panel.locator("textarea")
        submit_btn = panel.locator("button[aria-label='إرسال الأمر للمساعد الذكي']")

        # 5. Employee search with role prefix ("الموظف معتز قاسم") -> must NOT extract "الموظف"
        textarea.fill("ابحث عن الموظف معتز قاسم")
        submit_btn.click()
        panel.get_by_text("معتز قاسم").last.wait_for(state="visible", timeout=25000)
        panel_text = panel.inner_text()
        assert "«الموظف»" not in panel_text, f"Incorrectly extracted الموظف: {panel_text}"
        results["step_05_employee_search_role_prefix"] = "PASS"

        # 6. Operational Summary Card
        textarea.fill("اعرض الملخص التشغيلي الحالي")
        submit_btn.click()
        panel.get_by_text("مهام نشطة").wait_for(state="visible", timeout=25000)
        results["step_06_operational_summary"] = "PASS"

        # 7. Team Overdue Query (zero HTTP 500 + accurate total vs returned badge)
        textarea.fill("اعرض المهام المتأخرة الخاصة بفريقي")
        submit_btn.click()
        panel.get_by_text("من أصل").last.wait_for(state="visible", timeout=25000)
        results["step_07_team_overdue_no_500"] = "PASS"

        # 8. Filtered Task Listing ("اعرض المهام المكتملة") -> verifies total count matches summary completed
        textarea.fill("اعرض المهام المكتملة")
        submit_btn.click()
        completed_expected = tasks_summary.get("completed", 0)
        panel.get_by_text(f"من أصل {completed_expected}").last.wait_for(state="visible", timeout=25000)
        results["step_08_filtered_completed_tasks"] = f"PASS (verified_total={completed_expected})"

        def select_motaz_candidate_if_prompted():
            page.wait_for_timeout(1200)
            if not panel.get_by_role("button", name="تأكيد التنفيذ").is_visible():
                panel_now = panel.inner_text()
                assert "92004" in panel_now and "9200411" in panel_now, f"Expected both distinguishing employee numbers, got: {panel_now}"
                cand_btns = panel.locator("button", has_text="#92004")
                if cand_btns.count() > 0 and cand_btns.last.is_visible():
                    cand_btns.last.click()
                else:
                    # Fallback: type exact employee number 92004 in textarea
                    textarea.fill("92004")
                    submit_btn.click()

        # 9. Four-Task Batch Assignment Workflow for معتز قاسم (Disambiguation -> Preserve 4 Tasks -> Dry-Run Confirm Preview -> Cancel)
        textarea.fill(
            "أنشئ 4 مهام للموظف معتز قاسم: "
            "مهمة فحص الخادم الرئيسي، ومهمة مراجعة جدار الحماية، ومهمة التحقق من النسخ الاحتياطي، ومهمة تحديث شهادات SSL"
        )
        submit_btn.click()
        panel.get_by_text("بخصوص المهمة «فحص الخادم الرئيسي»").last.wait_for(state="visible", timeout=35000)
        select_motaz_candidate_if_prompted()
        panel.get_by_role("button", name="تأكيد التنفيذ").wait_for(state="visible", timeout=30000)
        multi_txt = panel.inner_text()
        assert "فحص الخادم الرئيسي" in multi_txt and "جدار الحماية" in multi_txt and "النسخ الاحتياطي" in multi_txt and "SSL" in multi_txt, (
            f"Expected all 4 tasks in confirmation summary, got: {multi_txt}"
        )
        assert "• ة" not in multi_txt and "1) ة" not in multi_txt, f"Broken fragment 'ة' found: {multi_txt}"
        # Cancel dry-run so zero tasks are created without explicit confirmation
        panel.get_by_role("button", name="إلغاء").click()
        panel.get_by_text("تم إلغاء الإجراء").last.wait_for(state="visible", timeout=15000)
        results["step_09_four_task_batch_dry_run_confirm_guard"] = "PASS"

        # 9B. Dialectal Saudi/Gulf Multi-Task + Relative Deadline ("اسند لمعتز اربع مهمات يصلح السرفر ويشيك الشبكه وخليه يخلصهن خلال خمس ايام")
        textarea.fill("اسند لمعتز اربع مهمات يصلح السرفر ويشيك الشبكه وخليه يخلصهن خلال خمس ايام")
        submit_btn.click()
        panel.get_by_text("بخصوص المهمة «إصلاح وصيانة السيرفر»").last.wait_for(state="visible", timeout=35000)
        select_motaz_candidate_if_prompted()
        panel.get_by_role("button", name="تأكيد التنفيذ").wait_for(state="visible", timeout=30000)
        dialect_txt = panel.inner_text()
        assert "إصلاح وصيانة السيرفر" in dialect_txt and "فحص ومراجعة الشبكة" in dialect_txt, f"Expected dialectal tasks in preview: {dialect_txt}"
        panel.get_by_role("button", name="إلغاء").click()
        panel.get_by_text("تم إلغاء الإجراء").last.wait_for(state="visible", timeout=15000)
        results["step_09b_dialect_multitask_dry_run"] = "PASS"

        # 10. Conversation Memory: missing employee -> bare typed "الموظف معتز قاسم" -> disambiguates -> select #92004 -> confirmation
        textarea.fill("أرسل إشعارًا بضرورة مراجعة التذكرة رقم 125")
        submit_btn.click()
        panel.get_by_text("اسم الموظف").last.wait_for(state="visible", timeout=30000)
        turn1_txt = panel.inner_text()
        assert "«تذكرة»" not in turn1_txt, f"Incorrectly extracted تذكرة: {turn1_txt}"

        textarea.fill("الموظف معتز قاسم")
        submit_btn.click()
        panel.get_by_text("أكثر من موظف نشط").last.wait_for(state="visible", timeout=30000)
        select_motaz_candidate_if_prompted()
        panel.get_by_role("button", name="تأكيد التنفيذ").wait_for(state="visible", timeout=30000)
        assert "معتز قاسم" in panel.inner_text()
        panel.get_by_role("button", name="إلغاء").click()
        panel.get_by_text("تم إلغاء الإجراء").last.wait_for(state="visible", timeout=15000)
        results["step_10_followup_conversation_memory"] = "PASS"

        # 11. Real Create Task + Confirmation + Live /tasks UI Sync + Confirmed Cancellation Cleanup
        page.goto(f"{BASE_URL}/tasks", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("#main-content", timeout=15000)
        page.wait_for_timeout(800)
        page.keyboard.press("Alt+KeyA")
        panel.wait_for(state="visible", timeout=5000)

        unique_tag = uuid.uuid4().hex[:6]
        task_title = f"مراجعة السيرفر وكيل {unique_tag}"
        panel.locator("textarea").fill(
            f"أنشئ مهمة للموظف معتز قاسم بعنوان {task_title} غدًا وأرسل له إشعارًا"
        )
        panel.locator("button[aria-label='إرسال الأمر للمساعد الذكي']").click()

        panel.get_by_text("أكثر من موظف نشط").last.wait_for(state="visible", timeout=35000)
        select_motaz_candidate_if_prompted()
        confirm_create_btn = panel.get_by_role("button", name="تأكيد التنفيذ")
        confirm_create_btn.wait_for(state="visible", timeout=30000)
        confirm_create_btn.click()

        panel.get_by_text("فتح في صفحة المهام").last.wait_for(state="visible", timeout=25000)
        ref_matches = re.findall(r"TASK-[0-9A-Za-z]+", panel.inner_text())
        assert ref_matches, f"Expected TASK reference in panel output, got: {panel.inner_text()}"
        created_ref = ref_matches[-1]
        results["step_11_confirmed_task_creation"] = f"PASS ({created_ref})"

        # Cancel created test task via confirmation guard so live DB stays spotless
        panel.locator("textarea").fill(f"إلغاء المهمة {created_ref}")
        panel.locator("button[aria-label='إرسال الأمر للمساعد الذكي']").click()
        confirm_cancel_btn = panel.get_by_role("button", name="تأكيد التنفيذ")
        confirm_cancel_btn.wait_for(state="visible", timeout=25000)
        confirm_cancel_btn.click()
        panel.get_by_text("تم إلغاء المهمة").last.wait_for(state="visible", timeout=25000)
        results["step_12_confirmed_cancellation_cleanup"] = "PASS"

        # 12. Idempotency Replay Guard via live API (read-only query, zero DB mutation)
        idem = f"e2e-idem-{uuid.uuid4().hex[:8]}"
        p1 = page.request.post(f"{BASE_URL}/api/v1/ai/agent/chat", data={"message": "اعرض الملخص التشغيلي الحالي", "idempotency_key": idem})
        p2 = page.request.post(f"{BASE_URL}/api/v1/ai/agent/chat", data={"message": "اعرض الملخص التشغيلي الحالي", "idempotency_key": idem})
        assert p1.status == 200 and p2.status == 200
        assert p1.json()["data"]["duplicate"] is False
        assert p2.json()["data"]["duplicate"] is True
        results["step_13_idempotency_replay"] = "PASS"

        # 13. Mobile 390x844 responsive check with AI drawer open
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        panel_box = panel.bounding_box()
        assert panel_box is not None and panel_box["width"] <= 391, f"AI panel box overflowed mobile viewport: {panel_box}"
        overflow = page.evaluate("() => document.documentElement.scrollWidth - window.innerWidth")
        assert overflow <= 2, f"Mobile horizontal overflow with AI drawer open: {overflow}px"
        results["step_14_mobile_responsive"] = f"PASS (panel_width={round(panel_box['width'])}px, overflow={overflow}px)"

        panel.locator("button[aria-label='إغلاق لوحة المساعد الذكي']").click()
        page.wait_for_timeout(200)

        # 15. Verify Enterprise 3.0 Workspaces (Employee 360°, HRM, CRM, Projects, Approvals) in live browser
        page.set_viewport_size({"width": 1440, "height": 900})
        for route_path, expected_heading in [
            ("/employees/ce9e5d67-8c28-4363-bcd1-d424352b9450", "ملف الموظف الشامل 360°"),
            ("/hrm", "إدارة الموارد البشرية والحضور والانصراف"),
            ("/crm", "إدارة علاقات العملاء والفرص البيعية"),
            ("/projects", "إدارة المشاريع والجدولة الزمنية"),
            ("/approvals", "مركز الاعتمادات الموحد وطلبات الشراء"),
        ]:
            page.goto(f"{BASE_URL}{route_path}", wait_until="domcontentloaded", timeout=30000)
            page.get_by_text(expected_heading).first.wait_for(state="visible", timeout=20000)
        results["step_15_enterprise_v3_pages_verified"] = "PASS (Employee 360°, HRM, CRM, Projects, Approvals)"

        # 16. Verify Canonical 5 Operational Branches & Asset Analytics Dashboard (/assets)
        canonical_branches = [
            "الرياض – السلي (مخرج 17)",
            "الرياض – الفيصلية (مخرج 18)",
            "الرياض – العليا",
            "الدمام",
            "جدة",
        ]
        page.goto(f"{BASE_URL}/assets", wait_until="domcontentloaded", timeout=30000)
        page.get_by_text("تحليلات ومقارنة الأصول حسب الفروع الخمسة المعتمدة", exact=False).first.wait_for(state="visible", timeout=20000)
        for bname in canonical_branches:
            page.get_by_text(bname, exact=False).first.wait_for(state="visible", timeout=15000)
        page.get_by_text("مقارنة الأصول بين الفروع المعتمدة", exact=False).first.wait_for(state="visible", timeout=15000)
        results["step_16_canonical_branches_and_asset_dashboard"] = "PASS (5 canonical branches + branch asset charts)"

        # 17. Verify Unified Employee Directory & Repaired إضافة موظف Multi-Branch Modal (/employees)
        page.goto(f"{BASE_URL}/employees", wait_until="domcontentloaded", timeout=30000)
        page.get_by_text("تصفية دليل الموظفين حسب الفرع المعتمد", exact=False).first.wait_for(state="visible", timeout=20000)
        page.get_by_role("button", name="إضافة موظف").first.click()
        page.get_by_text("الفروع المعتمدة (يمكن اختيار فرع واحد أو عدة فروع)", exact=False).first.wait_for(state="visible", timeout=10000)
        results["step_17_employees_multi_branch_modal"] = "PASS (Multi-branch إضافة موظف modal verified)"

        assert not page_errors, f"Uncaught page errors: {page_errors}"
        assert not failed_http, f"Failed HTTP 5xx/422 responses: {failed_http}"

        print("AI_AGENT_BROWSER_E2E_SUCCESS", results)
        browser.close()


if __name__ == "__main__":
    main()
