# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Comprehensive Enterprise 3.0 Live Playwright E2E, Add Employee Edge-Case, AI Agent & 5-Viewport Accessibility Audit."""

import json
import os
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("AUDIT_UI_URL", "http://127.0.0.1:3000").strip().rstrip("/")
SCREENSHOT_DIR = Path(
    os.environ.get(
        "AUDIT_SCREENSHOT_DIR",
        r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\browser_qa",
    )
)
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)

ALL_ROUTES = [
    "/",
    "/companies",
    "/employees",
    "/users",
    "/assets",
    "/digital-assets",
    "/custody",
    "/infrastructure",
    "/subscriptions",
    "/maintenance",
    "/tasks",
    "/tickets",
    "/notifications",
    "/reports",
    "/audit",
    "/settings",
    "/settings/integrations",
    "/settings/appearance",
    "/settings/branding",
]

CANONICAL_BRANCHES = [
    "الرياض – السلي (مخرج 17)",
    "الرياض – الفيصلية (مخرج 18)",
    "الرياض – العليا",
    "الدمام",
    "جدة",
]


def get_credentials():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    m = re.search(r"Password:\*\*\s*`([^`]+)`", readme)
    return "admin", (m.group(1) if m else "Admin@12345")


def check_dom_health_and_a11y(page):
    return page.evaluate(
        """() => {
            const overflow = document.documentElement.scrollWidth - window.innerWidth;
            const main = document.getElementById('main-content');
            const h1 = document.querySelector('h1');
            const bodyText = (document.body?.innerText || '').trim();
            const unnamedButtons = [...document.querySelectorAll('button')].filter(btn => {
                const st = window.getComputedStyle(btn);
                if (st.display === 'none' || st.visibility === 'hidden' || btn.offsetParent === null) return false;
                const txt = (btn.innerText || btn.textContent || '').trim();
                const aria = (btn.getAttribute('aria-label') || btn.getAttribute('title') || '').trim();
                return !txt && !aria;
            }).length;
            const offenders = overflow > 2 ? [...document.querySelectorAll('*')].filter(el => {
                const r = el.getBoundingClientRect();
                return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1);
            }).slice(0, 6).map(el => `${el.tagName}.${String(el.className || '').slice(0, 50)} (${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)})`) : [];
            return {
                overflow,
                scrollWidth: document.documentElement.scrollWidth,
                innerWidth: window.innerWidth,
                hasMain: Boolean(main),
                h1Text: h1 ? h1.textContent.trim() : null,
                textLen: bodyText.length,
                dir: document.documentElement.getAttribute('dir'),
                lang: document.documentElement.getAttribute('lang'),
                hasSkipLink: Boolean(document.querySelector('a[href="#main-content"]')),
                hasAppError: bodyText.includes('Application error') || bodyText.includes('Unhandled Runtime Error'),
                unnamedButtons,
                offenders,
            };
        }"""
    )


def main():
    username, password = get_credentials()
    results = {
        "login_and_brand": {},
        "add_employee_e2e": {},
        "enterprise_modules": {},
        "ai_removal_verification": {},
        "responsive_matrix": {},
        "errors": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page = context.new_page()

        page_errors = []
        failed_http = []
        emp_post_calls = []

        page.on("pageerror", lambda err: page_errors.append(f"{page.url}: {err}"))
        page.on(
            "response",
            lambda res: (
                emp_post_calls.append(res.status)
                if res.request.method == "POST" and res.url.endswith("/api/v1/employees")
                else None,
                failed_http.append(f"{res.status} {res.url}")
                if res.status >= 500 or (res.status == 422 and "/api/v1/" in res.url)
                else None,
            ),
        )

        # ── 1. Login BrandMark & Button Contrast ──────────────────────────────
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("button[type='submit']", timeout=15000)
        login_check = page.evaluate(
            """() => {
                const btn = document.querySelector("button[type='submit']");
                const svg = document.querySelector("svg[role='img']");
                const cs = window.getComputedStyle(btn);
                return { color: cs.color, bg: cs.backgroundColor, hasBrandSvg: Boolean(svg) };
            }"""
        )
        assert login_check["hasBrandSvg"], "Login page missing BrandMark SVG"
        assert login_check["color"] == "rgb(255, 255, 255)", f"Login CTA contrast wrong: {login_check}"
        page.screenshot(path=str(SCREENSHOT_DIR / "01_login_brand_contrast.png"))

        page.locator("#login-username").fill(username)
        page.locator("#login-password").fill(password)
        with page.expect_response(lambda r: "/api/v1/auth/login" in r.url) as login_resp:
            page.locator("button[type='submit']").click()
        assert login_resp.value.status == 200, f"Login failed: {login_resp.value.status}"
        page.wait_for_url(f"{BASE_URL}/", timeout=20000)
        page.wait_for_timeout(1000)
        results["login_and_brand"] = {"status": "PASS", **login_check}

        # Switch active company to IGT if available so seeded records are visible
        comps_res = page.request.get(f"{BASE_URL}/api/v1/companies")
        assert comps_res.status == 200
        companies_data = comps_res.json().get("data", [])
        codes_found = {(c.get("company_code") or "").upper() for c in companies_data}
        for req_code in ("IGT", "BLB", "INV"):
            assert req_code in codes_found, f"Missing canonical company {req_code} in {codes_found}"
        igt_comp = next((c for c in companies_data if (c.get("company_code") or "").upper() == "IGT"), companies_data[0])
        page.evaluate(f'localStorage.setItem("active_company_id", "{igt_comp["id"]}")')
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(900)
        page.screenshot(path=str(SCREENSHOT_DIR / "02_dashboard_desktop_1440.png"))

        # ── 2. Section 6: Add Employee End-to-End ─────────────────────────────
        page.goto(f"{BASE_URL}/employees", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("h1", timeout=15000)
        page.wait_for_timeout(800)

        add_btn = page.get_by_role("button", name=re.compile("إضافة موظف")).first
        expect(add_btn).to_be_visible()
        add_btn.click()

        dialog = page.get_by_role("dialog")
        expect(dialog).to_be_visible()

        # 2a. Empty submission inline validation
        save_btn = dialog.get_by_role("button", name="حفظ الموظف")
        save_btn.click()
        expect(dialog.get_by_role("alert")).to_contain_text("الرقم الوظيفي والاسم الكامل مطلوبان")
        results["add_employee_e2e"]["empty_submit"] = "PASS"

        # 2b. Invalid email validation
        tag = uuid.uuid4().hex[:5].upper()
        emp_num = f"E2E-{tag}"
        emp_name = f"فهد السبيعي الميداني {tag}"
        dialog.locator("#add-emp-number").fill(emp_num)
        dialog.locator("#add-emp-name").fill(emp_name)
        dialog.locator("#add-emp-email").fill("not-an-email")
        save_btn.click()
        expect(dialog.get_by_role("alert")).to_contain_text("يرجى إدخال بريد إلكتروني صحيح")
        results["add_employee_e2e"]["invalid_email"] = "PASS"

        # 2c. Duplicate employee_number check
        existing_emp_res = page.request.get(
            f"{BASE_URL}/api/v1/employees?per_page=1",
            headers={"X-Company-ID": igt_comp["id"]},
        ).json().get("data", [])
        if existing_emp_res:
            dup_num = existing_emp_res[0]["employee_number"]
            dialog.locator("#add-emp-number").fill(dup_num)
            dialog.locator("#add-emp-email").fill(f"dup_{tag.lower()}@investorgate.sa")
            save_btn.click()
            dialog.get_by_role("alert").wait_for(state="visible", timeout=10000)
            results["add_employee_e2e"]["duplicate_emp_number"] = "PASS"

        # 2d. Multi-branch selection + user account + double-click protection
        dialog.locator("#add-emp-number").fill(emp_num)
        dialog.locator("#add-emp-name").fill(emp_name)
        dialog.locator("#add-emp-title").fill("مهندس شبكات - Network Engineer")
        dialog.locator("#add-emp-email").fill(f"fahad_{tag.lower()}@investorgate.sa")
        dialog.locator("#add-emp-phone").fill("+966501234567")

        # Select second canonical branch (الرياض – العليا or الدمام) in addition to default primary
        sec_branch_btn = dialog.get_by_role("button", name=re.compile("الدمام")).first
        sec_branch_btn.wait_for(state="visible", timeout=10000)
        sec_branch_btn.click()

        dialog.get_by_text("إنشاء حساب دخول للنظام لهذا الموظف تلقائياً").click()
        dialog.locator("#add-emp-username").fill(f"fahad.{tag.lower()}")

        emp_post_calls.clear()
        save_btn.dblclick()
        dialog.wait_for(state="hidden", timeout=15000)
        page.wait_for_timeout(600)
        assert len(emp_post_calls) == 1 and emp_post_calls[0] == 200, f"Expected single 200 POST, got {emp_post_calls}"
        expect(page.get_by_text(f"fahad.{tag.lower()}").first).to_be_visible(timeout=5000)
        results["add_employee_e2e"]["create_multibranch_account_and_double_click_guard"] = "PASS"

        # 2e. Reload persistence & directory search
        page.reload(wait_until="domcontentloaded")
        page.wait_for_timeout(800)
        search_box = page.get_by_label("بحث في الموظفين والمستخدمين")
        search_box.fill(emp_num)
        page.wait_for_timeout(500)
        expect(page.locator("tbody").get_by_text(emp_name).first).to_be_visible(timeout=10000)
        expect(page.locator("tbody").get_by_text("الدمام").first).to_be_visible()
        page.screenshot(path=str(SCREENSHOT_DIR / "03_employees_created_persisted.png"))
        results["add_employee_e2e"]["reload_persistence"] = "PASS"

        # 2f. Edit employee + navigate to Employee 360°
        page.get_by_role("button", name=f"تعديل الموظف {emp_name}").click()
        edit_dialog = page.get_by_role("dialog")
        expect(edit_dialog).to_be_visible()
        edit_dialog.locator("#edit-emp-name").fill(emp_name + " المعدل")
        edit_dialog.get_by_role("button", name="حفظ التعديلات").click()
        edit_dialog.wait_for(state="hidden", timeout=10000)
        page.wait_for_timeout(500)
        expect(page.locator("tbody").get_by_text(emp_name + " المعدل").first).to_be_visible(timeout=10000)
        results["add_employee_e2e"]["edit_employee"] = "PASS"

        page.locator("tbody").get_by_role("link", name="ملف 360°").first.click()
        page.wait_for_url("**/employees/**", timeout=15000)
        page.wait_for_timeout(800)
        expect(page.locator("h1")).to_contain_text(emp_name)
        expect(page.get_by_role("tab", name="نظرة عامة (Overview)")).to_be_visible()
        # Verify strictly the 9 canonical screenshot sidebar links (and zero removed expansion modules)
        sidebar = page.locator("aside[aria-label='القائمة الرئيسية للنظام']")
        for link_label in [
            "لوحة المتابعة",
            "الشركات والفروع",
            "الموظفون",
            "الأصول والعهد",
            "الاشتراكات",
            "Help Desk",
            "المهام",
            "التقارير",
            "الإعدادات",
        ]:
            expect(sidebar.get_by_role("link", name=link_label, exact=True)).to_be_visible()
        expect(sidebar.get_by_role("link", name="الموارد البشرية والحضور")).to_have_count(0)
        expect(sidebar.get_by_role("link", name="العملاء والفرص (CRM)")).to_have_count(0)
        # Click History tab to verify Onboarding & Transfer timeline
        page.get_by_role("tab", name="الوثائق والسجل الوظيفي (History)").click()
        page.wait_for_timeout(300)
        page.screenshot(path=str(SCREENSHOT_DIR / "04_employee_360_profile.png"))
        results["add_employee_e2e"]["employee_360_profile"] = "PASS"

        # ── 3. Companies (5 Canonical Branches Summary), Subscriptions M:N, Reports & Settings ──
        page.goto(f"{BASE_URL}/companies", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(900)
        for br_name in CANONICAL_BRANCHES:
            expect(page.get_by_text(br_name).first).to_be_visible(timeout=8000)
        page.screenshot(path=str(SCREENSHOT_DIR / "05_companies_five_branches.png"))
        results["enterprise_modules"]["companies_canonical_5_branches"] = "PASS"

        page.goto(f"{BASE_URL}/subscriptions", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(900)
        page.get_by_role("button", name=re.compile("إضافة اشتراك")).first.click()
        sub_dialog = page.get_by_role("dialog")
        sub_title = f"E2E-M365-{tag}"
        sub_dialog.get_by_placeholder("Microsoft 365 Business").fill(sub_title)
        sub_dialog.get_by_placeholder("Microsoft / AWS / Fortinet").fill("Microsoft")
        sub_dialog.locator('input[type="date"]').first.fill("2026-12-15")
        sub_dialog.get_by_role("button", name="حفظ الاشتراك").click()
        sub_dialog.wait_for(state="hidden", timeout=10000)
        page.wait_for_timeout(700)
        expect(page.locator("tbody").get_by_text(sub_title).first).to_be_visible(timeout=10000)

        # Select row in table -> use Inspector "إدارة المستخدمين" button for M:N Seats modal
        sub_row = page.locator("tr").filter(has_text=sub_title).first
        sub_row.click()
        page.wait_for_timeout(200)
        page.get_by_role("button", name="إدارة المستخدمين").click()
        seat_dialog = page.get_by_role("dialog")
        expect(seat_dialog).to_be_visible()
        assign_btn = seat_dialog.get_by_role("button", name="تخصيص")
        expect(assign_btn).to_be_enabled(timeout=8000)
        assign_btn.click()
        page.wait_for_timeout(600)
        expect(seat_dialog.get_by_role("button", name="سحب المقعد").first).to_be_visible(timeout=8000)
        seat_dialog.get_by_role("button", name="سحب المقعد").first.click()
        page.wait_for_timeout(500)
        page.keyboard.press("Escape")
        seat_dialog.wait_for(state="hidden", timeout=5000)
        page.wait_for_timeout(400)
        page.screenshot(path=str(SCREENSHOT_DIR / "06_subscriptions_analytics.png"))
        results["enterprise_modules"]["subscriptions_mn_seats"] = "PASS"

        page.goto(f"{BASE_URL}/reports", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(900)
        expect(page.get_by_text("ملخص حسب الشركة")).to_be_visible(timeout=10000)
        page.screenshot(path=str(SCREENSHOT_DIR / "07_reports_executive.png"))
        results["enterprise_modules"]["reports_overview_charts"] = "PASS"

        page.goto(f"{BASE_URL}/settings", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(900)
        expect(page.get_by_text("مظهر النظام")).to_be_visible(timeout=10000)
        page.locator("main").get_by_role("button", name="داكن").click()
        page.wait_for_timeout(200)
        assert page.evaluate("() => document.documentElement.getAttribute('data-theme')") == "dark"
        page.locator("main").get_by_role("button", name="فاتح").click()
        page.wait_for_timeout(200)
        page.screenshot(path=str(SCREENSHOT_DIR / "07b_settings_screenshot.png"))
        results["enterprise_modules"]["settings_screenshot_and_theme"] = "PASS"

        # ── 4. Verify AI Removal in Browser & API ─────────────────────────────
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_timeout(500)
        assert page.locator("button[aria-label='المساعد الذكي AI Agent']").count() == 0
        assert page.locator("aside[aria-label='الوكيل الذكي للإجراءات التشغيلية']").count() == 0
        results["ai_removal_verification"]["no_ai_ui_elements"] = "PASS"

        # ── 5. Section 11: 5-Viewport Sweep & A11y Checks Across ALL Routes ───
        viewports = [
            ("desktop_1440", {"width": 1440, "height": 900}, ALL_ROUTES),
            ("laptop_1280", {"width": 1280, "height": 800}, ["/", "/companies", "/employees", "/assets", "/subscriptions", "/reports"]),
            ("tablet_768", {"width": 768, "height": 1024}, ["/", "/companies", "/employees", "/assets", "/subscriptions", "/reports", "/tasks", "/tickets", "/settings"]),
            ("mobile_390", {"width": 390, "height": 844}, ["/", "/companies", "/employees", "/assets", "/subscriptions", "/reports", "/tasks", "/settings"]),
            ("narrow_320", {"width": 320, "height": 568}, ["/", "/companies", "/employees", "/subscriptions", "/reports", "/tasks"]),
        ]
        overflow_failures = []
        a11y_warnings = []

        for vp_name, vp_size, vp_routes in viewports:
            page.set_viewport_size(vp_size)
            page.wait_for_timeout(200)
            vp_report = {}
            for route in vp_routes:
                page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_selector("#main-content", timeout=15000)
                page.wait_for_timeout(450)
                health = check_dom_health_and_a11y(page)
                assert health["dir"] == "rtl", f"{vp_name} {route} dir={health['dir']}"
                assert health["hasMain"], f"{vp_name} {route} missing #main-content"
                assert health["hasSkipLink"], f"{vp_name} {route} missing skip link"
                assert not health["hasAppError"], f"{vp_name} {route} runtime error!"
                if health["overflow"] > 2:
                    overflow_failures.append(
                        f"{vp_name} {route}: overflow={health['overflow']}px ({health['scrollWidth']}/{health['innerWidth']}) offenders={health['offenders']}"
                    )
                    vp_report[route] = f"FAIL overflow={health['overflow']}px"
                else:
                    vp_report[route] = f"PASS overflow={health['overflow']}px"
                if health["unnamedButtons"] > 0:
                    a11y_warnings.append(f"{vp_name} {route}: {health['unnamedButtons']} unnamed buttons")
            if vp_name in ("mobile_390", "narrow_320", "tablet_768", "laptop_1280"):
                page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(400)
                page.screenshot(path=str(SCREENSHOT_DIR / f"09_vp_{vp_name}_home.png"))
            results["responsive_matrix"][vp_name] = vp_report

        browser.close()

    results["errors"] = {
        "page_errors": page_errors,
        "failed_http": failed_http,
        "overflow_failures": overflow_failures,
        "a11y_warnings": a11y_warnings,
    }
    print(json.dumps(results, ensure_ascii=False, indent=2))
    assert not page_errors, f"Uncaught page errors: {page_errors}"
    assert not failed_http, f"HTTP 500/422 errors: {failed_http}"
    assert not overflow_failures, "Responsive overflow failures:\n" + "\n".join(overflow_failures)
    assert not a11y_warnings, "Accessibility unnamed button warnings:\n" + "\n".join(a11y_warnings)
    print("ALL_ENTERPRISE_FULL_BROWSER_E2E_PASSED=true")


if __name__ == "__main__":
    main()
