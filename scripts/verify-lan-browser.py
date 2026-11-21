# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Real Chrome smoke test. Leaves its explicitly labelled verification task in the database."""
import json
import os
import re
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.lan-runtime/browser'))
from playwright.sync_api import sync_playwright, expect

base = sys.argv[1].rstrip('/')
# Prefer environment input; existing documented development account is a fallback.
password = os.environ.get('LAN_TEST_PASSWORD')
if not password:
    match = re.search(r'Password:\*\* `([^`]+)`', (ROOT / 'README.md').read_text(encoding='utf-8'))
    if not match: raise RuntimeError('Set LAN_TEST_USERNAME and LAN_TEST_PASSWORD for a valid account.')
    password = match.group(1)
result = {'base_url': base, 'browser': 'Chrome headless on server (not a second device)'}
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe', headless=True)
    ctx = browser.new_context(viewport={'width': 1440, 'height': 1000})
    page = ctx.new_page()
    errors, bad_requests = [], []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('request', lambda r: bad_requests.append(r.url) if ':8000' in r.url or 'localhost' in r.url else None)
    page.goto(base + '/login')
    page.locator('input[type="text"]').fill(os.environ.get('LAN_TEST_USERNAME', 'admin'))
    page.locator('input[type="password"]').fill(password)
    with page.expect_response(lambda r: '/api/v1/auth/login' in r.url) as login:
        page.locator('button[type="submit"]').click()
    assert login.value.status == 200, 'Login failed; no additional password attempts were made.'
    page.wait_for_url(base + '/', timeout=30000)
    cid = page.evaluate('localStorage.getItem("active_company_id")')
    headers = {'X-Company-ID': cid}
    result['login'] = 'passed'
    cookies = ctx.cookies()
    cookie = next(c for c in cookies if c['name'] == 'session_token')
    assert cookie['httpOnly'] and cookie['sameSite'] == 'Lax'
    result['host_cookie'] = {'httpOnly': cookie['httpOnly'], 'sameSite': cookie['sameSite'], 'domain': cookie['domain']}
    statuses = {}
    for path in ['/auth/me','/tasks','/notifications','/workspace','/telegram/status']:
        r = ctx.request.get(base + '/api/v1' + path, headers=headers)
        statuses[path] = r.status
        assert r.ok, f'{path}: HTTP {r.status}'
        if path == '/telegram/status':
            d = r.json()['data']
            result['telegram'] = {k: d.get(k) for k in ['is_configured','is_enabled','worker_status']}
    result['authenticated_api'] = statuses
    page.goto(base + '/tasks')
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='إضافة مهمة', exact=False).first.click()
    form = page.locator('form').filter(has=page.get_by_role('button', name='حفظ وإنشاء المهمة'))
    form.locator('select').nth(0).locator('option').nth(1).wait_for(state='attached', timeout=10000)
    title = 'LAN deployment verification ' + datetime.now().isoformat(timespec='seconds')
    form.locator('input[type="text"]').fill(title)
    employee_options = form.locator('select').nth(0).locator('option')
    assert employee_options.count() > 1, 'No employee available for assignment.'
    employee_id = employee_options.nth(1).get_attribute('value')
    form.locator('select').nth(0).select_option(employee_id)
    with page.expect_response(lambda r: r.request.method == 'POST' and r.url.endswith('/api/v1/tasks')) as created:
        form.get_by_role('button', name='حفظ وإنشاء المهمة').click()
    response = created.value
    result['task_create'] = {'url':response.url,'status':response.status,'payload':response.request.post_data_json,'response':response.json()}
    assert response.ok, response.text()
    task_id = response.json()['data']['id']
    page.reload()
    page.locator('input[type="text"]').first.fill(title)
    expect(page.get_by_text(title, exact=True)).to_be_visible(timeout=15000)
    result['task_refresh'] = 'passed'
    result['task_id'] = task_id
    (ROOT / '.lan-runtime/browser-task.json').write_text(json.dumps({'task_id':task_id,'company_id':cid,'title':title}),encoding='utf-8')
    page.goto(base + '/notifications')
    page.wait_for_load_state('networkidle')
    result['notifications_page'] = 'passed'
    page.set_viewport_size({'width':390,'height':844})
    page.goto(base + '/tasks')
    page.screenshot(path=str(ROOT / '.lan-runtime/lan-mobile.png'), full_page=True)
    result['mobile_viewport'] = 'rendered in Chrome; not a physical mobile-device test'
    logout = ctx.request.post(base + '/api/v1/auth/logout')
    assert logout.ok
    assert ctx.request.get(base + '/api/v1/auth/me').status == 401
    result['logout'] = 'passed'
    result['browser_errors'] = errors
    result['direct_backend_requests'] = bad_requests
    assert not errors and not bad_requests
    browser.close()
(ROOT / '.lan-runtime/browser-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
