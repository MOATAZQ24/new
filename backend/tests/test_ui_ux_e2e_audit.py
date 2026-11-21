# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Comprehensive UI/UX E2E, Responsive Layout & Accessibility Audit against live running app."""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("AUDIT_UI_URL", "http://127.0.0.1:3000").rstrip("/")

ROUTES = [
    "/",
    "/tasks",
    "/tickets",
    "/employees",
    "/assets",
    "/custody",
    "/infrastructure",
    "/subscriptions",
    "/maintenance",
    "/notifications",
    "/reports",
    "/audit",
    "/companies",
    "/users",
    "/digital-assets",
    "/settings",
    "/settings/integrations",
    "/settings/appearance",
    "/settings/branding",
]


def get_credentials():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    m = re.search(r"Password:\*\*\s*`([^`]+)`", readme)
    return "admin", (m.group(1) if m else "Admin@12345")


def check_page_health(page):
    return page.evaluate(
        """() => {
            const overflow = document.documentElement.scrollWidth - window.innerWidth;
            const main = document.getElementById('main-content');
            const h1 = document.querySelector('h1');
            const bodyText = (document.body?.innerText || '').trim();
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
                offenders: overflow > 2 ? [...document.querySelectorAll('*')].filter(el => {
                    const r = el.getBoundingClientRect();
                    return r.width > 0 && (r.left < -1 || r.right > window.innerWidth + 1);
                }).slice(0, 6).map(el => `${el.tagName}.${String(el.className || '').slice(0, 60)} (${Math.round(el.getBoundingClientRect().left)}..${Math.round(el.getBoundingClientRect().right)})`) : [],
            };
        }"""
    )


def main():
    username, password = get_credentials()
    results = {"routes": {}, "interactions": {}, "errors": []}

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
        )
        context = browser.new_context(viewport={"width": 1440, "height": 900}, locale="ar-SA")
        page = context.new_page()

        page_errors = []
        failed_500s = []

        page.on("pageerror", lambda err: page_errors.append(f"{page.url}: {err}"))
        page.on(
            "response",
            lambda res: failed_500s.append(f"{res.status} {res.url}")
            if res.status >= 500 or (res.status == 422 and "/api/v1/" in res.url)
            else None,
        )

        # 1. Authenticate
        page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("input", timeout=15000)
        inputs = page.locator("input")
        inputs.nth(0).fill(username)
        inputs.nth(1).fill(password)
        page.locator("button[type='submit']").click()
        page.wait_for_url(f"{BASE_URL}/", timeout=20000)
        page.wait_for_timeout(1200)

        # 2. Shell & Interactive Header Checks
        # 2a. Sidebar collapse toggle
        aside = page.locator("aside[aria-label='القائمة الرئيسية للنظام']")
        assert aside.count() == 1
        initial_collapsed = aside.get_attribute("data-collapsed")
        page.get_by_role("button", name="طي أو توسيع القائمة / Toggle sidebar").click()
        page.wait_for_timeout(250)
        after_collapsed = aside.get_attribute("data-collapsed")
        assert after_collapsed != initial_collapsed, "Sidebar collapse state did not toggle"
        # Toggle back to expanded
        if after_collapsed == "true":
            page.get_by_role("button", name="طي أو توسيع القائمة / Toggle sidebar").click()
            page.wait_for_timeout(250)
        results["interactions"]["sidebar_toggle"] = "PASS"

        # 2b. Live Global Command Search
        search_input = page.get_by_label("بحث في الأصول، التذاكر، الموظفين")
        search_input.click()
        search_input.fill("المهام")
        page.wait_for_timeout(500)
        assert page.get_by_text("نتائج البحث السريع").is_visible(), "Global search popover missing"
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        results["interactions"]["global_command_search"] = "PASS"

        # 2c. Live Notification Bell Popover
        page.get_by_role("button", name="الإشعارات").click()
        page.wait_for_timeout(400)
        assert page.get_by_text("الإشعارات غير المقروءة").is_visible(), "Notification popover missing"
        assert page.get_by_text("عرض مركز الإشعارات بالكامل").is_visible()
        page.keyboard.press("Escape")
        page.wait_for_timeout(150)
        results["interactions"]["notification_bell_popover"] = "PASS"

        # 2d. Theme Toggle (cycle and confirm data-theme changes + restore)
        theme_btn = page.locator("button[aria-label^='تبديل المظهر']")
        seen_themes = set()
        for _ in range(3):
            theme_btn.click()
            page.wait_for_timeout(200)
            seen_themes.add(page.evaluate("() => document.documentElement.getAttribute('data-theme')"))
        assert "dark" in seen_themes, f"Dark theme never activated; saw {seen_themes}"
        while page.evaluate("() => document.documentElement.getAttribute('data-theme')") == "dark":
            theme_btn.click()
            page.wait_for_timeout(200)
        results["interactions"]["theme_toggle"] = f"PASS (themes={sorted(x or 'system' for x in seen_themes)})"

        # 3. Desktop Audit across all 19 routes
        for route in ROUTES:
            page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded", timeout=30000)
            page.wait_for_selector("#main-content", timeout=15000)
            page.wait_for_timeout(700)
            health = check_page_health(page)
            assert health["dir"] == "rtl", f"{route} dir={health['dir']}"
            assert health["hasMain"], f"{route} missing #main-content"
            assert health["hasSkipLink"], f"{route} missing skip-to-content link"
            assert not health["hasAppError"], f"{route} rendered runtime error"
            assert health["overflow"] <= 2, f"{route} desktop overflow={health['overflow']}px ({health['scrollWidth']}/{health['innerWidth']})"
            results["routes"][route] = {
                "desktop": f"PASS (h1={health['h1Text']}, overflow={health['overflow']}px)"
            }

        # 4. Interactive Tasks Workflow Check (KPI filter card + debounced search + clear button)
        page.goto(f"{BASE_URL}/tasks", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("h1", timeout=15000)
        page.wait_for_timeout(800)
        page.get_by_role("button", name="🟢 المكتملة").click()
        page.wait_for_timeout(400)
        task_search = page.get_by_placeholder("بحث في عنوان المهمة أو الوصف...")
        task_search.fill("اختبار")
        page.wait_for_timeout(450)
        page.get_by_role("button", name="مسح البحث").click()
        page.wait_for_timeout(250)
        page.get_by_role("button", name="مسح الفلاتر").click()
        page.wait_for_timeout(300)
        results["interactions"]["tasks_kpi_and_debounced_filter"] = "PASS"

        # 5. Tablet (768x1024) & Mobile (390x844) Responsive Sweep + Mobile Drawer Test
        overflow_failures = []
        mobile_routes = list(ROUTES)

        for label, vp in [("tablet", {"width": 768, "height": 1024}), ("mobile", {"width": 390, "height": 844})]:
            page.set_viewport_size(vp)
            page.wait_for_timeout(250)
            for route in mobile_routes:
                page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded", timeout=30000)
                page.wait_for_selector("#main-content", timeout=15000)
                page.wait_for_timeout(600)
                health = check_page_health(page)
                assert not health["hasAppError"], f"{label} {route} app error"
                if health["overflow"] > 2:
                    overflow_failures.append(f"{label} {route} overflow={health['overflow']}px ({health['scrollWidth']}/{health['innerWidth']}) offenders={health['offenders']}")
                    results["routes"][route][label] = f"FAIL overflow={health['overflow']}px"
                else:
                    results["routes"][route][label] = f"PASS (overflow={health['overflow']}px)"

        # Mobile Drawer open/close test
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(f"{BASE_URL}/", wait_until="domcontentloaded", timeout=30000)
        page.wait_for_selector("button[aria-label='فتح قائمة التنقل']", timeout=15000)
        page.locator("button[aria-label='فتح قائمة التنقل']").click()
        page.wait_for_timeout(250)
        assert aside.get_attribute("data-mobile-open") == "true", "Mobile drawer did not open"
        page.locator("button[aria-label='إغلاق قائمة التنقل']").click()
        page.wait_for_timeout(250)
        assert aside.get_attribute("data-mobile-open") == "false", "Mobile drawer did not close"
        results["interactions"]["mobile_drawer"] = "PASS"

        browser.close()

    results["errors"] = {"page_errors": page_errors, "http_500_or_422": failed_500s, "overflow_failures": overflow_failures}
    print(json.dumps(results, ensure_ascii=False, indent=2))
    assert not overflow_failures, f"Responsive overflow failures:\n" + "\n".join(overflow_failures)
    assert not page_errors, f"Uncaught page errors: {page_errors}"
    assert not failed_500s, f"HTTP 500/422 responses: {failed_500s}"
    print("ALL_UI_UX_E2E_CHECKS_PASSED=true")


if __name__ == "__main__":
    main()
