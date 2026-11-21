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
    r"C:\Users\Acodet\.gemini\antigravity\brain\679861f6-e7cc-414c-80ff-827632c96a59\screenshots\mobile_cards_audit"
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "http://127.0.0.1:3000"

VIEWPORTS = [
    {"name": "320px_iphone_se", "width": 320, "height": 667},
    {"name": "360px_android_std", "width": 360, "height": 800},
    {"name": "390px_iphone_14", "width": 390, "height": 844},
    {"name": "430px_iphone_promax", "width": 430, "height": 932},
]

MODULES = [
    {"path": "/", "name": "dashboard_my_day"},
    {"path": "/tickets", "name": "tickets_mobile_cards"},
    {"path": "/assets", "name": "assets_mobile_cards"},
    {"path": "/employees", "name": "employees_mobile_cards"},
    {"path": "/approvals", "name": "approvals_mobile_cards"},
    {"path": "/subscriptions", "name": "subscriptions_mobile_cards"},
    {"path": "/tasks", "name": "tasks_mobile_view"},
]


def test_mobile_cards():
    print("[Mobile Audit] Starting comprehensive multi-viewport mobile card audit...")
    with sync_playwright() as p:
        browser = p.chromium.launch(
            channel="msedge",
            headless=True,
            args=["--no-sandbox"],
        )

        for vp in VIEWPORTS:
            vp_name = vp["name"]
            w = vp["width"]
            h = vp["height"]
            print(f"\n--- Testing Viewport: {vp_name} ({w}x{h}) ---")

            context = browser.new_context(
                viewport={"width": w, "height": h},
                is_mobile=True,
                has_touch=True,
                locale="ar-SA",
            )
            page = context.new_page()

            # Login
            page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state("networkidle")
            u_el = page.locator("input#login-username, input#username, input[name='username']").first
            if u_el.is_visible():
                u_el.fill("voice_admin_a")
                page.locator("input#login-password, input#password, input[name='password']").first.fill("SecretPass123!")
                page.locator("button[type='submit']").first.click()
                page.wait_for_timeout(2500)

            # Test each module
            for mod in MODULES:
                url = f"{BASE_URL}{mod['path']}"
                mod_name = mod["name"]
                page.goto(url)
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1000)

                # Check horizontal overflow (ensure body does not scroll horizontally)
                overflow = page.evaluate("() => document.documentElement.scrollWidth > window.innerWidth + 5")
                print(f"[{vp_name}] {mod_name}: Horizontal overflow detected: {overflow}")
                assert not overflow, f"Horizontal overflow detected on {mod_name} at width {w}px!"

                # Verify desktop table is NOT visible on mobile for modules with tables
                if mod["path"] in ["/tickets", "/assets", "/employees", "/approvals", "/subscriptions"]:
                    desktop_table = page.locator(".hidden.md\\:block table")
                    if desktop_table.count() > 0:
                        assert not desktop_table.first.is_visible(), f"Desktop table must be hidden on mobile at width {w}px!"

                # Capture screenshot
                shot_path = os.path.join(SCREENSHOT_DIR, f"{vp_name}_{mod_name}.png")
                page.screenshot(path=shot_path, full_page=False)
                print(f"[{vp_name}] ✓ {mod_name} captured -> {shot_path}")

            context.close()

        browser.close()
        print("\n=======================================================")
        print("ALL 4 VIEWPORTS & 7 MODULES VERIFIED ZERO OVERFLOW & PASS!")
        print("=======================================================")


if __name__ == "__main__":
    test_mobile_cards()
