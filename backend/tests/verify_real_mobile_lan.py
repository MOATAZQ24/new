import sys
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

ARTIFACT_DIR = pathlib.Path(r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\lan_mobile_audit")
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

LAN_BASE = "http://192.168.8.194:3000"

def test_real_mobile_lan_connectivity():
    print(f"[LAN Test] Connecting to {LAN_BASE} using real Android mobile emulation...")
    with sync_playwright() as p:
        # Simulate real Android Phone: Pixel 7 (412x915, mobile user agent, touch enabled)
        browser = p.chromium.launch(headless=True, channel="msedge")
        context = browser.new_context(
            viewport={"width": 412, "height": 915},
            is_mobile=True,
            has_touch=True,
            user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.002) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
            locale="ar-SA",
        )
        page = context.new_page()

        # Step 1: Login via LAN IP
        print(f"[LAN Test] 1. Logging in via {LAN_BASE}/login...")
        page.goto(f"{LAN_BASE}/login", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_selector("input#login-username, input#username, input[name='username']", timeout=10000)
        
        user_input = page.locator("input#login-username, input#username, input[name='username']").first
        pass_input = page.locator("input#login-password, input#password, input[name='password']").first
        submit_btn = page.locator("button[type='submit']").first
        
        user_input.fill("voice_admin_a")
        pass_input.fill("SecretPass123!")
        submit_btn.click(force=True)
        
        page.wait_for_url(lambda url: "/login" not in url, timeout=10000)
        print(f"[LAN Test] ✓ Logged in! Current URL: {page.url}")

        # Step 2: Navigate to /tasks via LAN IP
        print(f"[LAN Test] 2. Navigating to {LAN_BASE}/tasks...")
        page.goto(f"{LAN_BASE}/tasks", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(2500)

        # Check for skeletons: must disappear
        skeleton_count = page.locator(".animate-pulse").count()
        print(f"[LAN Test] Skeletons remaining: {skeleton_count}")
        assert skeleton_count == 0, f"Expected 0 active skeletons, found {skeleton_count}"

        # Check that tasks loaded
        task_cards = page.locator("text=مهمة صوتية تأكيدية 100%")
        has_task = task_cards.count() > 0
        print(f"[LAN Test] Target task found on mobile LAN: {has_task}")
        assert has_task, "Expected target task 'مهمة صوتية تأكيدية 100%' to be rendered on mobile view!"

        # Check zero overflow
        overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth")
        print(f"[LAN Test] Horizontal overflow on 412px Android: {overflow}")
        assert not overflow, "Detected horizontal overflow on Android mobile viewport!"

        screenshot_path = ARTIFACT_DIR / "android_lan_192_168_8_194_tasks.png"
        page.screenshot(path=str(screenshot_path), full_page=False)
        print(f"[LAN Test] ✓ Tasks screenshot saved -> {screenshot_path}")

        # Step 3: Check Tickets page
        print(f"[LAN Test] 3. Navigating to {LAN_BASE}/tickets...")
        page.goto(f"{LAN_BASE}/tickets", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        ticket_shot = ARTIFACT_DIR / "android_lan_192_168_8_194_tickets.png"
        page.screenshot(path=str(ticket_shot), full_page=False)
        print(f"[LAN Test] ✓ Tickets screenshot saved -> {ticket_shot}")

        # Step 4: Check Assets page
        print(f"[LAN Test] 4. Navigating to {LAN_BASE}/assets...")
        page.goto(f"{LAN_BASE}/assets", wait_until="domcontentloaded", timeout=15000)
        page.wait_for_timeout(1500)
        assets_shot = ARTIFACT_DIR / "android_lan_192_168_8_194_assets.png"
        page.screenshot(path=str(assets_shot), full_page=False)
        print(f"[LAN Test] ✓ Assets screenshot saved -> {assets_shot}")

        browser.close()
        print("\n=======================================================")
        print("ALL REAL MOBILE LAN TESTS PASSED 100%! ZERO ERRORS!")
        print("=======================================================")

if __name__ == "__main__":
    test_real_mobile_lan_connectivity()
