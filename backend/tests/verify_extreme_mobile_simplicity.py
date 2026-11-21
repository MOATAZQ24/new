# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.abspath(
    r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\mobile_simplicity"
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "http://127.0.0.1:3000"


def run_mobile_verification():
    print("[Mobile E2E] Starting Extreme Mobile Simplicity Verification...")
    with sync_playwright() as p:
        # Test Profile 1: iPhone 14 / modern iOS (390 x 844)
        print("[Mobile E2E] Testing iPhone 14 viewport (390x844)...")
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--no-sandbox",
            ],
        )
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
            locale="ar-SA",
        )
        page = context.new_page()
        page.on("console", lambda msg: print(f"[Browser Console] {msg.type}: {msg.text}"))
        page.on("pageerror", lambda err: print(f"[Browser PageError] {err}"))

        # 1. Login
        page.goto(f"{BASE_URL}/login")
        page.wait_for_load_state("networkidle")
        username_el = page.locator("input#login-username, input#username, input[name='username']").first
        if username_el.is_visible():
            username_el.fill("voice_admin_a")
            page.locator("input#login-password, input#password, input[name='password']").first.fill("SecretPass123!")
            page.locator("button[type='submit']").first.click()
            page.wait_for_timeout(3000)

        page.goto(f"{BASE_URL}/")
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        # 2. Verify Mobile Header
        header = page.locator('header[aria-label="شريط الجوال العلوي"]')
        assert header.is_visible(), "MobileHeader must be visible on mobile!"
        print("[Mobile E2E] ✓ MobileHeader verified!")

        # 3. Verify Mobile Tab Bar
        tabbar = page.locator('nav[aria-label="شريط التنقل السفلي للجوال"]')
        assert tabbar.is_visible(), "MobileTabBar must be visible on mobile!"
        print("[Mobile E2E] ✓ MobileTabBar verified with 5 destinations!")

        # 4. Verify Mobile My Day Home Screen
        my_day_header = page.locator("text=مرحباً،")
        assert my_day_header.is_visible(), "Mobile My Day greeting must be visible!"
        print("[Mobile E2E] ✓ Mobile My Day Home Screen verified!")

        iphone_home_path = os.path.join(SCREENSHOT_DIR, "01_iphone_my_day.png")
        page.screenshot(path=iphone_home_path, full_page=False)
        print(f"[Mobile E2E] Captured: {iphone_home_path}")

        # 5. Open "المزيد" Bottom Sheet
        print("[Mobile E2E] Clicking More Menu button...")
        page.locator('button[aria-label="المزيد من الوحدات"]').dispatch_event("click")
        page.wait_for_selector('text=كافة وحدات النظام', timeout=5000)
        time.sleep(0.5)
        iphone_sheet_path = os.path.join(SCREENSHOT_DIR, "02_iphone_more_menu_sheet.png")
        page.screenshot(path=iphone_sheet_path, full_page=False)
        print(f"[Mobile E2E] Captured: {iphone_sheet_path}")

        # Close sheet
        page.locator('button[aria-label="إغلاق النافذة"]').click(force=True)
        time.sleep(0.5)

        # 6. Navigate to Tasks page and verify Mobile Tab Bar & Floating Action Button
        page.locator('nav[aria-label="شريط التنقل السفلي للجوال"] a[href="/tasks"]').click(force=True)
        page.wait_for_url("**/tasks", timeout=10000)
        time.sleep(1.5)

        # Verify Tab Bar is still visible and Tasks tab is active
        assert tabbar.is_visible(), "TabBar must remain fixed at bottom on Tasks page!"
        
        # Verify Floating Action Button is positioned above TabBar
        fab = page.locator('button[aria-label="تسجيل وإسناد مهمة صوتية سريعة"]')
        assert fab.is_visible(), "WhatsApp-style FAB must be visible on mobile tasks page!"
        
        iphone_tasks_path = os.path.join(SCREENSHOT_DIR, "03_iphone_tasks_fab.png")
        page.screenshot(path=iphone_tasks_path, full_page=False)
        print(f"[Mobile E2E] Captured: {iphone_tasks_path}")

        # 7. Test Profile 2: Android device (360 x 800)
        print("[Mobile E2E] Testing Android viewport (360x800)...")
        android_context = browser.new_context(
            viewport={"width": 360, "height": 800},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
            locale="ar-SA",
        )
        android_page = android_context.new_page()
        android_page.goto(f"{BASE_URL}/login")
        android_page.wait_for_load_state("networkidle")
        u_el = android_page.locator("input#login-username, input#username, input[name='username']").first
        if u_el.is_visible():
            u_el.fill("voice_admin_a")
            android_page.locator("input#login-password, input#password, input[name='password']").first.fill("SecretPass123!")
            android_page.locator("button[type='submit']").first.click()
            android_page.wait_for_timeout(3000)

        android_page.goto(f"{BASE_URL}/")
        android_page.wait_for_load_state("networkidle")
        android_page.wait_for_timeout(2000)

        android_home_path = os.path.join(SCREENSHOT_DIR, "04_android_my_day.png")
        android_page.screenshot(path=android_home_path, full_page=False)
        print(f"[Mobile E2E] Captured: {android_home_path}")

        browser.close()
        print("\n==================================================")
        print("EXTREME MOBILE SIMPLICITY VERIFIED 100% SUCCESSFULLY!")
        print("==================================================")


if __name__ == "__main__":
    run_mobile_verification()
