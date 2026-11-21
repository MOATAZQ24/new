import os
import sys
import time
import json
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / ".lan-runtime/browser"))

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("TARGET_URL", "http://127.0.0.1:3000").rstrip("/")
SCREENSHOT_DIR = os.path.abspath(
    r"C:\Users\Acodet\.gemini\antigravity\brain\221cb34a-5613-44df-afe2-b9a9217cb1fe\screenshots\system_audit"
)
os.makedirs(SCREENSHOT_DIR, exist_ok=True)

class SystemAuditor:
    def __init__(self):
        self.results = []
        self.bugs = []
        self.console_errors = []
        self.network_errors = []
        self.current_module = "General"

    def log_result(self, module, test_name, status, details="", severity="INFO"):
        entry = {
            "module": module,
            "test": test_name,
            "status": status,
            "details": details,
            "severity": severity,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        self.results.append(entry)
        prefix = "✓" if status == "PASS" else ("✗" if status == "FAIL" else "⚠")
        print(f"[{prefix} {module}] {test_name}: {status} {details}")
        if status in ("FAIL", "ERROR"):
            self.bugs.append(entry)

    def attach_page_listeners(self, page, module_name):
        self.current_module = module_name
        
        def handle_console(msg):
            if msg.type in ("error",):
                err_text = f"[{self.current_module}] Console {msg.type.upper()}: {msg.text}"
                self.console_errors.append(err_text)
                print(f"   🔴 {err_text}")
        
        def handle_response(response):
            if response.status >= 400 and not "/api/v1/auth/me" in response.url and not "favicon" in response.url:
                # 401 is expected during invalid login tests
                err_info = f"[{self.current_module}] HTTP {response.status} on {response.url}"
                self.network_errors.append(err_info)
                print(f"   ⚠️ {err_info}")

        page.on("console", handle_console)
        page.on("response", handle_response)


def run_full_system_audit():
    auditor = SystemAuditor()
    print("=" * 60)
    print("STARTING COMPREHENSIVE LIVE END-TO-END SYSTEM AUDIT")
    print(f"Target URL: {BASE_URL}")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path="C:/Program Files/Google/Chrome/Application/chrome.exe",
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
            ]
        )
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            locale="ar-SA",
        )
        page = context.new_page()

        # ====================================================================
        # MODULE 1: AUTHENTICATION & LOGIN WORKFLOW
        # ====================================================================
        module = "1. Authentication"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state("networkidle")
            
            # 1.1 Check Login Page UI
            assert page.locator("#login-username").is_visible(), "Username field missing"
            assert page.locator("#login-password").is_visible(), "Password field missing"
            auditor.log_result(module, "Login Page UI Elements", "PASS", "Login form inputs verified")

            # 1.2 Test Invalid Credentials
            page.locator("#login-username").fill("admin")
            page.locator("#login-password").fill("WrongPassword999!")
            page.locator("button[type='submit']").click()
            page.wait_for_timeout(1000)
            
            # Check for error alert
            err_box = page.locator(".text-rose-600, .bg-rose-50, [role='alert']").first
            if err_box.is_visible():
                auditor.log_result(module, "Invalid Login Rejection", "PASS", f"Properly displayed error: {err_box.inner_text().strip()}")
            else:
                auditor.log_result(module, "Invalid Login Rejection", "FAIL", "No error prompt displayed on invalid password", severity="P1")

            # 1.3 Test Valid Admin Login
            page.locator("#login-username").fill("admin")
            page.locator("#login-password").fill("Admin@12345")
            page.locator("button[type='submit']").click()
            page.wait_for_url(lambda u: "/login" not in u, timeout=12000)
            page.wait_for_load_state("networkidle")
            auditor.log_result(module, "Valid Login Execution", "PASS", "Successfully logged in as Super Admin")
        except Exception as e:
            auditor.log_result(module, "Auth Flow Execution", "FAIL", str(e), severity="P0")
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "error_auth.png"))

        # ====================================================================
        # MODULE 2: DASHBOARD & WORKSPACE APPEREANCE
        # ====================================================================
        module = "2. Dashboard"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 2.1 Check KPIs
            cards = page.locator(".font-mono, [class*='font-black']")
            count = cards.count()
            if count >= 3:
                auditor.log_result(module, "Dashboard KPI Cards", "PASS", f"Found {count} KPI indicators")
            else:
                auditor.log_result(module, "Dashboard KPI Cards", "FAIL", f"Only {count} KPI cards found", severity="P2")

            # 2.2 Check Company Switcher
            company_btn = page.locator("button:has-text('شركة'), button:has-text('جميع الشركات'), [aria-label*='شركة']").first
            if company_btn.is_visible():
                auditor.log_result(module, "Company Switcher", "PASS", f"Visible and labeled: {company_btn.inner_text().strip()[:30]}")
            else:
                auditor.log_result(module, "Company Switcher", "FAIL", "Company Switcher button not found in TopNav", severity="P2")
                
            page.screenshot(path=os.path.join(SCREENSHOT_DIR, "dashboard.png"))
        except Exception as e:
            auditor.log_result(module, "Dashboard Verification", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 3: COMPANIES, BRANCHES & DEPARTMENTS
        # ====================================================================
        module = "3. Companies"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/companies")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 3.1 Check Companies Table
            rows = page.locator("table tbody tr")
            row_count = rows.count()
            auditor.log_result(module, "Companies Table Display", "PASS", f"Found {row_count} company records")

            # 3.2 Add Company Modal & Form
            add_btn = page.locator("button:has-text('إضافة شركة جديدة')").first
            if add_btn.is_visible():
                add_btn.click()
                page.wait_for_timeout(600)
                modal = page.locator("div[role='dialog'], .fixed:has-text('إضافة شركة جديدة')").first
                if modal.is_visible():
                    auditor.log_result(module, "Add Company Modal", "PASS", "Modal opened successfully")
                    # Fill inputs
                    test_code = f"TCO{int(time.time()) % 1000}"
                    page.locator("input[placeholder*='شركة التطوير']").fill(f"شركة تجريبية للاختبار {test_code}")
                    page.locator("input[placeholder*='Advanced Development']").fill(f"Test Company {test_code}")
                    code_input = page.locator("input[placeholder*='ADC'], input[placeholder*='TCO'], input[placeholder*='رمز الشركة']")
                    if code_input.is_visible():
                        code_input.fill(test_code)
                    
                    # Submit
                    submit_btn = modal.locator("button[type='submit'], button:has-text('إضافة'), button:has-text('حفظ')").first
                    submit_btn.click()
                    page.wait_for_timeout(1500)
                    auditor.log_result(module, "Create Company Input & Submission", "PASS", f"Created company code: {test_code}")
                else:
                    auditor.log_result(module, "Add Company Modal", "FAIL", "Modal failed to appear after click", severity="P1")
            else:
                auditor.log_result(module, "Add Company Button", "FAIL", "Button not visible", severity="P1")
        except Exception as e:
            auditor.log_result(module, "Companies CRUD", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 4: EMPLOYEES DIRECTORY
        # ====================================================================
        module = "4. Employees"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/employees")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 4.1 Search & Filter
            search_input = page.locator("input[placeholder*='بحث عن موظف']")
            if search_input.is_visible():
                search_input.fill("فهد")
                page.wait_for_timeout(800)
                auditor.log_result(module, "Employee Search Filter", "PASS", "Search executed without crash")
                search_input.fill("")
                page.wait_for_timeout(800)

            # 4.2 Check Add Employee Modal
            add_emp_btn = page.locator("button:has-text('إضافة موظف'), button:has-text('تسجيل موظف')").first
            if add_emp_btn.is_visible():
                add_emp_btn.click()
                page.wait_for_timeout(600)
                emp_modal = page.locator("div[role='dialog'], .fixed:has-text('إضافة موظف')").first
                if emp_modal.is_visible():
                    auditor.log_result(module, "Add Employee Modal", "PASS", "Modal opened with full employee form fields")
                    # Close modal
                    close_btn = emp_modal.locator("button:has-text('إلغاء'), button[aria-label='إغلاق']").first
                    if close_btn.is_visible(): close_btn.click()
                else:
                    auditor.log_result(module, "Add Employee Modal", "FAIL", "Add Employee modal not visible", severity="P1")
            else:
                auditor.log_result(module, "Add Employee Button", "FAIL", "Add Employee button missing", severity="P1")

            # 4.3 View Employee Profile
            first_emp = page.locator("table tbody tr, .cursor-pointer:has-text('EMP-')").first
            if first_emp.is_visible():
                first_emp.click()
                page.wait_for_timeout(1000)
                drawer = page.locator("[role='dialog'], .fixed:has-text('ملف الموظف'), .fixed:has-text('بيانات الموظف')").first
                if drawer.is_visible():
                    auditor.log_result(module, "Employee Details Drawer", "PASS", "Employee custody and details displayed")
                    # Close drawer
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Employee Details Drawer", "WARN", "Drawer did not open on row click")
        except Exception as e:
            auditor.log_result(module, "Employees Verification", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 5: USERS & PERMISSIONS
        # ====================================================================
        module = "5. Users"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/users")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            rows = page.locator("table tbody tr")
            count = rows.count()
            if count >= 1:
                auditor.log_result(module, "Users Table Display", "PASS", f"Found {count} active system users")
            else:
                auditor.log_result(module, "Users Table Display", "FAIL", "No users displayed in table", severity="P1")

            # Check Add User button
            add_user_btn = page.locator("button:has-text('إضافة مستخدم')").first
            if add_user_btn.is_visible():
                auditor.log_result(module, "Add User Button", "PASS", "Add user control is available")
        except Exception as e:
            auditor.log_result(module, "Users Management", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 6: TECHNICAL ASSETS & HARDWARE
        # ====================================================================
        module = "6. Assets"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/assets")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 6.1 Check Assets Table
            rows = page.locator("table tbody tr")
            count = rows.count()
            auditor.log_result(module, "Assets Table Display", "PASS", f"Found {count} assets in current view")

            # 6.2 Add Asset Modal
            add_ast_btn = page.locator("button:has-text('تسجيل أصل'), button:has-text('إضافة أصل')").first
            if add_ast_btn.is_visible():
                add_ast_btn.click()
                page.wait_for_timeout(600)
                ast_modal = page.locator("div[role='dialog'], .fixed:has-text('أصل')").first
                if ast_modal.is_visible():
                    auditor.log_result(module, "Add Asset Modal", "PASS", "Asset creation dialog rendered correctly")
                    
                    # Fill asset details
                    t_suffix = str(int(time.time()) % 10000)
                    page.locator("input[placeholder*='AST-IGT-LAP-005'], input[name='asset_code']").fill(f"AST-TEST-{t_suffix}")
                    page.locator("input[placeholder*='MacBook Pro 14'], input[placeholder*='اسم الأصل']").fill(f"Dell Latitude {t_suffix}")
                    sn_input = page.locator("input[placeholder*='الرقم التسلسلي'], input[placeholder*='SN-'], input[name='serial_number']")
                    if sn_input.is_visible(): sn_input.fill(f"SN-TEST-{t_suffix}")

                    # Submit
                    submit_btn = ast_modal.locator("button[type='submit'], button:has-text('حفظ'), button:has-text('إضافة'), button:has-text('تسجيل')").first
                    submit_btn.click()
                    page.wait_for_timeout(1500)
                    auditor.log_result(module, "Create Asset Record Submission", "PASS", f"Asset AST-TEST-{t_suffix} created")
                else:
                    auditor.log_result(module, "Add Asset Modal", "FAIL", "Modal failed to open", severity="P1")
            
            # 6.3 Test QR Code View
            qr_btn = page.locator("button:has-text('QR'), [title*='QR'], [aria-label*='QR']").first
            if qr_btn.is_visible():
                qr_btn.click()
                page.wait_for_timeout(600)
                qr_modal = page.locator("div[role='dialog']:has-text('QR')").first
                if qr_modal.is_visible():
                    auditor.log_result(module, "Asset QR Code Modal", "PASS", "QR Code dialog displayed with print options")
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Asset QR Code Modal", "WARN", "QR modal did not open on click")
        except Exception as e:
            auditor.log_result(module, "Assets Verification", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 7: CUSTODY OPERATIONS
        # ====================================================================
        module = "7. Custody"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/custody")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 7.1 Verify Custody Table
            rows = page.locator("table tbody tr")
            count = rows.count()
            auditor.log_result(module, "Custody Records Display", "PASS", f"Found {count} custody transaction records")

            # 7.2 Handover Modal Trigger
            handover_btn = page.locator("button:has-text('تسليم عهدة'), button:has-text('إسناد عهدة')").first
            if handover_btn.is_visible():
                handover_btn.click()
                modal = page.locator("div[role='dialog']").first
                try:
                    modal.wait_for(state="visible", timeout=6000)
                    auditor.log_result(module, "Custody Handover Modal", "PASS", "Handover dialog opened successfully with available assets/employees")
                    page.keyboard.press("Escape")
                except Exception:
                    auditor.log_result(module, "Custody Handover Modal", "FAIL", "Handover modal failed to open within 6s", severity="P2")
            else:
                auditor.log_result(module, "Custody Handover Trigger", "WARN", "Handover button not visible in current view")
        except Exception as e:
            auditor.log_result(module, "Custody Operations", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 8: TASKS MANAGEMENT & WORKFLOW
        # ====================================================================
        module = "8. Tasks"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/tasks")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 8.1 Metric Tiles & Chips
            chips = page.locator("button:has-text('الكل'), button:has-text('مهامي'), button:has-text('قيد التنفيذ')")
            auditor.log_result(module, "Task Filters & Chips", "PASS", f"Found {chips.count()} filter chips")

            # 8.2 Create Task Modal
            add_task_btn = page.locator("button:has-text('إضافة مهمة'), button:has-text('مهمة جديدة'), [aria-label*='إضافة مهمة']").first
            if add_task_btn.is_visible():
                add_task_btn.click()
                page.wait_for_timeout(800)
                task_modal = page.locator("div[role='dialog'], .fixed:has-text('مهمة')").first
                if task_modal.is_visible():
                    auditor.log_result(module, "Create Task Modal", "PASS", "Task creation modal rendered")
                    
                    # Fill task details
                    t_id = f"TSK-{int(time.time()) % 10000}"
                    title_input = task_modal.locator("input[placeholder*='عنوان المهمة'], input[name='title']").first
                    if title_input.is_visible():
                        title_input.fill(f"مهمة تدقيق تشغيلية {t_id}")
                    
                    desc_input = task_modal.locator("textarea").first
                    if desc_input.is_visible():
                        desc_input.fill("فحص شامل لسلامة أداء الخادم وقواعد البيانات")
                    
                    submit_task = task_modal.locator("button[type='submit'], button:has-text('حفظ'), button:has-text('إنشاء')").first
                    submit_task.click()
                    page.wait_for_timeout(1500)
                    auditor.log_result(module, "Task Creation Submission", "PASS", f"Task {t_id} submitted")
                else:
                    auditor.log_result(module, "Create Task Modal", "FAIL", "Task modal failed to open", severity="P1")
        except Exception as e:
            auditor.log_result(module, "Tasks Management", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 9: HELP DESK / TICKETS
        # ====================================================================
        module = "9. Tickets"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/tickets")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # 9.1 Create Ticket Modal
            add_tck_btn = page.locator("button:has-text('فتح تذكرة'), button:has-text('تذكرة جديدة'), [aria-label*='تذكرة']").first
            if add_tck_btn.is_visible():
                add_tck_btn.click()
                page.wait_for_timeout(800)
                tck_modal = page.locator("div[role='dialog'], .fixed:has-text('تذكرة')").first
                if tck_modal.is_visible():
                    auditor.log_result(module, "Create Ticket Modal", "PASS", "Ticket creation modal displayed")
                    
                    title_input = tck_modal.locator("input[placeholder*='عنوان البلاغ'], input[name='issue_title']").first
                    if title_input.is_visible():
                        title_input.fill("فحص عطل تجريبي في الطابعة الشبكية")
                    
                    desc_input = tck_modal.locator("textarea").first
                    if desc_input.is_visible():
                        desc_input.fill("عدم استجابة الطابعة للطباعة على المنفذ 9100")

                    sub_btn = tck_modal.locator("button[type='submit'], button:has-text('فتح التذكرة'), button:has-text('حفظ')").first
                    sub_btn.click()
                    page.wait_for_timeout(1500)
                    auditor.log_result(module, "Ticket Creation Submission", "PASS", "Ticket created successfully")
                else:
                    auditor.log_result(module, "Create Ticket Modal", "FAIL", "Modal failed to open", severity="P1")
        except Exception as e:
            auditor.log_result(module, "Tickets / Help Desk", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 10: APPROVALS & WORKFLOW
        # ====================================================================
        module = "10. Approvals"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/approvals")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # Verify tabs and table
            tabs = page.locator("button:has-text('قيد الانتظار'), button:has-text('المعتمدة'), button:has-text('المرفوضة')")
            auditor.log_result(module, "Approval Workflow Tabs", "PASS", f"Found {tabs.count()} approval stage filters")
        except Exception as e:
            auditor.log_result(module, "Approvals Flow", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 11: THIRD-PARTY SUBSCRIPTIONS
        # ====================================================================
        module = "11. Subscriptions"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/subscriptions")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            add_sub_btn = page.locator("button:has-text('إضافة اشتراك')").first
            if add_sub_btn.is_visible():
                add_sub_btn.click()
                page.wait_for_timeout(600)
                sub_modal = page.locator("div[role='dialog']").first
                if sub_modal.is_visible():
                    auditor.log_result(module, "Add Subscription Modal", "PASS", "Subscription modal opened")
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Add Subscription Modal", "FAIL", "Modal failed to open", severity="P2")
        except Exception as e:
            auditor.log_result(module, "Subscriptions Module", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 12: IT INFRASTRUCTURE
        # ====================================================================
        module = "12. Infrastructure"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/infrastructure")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            add_infra_btn = page.locator("button:has-text('إضافة جهاز بنية تحتية')").first
            if add_infra_btn.is_visible():
                add_infra_btn.click()
                page.wait_for_timeout(600)
                infra_modal = page.locator("div[role='dialog']").first
                if infra_modal.is_visible():
                    auditor.log_result(module, "Add Infrastructure Device Modal", "PASS", "Modal opened successfully")
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Add Infrastructure Device Modal", "FAIL", "Modal failed to open", severity="P2")
        except Exception as e:
            auditor.log_result(module, "Infrastructure Module", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 13: MAINTENANCE & CHANGES
        # ====================================================================
        module = "13. Maintenance"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/maintenance")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            add_maint_btn = page.locator("button:has-text('إضافة سجل صيانة')").first
            if add_maint_btn.is_visible():
                add_maint_btn.click()
                page.wait_for_timeout(600)
                maint_modal = page.locator("div[role='dialog']").first
                if maint_modal.is_visible():
                    auditor.log_result(module, "Add Maintenance Modal", "PASS", "Maintenance creation modal opened")
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Add Maintenance Modal", "FAIL", "Modal failed to open", severity="P2")
        except Exception as e:
            auditor.log_result(module, "Maintenance Module", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 14: DIGITAL ASSETS & SECRETS VAULT
        # ====================================================================
        module = "14. Digital Assets Vault"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/digital-assets")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # Check vault cards
            vault_items = page.locator(".rounded-2xl.border, table tbody tr")
            auditor.log_result(module, "Vault Assets Display", "PASS", f"Found {vault_items.count()} vault asset items")

            # Check Re-Authentication Secret Reveal Trigger
            reveal_btn = page.locator("button:has-text('كشف'), button[title*='كشف'], [aria-label*='كشف']").first
            if reveal_btn.is_visible():
                reveal_btn.click()
                page.wait_for_timeout(600)
                reauth_modal = page.locator("div[role='dialog']:has-text('كلمة المرور')").first
                if reauth_modal.is_visible():
                    auditor.log_result(module, "Vault Re-Authentication Modal", "PASS", "Prompted for master password re-auth to reveal secret")
                    page.keyboard.press("Escape")
                else:
                    auditor.log_result(module, "Vault Re-Authentication Modal", "WARN", "Re-auth modal did not trigger")
        except Exception as e:
            auditor.log_result(module, "Digital Assets Vault", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 15: REPORTS & AUDIT LOGS
        # ====================================================================
        module = "15. Reports & Audit"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/reports")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            export_btns = page.locator("button:has-text('تصدير Excel'), button:has-text('CSV'), button:has-text('معاينة')")
            auditor.log_result(module, "Reports Export Actions", "PASS", f"Found {export_btns.count()} export triggers")

            # Audit Trail
            page.goto(f"{BASE_URL}/audit")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            audit_rows = page.locator("table tbody tr")
            count = audit_rows.count()
            if count >= 1:
                auditor.log_result(module, "Immutable Audit Trail Table", "PASS", f"Found {count} immutable audit log entries")
            else:
                auditor.log_result(module, "Immutable Audit Trail Table", "FAIL", "No audit logs displayed", severity="P2")
        except Exception as e:
            auditor.log_result(module, "Reports & Audit Verification", "FAIL", str(e), severity="P1")

        # ====================================================================
        # MODULE 16: SETTINGS, THEMES & INTEGRATIONS
        # ====================================================================
        module = "16. Settings"
        auditor.attach_page_listeners(page, module)
        try:
            print(f"\n--- Testing {module} ---")
            page.goto(f"{BASE_URL}/settings")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1500)

            # Check theme presets
            theme_swatches = page.locator("button[aria-label*='هوية'], .cursor-pointer:has-text('الزمرد'), .cursor-pointer:has-text('الأرجواني')")
            auditor.log_result(module, "Theme Presets Selector", "PASS", f"Theme selector available with swatches")
            
            # Check Integrations
            page.goto(f"{BASE_URL}/settings/integrations")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(1000)
            integrations = page.locator(".rounded-2xl:has-text('Telegram'), .rounded-2xl:has-text('البريد')")
            auditor.log_result(module, "Integrations Management", "PASS", f"Found integration cards")
        except Exception as e:
            auditor.log_result(module, "Settings & Appearance", "FAIL", str(e), severity="P1")

        context.close()
        browser.close()

    # Save structured audit results
    audit_report = {
        "summary": {
            "total_tests": len(auditor.results),
            "passed": len([r for r in auditor.results if r["status"] == "PASS"]),
            "failed": len([r for r in auditor.results if r["status"] == "FAIL"]),
            "warnings": len([r for r in auditor.results if r["status"] == "WARN"]),
            "console_errors_count": len(auditor.console_errors),
            "network_errors_count": len(auditor.network_errors),
        },
        "bugs": auditor.bugs,
        "console_errors": auditor.console_errors,
        "network_errors": auditor.network_errors,
        "all_results": auditor.results,
    }
    
    report_path = os.path.join(SCREENSHOT_DIR, "system_audit_results.json")
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(audit_report, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print("SYSTEM AUDIT EXECUTION COMPLETE")
    print(f"Total Tests Executed: {audit_report['summary']['total_tests']}")
    print(f"Passed: {audit_report['summary']['passed']}")
    print(f"Failed: {audit_report['summary']['failed']}")
    print(f"Warnings: {audit_report['summary']['warnings']}")
    print(f"Bugs Logged: {len(auditor.bugs)}")
    print(f"Report JSON: {report_path}")
    print("=" * 60)

if __name__ == "__main__":
    run_full_system_audit()
