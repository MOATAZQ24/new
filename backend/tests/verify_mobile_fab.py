import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

def test_mobile_fab():
    print("[E2E] Testing Mobile Floating Action Button and Fast Voice Drawer...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--no-sandbox",
            ]
        )
        # Mobile viewport simulation (iPhone 13 / modern smartphone: 390x844)
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            permissions=["microphone"],
        )
        page = context.new_page()

        # Login
        page.goto("http://127.0.0.1:3000/login")
        page.wait_for_load_state("networkidle")
        username_el = page.locator("input#login-username, input#username, input[name='username']").first
        if username_el.is_visible():
            username_el.fill("voice_admin_a")
            page.locator("input#login-password, input#password, input[name='password']").first.fill("SecretPass123!")
            page.locator("button[type='submit']").first.click()
            page.wait_for_timeout(2500)

        # Go to tasks
        page.goto("http://127.0.0.1:3000/tasks")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # Verify Floating Action Button is visible on mobile
        fab = page.locator("button[aria-label='تسجيل وإسناد مهمة صوتية سريعة']").first
        assert fab.is_visible(), "Floating Action Button should be visible on mobile viewport"
        print("[E2E] Floating Action Button is visible on mobile!")

        # Screenshot on mobile page
        screenshot_dir = Path(r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\voice_tasks")
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        mobile_page_shot = str(screenshot_dir / "mobile_fab_page.png")
        page.screenshot(path=mobile_page_shot)
        print(f"[E2E] Captured mobile view with FAB: {mobile_page_shot}")

        # Click the FAB
        fab.click()
        page.wait_for_timeout(1000)

        # Check modal open
        modal_header = page.locator("h3:has-text('تسجيل مهمة صوتية جديدة')").first
        assert modal_header.is_visible(), "Voice Task modal should open when FAB is clicked"
        print("[E2E] Fast voice modal opened from FAB successfully!")

        mobile_modal_shot = str(screenshot_dir / "mobile_fast_voice_modal.png")
        page.screenshot(path=mobile_modal_shot)
        print(f"[E2E] Captured mobile fast voice modal: {mobile_modal_shot}")

        # Verify the streamlined layout: Voice recorder and Employee picker are immediately accessible
        emp_picker = page.locator("input[placeholder*='ابحث باسم الموظف']").first
        assert emp_picker.is_visible(), "Employee picker should be immediately visible in fast voice modal"
        print("[E2E] Streamlined employee picker verified!")

        # Record 2s
        record_btn = page.locator("button[aria-label='بدء تسجيل مهمة صوتية']").first
        record_btn.click()
        page.wait_for_timeout(2500)

        stop_btn = page.locator("button:has-text('إنهاء التسجيل ومعاينته')").first
        stop_btn.click()
        page.wait_for_timeout(1000)

        # Verify fast submit button is visible
        submit_btn = page.locator("button[type='submit']:has-text('إرسال المهمة الصوتية')").first
        assert submit_btn.is_visible(), "Submit button should be visible"
        print("[E2E] Fast submit button verified!")

        browser.close()
        print("\n==============================================")
        print("MOBILE FAB & FAST VOICE TASK DRAWER VERIFIED 100%!")
        print("==============================================")

if __name__ == "__main__":
    test_mobile_fab()
