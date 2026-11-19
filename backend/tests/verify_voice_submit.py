import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

def main():
    print("[E2E] Starting browser verification for voice submission...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=[
                "--use-fake-ui-for-media-stream",
                "--use-fake-device-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
                "--no-sandbox",
            ]
        )
        context = browser.new_context(
            permissions=["microphone"],
            viewport={"width": 1280, "height": 900}
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

        # Open Voice Task Modal
        voice_btn = page.locator("button:has-text('تسجيل مهمة صوتية')").first
        voice_btn.click()
        page.wait_for_timeout(1000)

        # Check modal open
        modal_header = page.locator("h3:has-text('تسجيل مهمة صوتية جديدة')").first
        assert modal_header.is_visible(), "Voice Task modal should be open"
        print("[E2E] Voice task modal is open.")

        # Click the microphone button to start recording
        record_btn = page.locator("button[aria-label='بدء تسجيل مهمة صوتية']").first
        record_btn.click()
        print("[E2E] Recording started with fake media stream...")
        page.wait_for_timeout(3000) # Record for 3 seconds

        # Click stop recording
        stop_btn = page.locator("button:has-text('إنهاء التسجيل ومعاينته')").first
        stop_btn.click()
        page.wait_for_timeout(1500)
        print("[E2E] Recording stopped. Preview ready.")

        # Check preview is ready (has 'جاهز للإرسال' or audio player)
        ready_label = page.locator("text='جاهز للإرسال'").first
        print(f"[E2E] Ready label visible: {ready_label.is_visible()}")

        # Type title "مهمة صوتية تأكيدية 100%"
        title_input = page.locator("input[placeholder*='تعليمات فحص السيرفر']").first
        title_input.fill("مهمة صوتية تأكيدية 100%")

        # Take screenshot of the form before submitting
        screenshot_path = "C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/screenshots/voice_tasks/voice_submit_test_ready.png"
        os.makedirs(os.path.dirname(screenshot_path), exist_ok=True)
        page.screenshot(path=screenshot_path)
        print(f"[E2E] Saved screenshot before submit: {screenshot_path}")

        # Click "إرسال المهمة الصوتية"
        submit_btn = page.locator("button[type='submit']:has-text('إرسال المهمة الصوتية')").first
        submit_btn.click()

        # Wait for submission to complete (modal to close)
        page.wait_for_timeout(4000)

        # Check if modal is closed
        assert not modal_header.is_visible(), "Modal should have closed after successful voice task creation"
        print("[E2E] Modal closed successfully after submit!")

        # Take screenshot after submission
        after_path = "C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/screenshots/voice_tasks/voice_submit_test_after.png"
        page.screenshot(path=after_path)
        print(f"[E2E] Saved screenshot after submit: {after_path}")

        # Verify new task is in the list
        created_task = page.locator("text='مهمة صوتية تأكيدية 100%'").first
        assert created_task.is_visible(), "Newly created voice task should appear in the task list"
        print("[E2E] Newly created voice task verified in the list!")

        # Verify voice badge (🎙️ مهمة صوتية)
        voice_badge = page.locator("span:has-text('مهمة صوتية')").first
        assert voice_badge.is_visible(), "Voice badge should be displayed on the voice task"
        print("[E2E] Voice badge displayed correctly!")

        browser.close()
        print("\n==============================================")
        print("ALL E2E SUBMISSION CHECKS PASSED WITH FLYING COLORS!")
        print("==============================================")

if __name__ == "__main__":
    main()
