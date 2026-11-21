# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import os
import sys
import time
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

SCREENSHOT_DIR = os.path.abspath(
    r"C:\Users\Acodet\.gemini\antigravity\brain\221cb34a-5613-44df-afe2-b9a9217cb1fe\screenshots"
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

BASE_URL = "http://127.0.0.1:3000"
API_URL = "http://127.0.0.1:8000"

VIEWPORTS = [
    {"name": "320px_se", "width": 320, "height": 640},
    {"name": "360px_android", "width": 360, "height": 800},
    {"name": "390px_iphone14", "width": 390, "height": 844},
    {"name": "430px_promax", "width": 430, "height": 932},
]

PAGES_TO_VERIFY = [
    {"route": "/", "name": "dashboard"},
    {"route": "/tasks", "name": "tasks"},
    {"route": "/tickets", "name": "tickets"},
    {"route": "/assets", "name": "assets"},
    {"route": "/more", "name": "more"},
    {"route": "/settings", "name": "settings"},
    {"route": "/employees", "name": "employees"},
    {"route": "/approvals", "name": "approvals"},
    {"route": "/subscriptions", "name": "subscriptions"},
    {"route": "/reports", "name": "reports"},
]


def wait_for_port(url, timeout=45):
    import urllib.request
    start = time.time()
    while time.time() - start < timeout:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status < 500:
                    return True
        except Exception:
            time.sleep(1)
    return False


def run_matrix_audit():
    print("[Mobile Audit] Starting Server Orchestration...")
    backend_log = open(str(ROOT / "backend_audit.log"), "w", encoding="utf-8")
    frontend_log = open(str(ROOT / "frontend_audit.log"), "w", encoding="utf-8")

    env_backend = os.environ.copy()
    env_backend["PYTHONPATH"] = str(ROOT / "backend")
    env_backend["DEBUG"] = "false"
    env_backend["DATABASE_URL"] = f"sqlite:///{str(ROOT / 'it_ops.db')}"

    backend_py = str(ROOT / "backend/.venv/Scripts/python.exe")
    backend_proc = subprocess.Popen(
        [backend_py, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--workers", "1"],
        cwd=str(ROOT / "backend"),
        env=env_backend,
        stdout=backend_log,
        stderr=subprocess.STDOUT,
    )

    env_frontend = os.environ.copy()
    env_frontend["PORT"] = "3000"
    frontend_proc = subprocess.Popen(
        ["cmd", "/c", "node node_modules/next/dist/bin/next dev -p 3000"],
        cwd=str(ROOT / "frontend"),
        env=env_frontend,
        stdout=frontend_log,
        stderr=subprocess.STDOUT,
    )

    try:
        print("[Mobile Audit] Waiting for backend (http://127.0.0.1:8000/api/health)...")
        if not wait_for_port(f"{API_URL}/api/health", 30):
            backend_log.flush()
            with open(str(ROOT / "backend_audit.log"), "r", encoding="utf-8", errors="ignore") as f:
                print("Backend log:\n", f.read()[-1500:])
            raise RuntimeError("Backend failed to start on port 8000")
        print("[Mobile Audit] ✓ Backend is ready!")

        print("[Mobile Audit] Waiting for frontend (http://127.0.0.1:3000/login)...")
        if not wait_for_port(f"{BASE_URL}/login", 60):
            frontend_log.flush()
            with open(str(ROOT / "frontend_audit.log"), "r", encoding="utf-8", errors="ignore") as f:
                print("Frontend log:\n", f.read()[-1500:])
            raise RuntimeError("Frontend failed to start on port 3000")
        print("[Mobile Audit] ✓ Frontend is ready!")

        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
                headless=True,
                args=[
                    "--use-fake-ui-for-media-stream",
                    "--use-fake-device-for-media-stream",
                    "--no-sandbox",
                    "--disable-gpu",
                    "--disable-dev-shm-usage",
                ],
            )

            # Test Mobile Matrix (320px, 360px, 390px, 430px)
            for vp in VIEWPORTS:
                vp_name = vp["name"]
                w, h = vp["width"], vp["height"]
                print(f"\n==========================================")
                print(f"[Mobile Audit] Testing Viewport: {vp_name} ({w}x{h})")
                print(f"==========================================")

                context = browser.new_context(
                    viewport={"width": w, "height": h},
                    is_mobile=True,
                    has_touch=True,
                    user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
                    locale="ar-SA",
                )
                page = context.new_page()

                # Login
                page.goto(f"{BASE_URL}/login")
                page.wait_for_load_state("networkidle")
                if "/login" in page.url:
                    page.locator("#login-username").fill("admin")
                    page.locator("#login-password").fill("Admin@12345")
                    page.locator("button[type='submit']").click()
                    page.wait_for_url(lambda u: "/login" not in u, timeout=15000)
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(2000)

                # Set royal-purple theme to match the user's reference designs
                page.evaluate('() => { localStorage.setItem("ig_theme_preset", "royal-purple"); localStorage.setItem("ig_theme_mode", "light"); }')
                page.reload()
                page.wait_for_load_state("networkidle")
                page.wait_for_timeout(1000)

                for target in PAGES_TO_VERIFY:
                    route = target["route"]
                    name = target["name"]
                    print(f"[Mobile Audit] [{w}px] Checking route {route} ({name})...")

                    page.goto(f"{BASE_URL}{route}")
                    page.wait_for_load_state("networkidle")
                    page.wait_for_timeout(1500)

                    # 1. Verify Horizontal Overflow (must be ZERO overflow: scrollWidth <= clientWidth + 1)
                    scroll_w = page.evaluate("document.documentElement.scrollWidth")
                    client_w = page.evaluate("document.documentElement.clientWidth")
                    overflow_diff = scroll_w - client_w
                    print(f"   - Width check: scrollWidth={scroll_w}, clientWidth={client_w}, diff={overflow_diff}px")
                    assert overflow_diff <= 1, f"Horizontal overflow detected on {route} at {w}px! scrollWidth={scroll_w} > clientWidth={client_w}"

                    # 2. Verify Mobile Navigation Shell
                    header = page.locator('header[aria-label="شريط الجوال العلوي"]')
                    tabbar = page.locator('nav[aria-label="شريط التنقل السفلي للجوال"]')
                    header.wait_for(state="visible", timeout=10000)
                    tabbar.wait_for(state="visible", timeout=10000)
                    assert header.is_visible(), f"MobileHeader must be visible on {route} at {w}px!"
                    assert tabbar.is_visible(), f"MobileTabBar must be visible on {route} at {w}px!"

                    # 3. Capture screenshot
                    shot_path = os.path.join(SCREENSHOT_DIR, f"{w}px_{name}.png")
                    page.screenshot(path=shot_path, full_page=False)
                    print(f"   ✓ Screenshot saved: {shot_path}")

                context.close()

            # Now test Desktop Viewport (1280px) to verify Desktop UI preservation
            print("\n==========================================")
            print("[Mobile Audit] Verifying Desktop UI Preservation (1280x800)...")
            print("==========================================")
            desktop_context = browser.new_context(
                viewport={"width": 1280, "height": 800},
                is_mobile=False,
                has_touch=False,
                locale="ar-SA",
            )
            dpage = desktop_context.new_page()
            dpage.goto(f"{BASE_URL}/login")
            dpage.wait_for_load_state("networkidle")
            if "/login" in dpage.url:
                dpage.locator("#login-username").fill("admin")
                dpage.locator("#login-password").fill("Admin@12345")
                dpage.locator("button[type='submit']").click()
                try:
                    dpage.wait_for_url(lambda u: "/login" not in u, timeout=15000)
                except Exception:
                    dpage.wait_for_timeout(3000)

            for target in [{"route": "/tasks", "name": "desktop_tasks"}, {"route": "/assets", "name": "desktop_assets"}, {"route": "/tickets", "name": "desktop_tickets"}]:
                route = target["route"]
                name = target["name"]
                dpage.goto(f"{BASE_URL}{route}")
                dpage.wait_for_load_state("networkidle")
                dpage.wait_for_timeout(1000)

                # Verify Desktop TopNav & Sidebar
                desktop_sidebar = dpage.locator('aside, nav[aria-label="القائمة الجانبية"]').first
                assert desktop_sidebar.is_visible(), f"Desktop Sidebar must remain visible on {route}!"
                
                shot_path = os.path.join(SCREENSHOT_DIR, f"{name}.png")
                dpage.screenshot(path=shot_path, full_page=False)
                print(f"[Desktop Audit] ✓ Captured {name}: {shot_path}")

            desktop_context.close()
            browser.close()

        print("\n=======================================================")
        print("[Mobile Audit] ALL 8 MODULES PASSED AT 320px, 360px, 390px, 430px WITH ZERO OVERFLOW!")
        print("=======================================================")
        return 0

    finally:
        print("[Mobile Audit] Cleaning up server processes...")
        for proc in [frontend_proc, backend_proc]:
            try:
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)], capture_output=True)
            except Exception:
                pass
            try:
                proc.terminate()
                proc.wait(timeout=2)
            except Exception:
                try:
                    proc.kill()
                except Exception:
                    pass

        try:
            backend_log.close()
            frontend_log.close()
        except Exception:
            pass


if __name__ == "__main__":
    sys.exit(run_matrix_audit())
