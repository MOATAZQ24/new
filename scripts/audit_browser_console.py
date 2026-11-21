# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import sys
from pathlib import Path
ROOT = Path(".").resolve()
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))
from playwright.sync_api import sync_playwright

routes = [
    "/", "/login", "/companies", "/employees", "/assets", "/custody", 
    "/tickets", "/tasks", "/subscriptions", "/reports", "/approvals", 
    "/settings", "/audit", "/infrastructure", "/digital-assets", "/maintenance",
    "/notifications", "/about", "/help", "/setup"
]

console_issues = []
page_errors = []

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe", headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    
    page.on("console", lambda msg: console_issues.append({"type": msg.type, "text": msg.text, "url": page.url}) if msg.type in ["error", "warning"] else None)
    page.on("pageerror", lambda err: page_errors.append({"error": str(err), "url": page.url}))
    
    # Login first
    page.goto("http://localhost:3000/login")
    page.fill('input[type="text"]', "admin")
    page.fill('input[type="password"]', "Admin@123456")
    page.click('button[type="submit"]')
    page.wait_for_url("http://localhost:3000/", timeout=15000)
    
    for r in routes:
        url = f"http://localhost:3000{r}"
        try:
            page.goto(url, wait_until="networkidle", timeout=10000)
            page.wait_for_timeout(400)
        except Exception as e:
            console_issues.append({"type": "navigation_error", "text": str(e), "url": url})
            
    browser.close()

print(f"Total Console Issues: {len(console_issues)}")
for idx, item in enumerate(console_issues, 1):
    print(f"#{idx} [{item['type'].upper()}] on {item['url']}: {item['text']}")

print(f"\nTotal Page Errors: {len(page_errors)}")
for idx, pe in enumerate(page_errors, 1):
    print(f"#{idx} [PAGE ERROR] on {pe['url']}: {pe['error']}")
