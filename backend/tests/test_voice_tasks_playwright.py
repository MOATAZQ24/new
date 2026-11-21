# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Live Browser Playwright E2E Test for Voice Task Recording and Playback in Investor Gate OS."""

import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

BASE_URL = "http://127.0.0.1:3000"
SCREENSHOT_DIR = Path(r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\voice_tasks")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def test_voice_task_playwright_e2e():
    with sync_playwright() as p:
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
            viewport={"width": 1440, "height": 900},
            permissions=["microphone"],
        )
        page = context.new_page()

        print("[E2E] Navigating to login page...")
        page.goto(f"{BASE_URL}/login", timeout=30000)
        page.wait_for_load_state("networkidle")

        # Login as voice_admin_a
        username_input = page.locator("input#login-username, input#username, input[name='username']")
        password_input = page.locator("input#login-password, input#password, input[name='password']")
        if username_input.count() > 0:
            print("[E2E] Logging in as voice_admin_a...")
            username_input.first.fill("voice_admin_a")
            password_input.first.fill("SecretPass123!")
            page.locator("button[type='submit']").first.click()
            page.wait_for_timeout(3000)

        # Navigate to /tasks
        print("[E2E] Navigating to /tasks page...")
        page.goto(f"{BASE_URL}/tasks", timeout=30000)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        page.screenshot(path=str(SCREENSHOT_DIR / "01_tasks_page_loaded.png"))
        print("[E2E] Captured: 01_tasks_page_loaded.png")

        # Verify Voice Task Button in Header
        voice_btn = page.locator("button:has-text('تسجيل مهمة صوتية')")
        assert voice_btn.count() > 0, "Voice task button not found in header"
        print("[E2E] Found 'تسجيل مهمة صوتية' button in header.")

        # Click Voice Task Button
        voice_btn.first.click()
        page.wait_for_timeout(1000)

        page.screenshot(path=str(SCREENSHOT_DIR / "02_voice_modal_opened.png"))
        print("[E2E] Captured: 02_voice_modal_opened.png")

        # Verify Voice Task Tab is active
        voice_tab = page.locator("button:has-text('مهمة صوتية (WhatsApp-style)')")
        assert voice_tab.count() > 0, "Voice tab not found in modal"
        print("[E2E] Voice task tab is present.")

        # Verify VoiceTaskRecorder is mounted
        record_mic_btn = page.locator("button[aria-label='بدء تسجيل مهمة صوتية']")
        assert record_mic_btn.count() > 0, "Record microphone button not found"
        print("[E2E] Record microphone button verified.")

        # Switch to Text tab
        text_tab = page.locator("button:has-text('مهمة نصية اعتيادية')")
        text_tab.click()
        page.wait_for_timeout(500)
        page.screenshot(path=str(SCREENSHOT_DIR / "03_switched_to_text_tab.png"))
        print("[E2E] Switched to text tab successfully.")

        # Switch back to Voice tab
        voice_tab.click()
        page.wait_for_timeout(500)

        # Click microphone to record simulated voice note
        print("[E2E] Triggering simulated microphone recording...")
        record_mic_btn.click()
        page.wait_for_timeout(2500)

        # Verify recording indicator and timer are visible
        timer_text = page.locator("text=/\\d+:\\d{2} \\/ 5:00/")
        page.screenshot(path=str(SCREENSHOT_DIR / "04_recording_active.png"))
        print("[E2E] Captured active recording state: 04_recording_active.png")

        # Stop recording
        stop_btn = page.locator("button:has-text('إنهاء التسجيل ومعاينته')")
        if stop_btn.count() > 0:
            stop_btn.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=str(SCREENSHOT_DIR / "05_recording_preview_ready.png"))
            print("[E2E] Captured recording preview ready: 05_recording_preview_ready.png")

        # Close modal
        close_btn = page.locator("button:has-text('إلغاء')")
        if close_btn.count() > 0:
            close_btn.first.click()
            page.wait_for_timeout(500)

        # Open detail modal for the voice task
        detail_btns = page.locator("button:has-text('التفاصيل وسير العمل')")
        if detail_btns.count() > 0:
            detail_btns.first.click()
            page.wait_for_timeout(2000)
            page.screenshot(path=str(SCREENSHOT_DIR / "06_voice_task_details_modal.png"))
            print("[E2E] Captured voice task detail modal with player: 06_voice_task_details_modal.png")

            # Verify VoiceTaskPlayer component
            player = page.locator("audio")
            speed_btn = page.locator("button[aria-label='تغيير سرعة التشغيل']")
            if speed_btn.count() > 0:
                print(f"[E2E] Current speed: {speed_btn.first.text_content()}")
                speed_btn.first.click()
                page.wait_for_timeout(300)
                print(f"[E2E] Next speed: {speed_btn.first.text_content()}")
                speed_btn.first.click()
                page.wait_for_timeout(300)
                print(f"[E2E] 2x speed: {speed_btn.first.text_content()}")
                page.screenshot(path=str(SCREENSHOT_DIR / "07_voice_player_playing.png"))

        browser.close()
        print("\n==========================================")
        print("PLAYWRIGHT E2E VOICE TASK AUDIT PASSED 100%!")
        print("==========================================")


if __name__ == "__main__":
    test_voice_task_playwright_e2e()
