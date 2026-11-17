"""Chrome integration test against the real UI and an isolated in-memory API.

Run against a Next dev server (ASSIGNMENT_UI_URL defaults to port 3000).
Every /api request is intercepted and served by TestClient; no live DB is used.
"""
import os
os.environ['DATABASE_URL']='sqlite://'
import json
import sys
from pathlib import Path
from urllib.parse import urlsplit
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[2]
UI_URL=os.getenv('ASSIGNMENT_UI_URL','http://127.0.0.1:3000').rstrip('/')
sys.path.insert(0,str(ROOT/'.lan-runtime/browser'))
sys.path.insert(0,str(ROOT/'backend'))
sys.path.insert(0,str(ROOT/'backend/tests'))
from playwright.sync_api import sync_playwright, expect
from test_task_assignee_search import AssignmentSearchTests
from app.api.v1.endpoints import auth, workspace, notifications, assets
from app.models.user import Employee


def run():
    fixture=AssignmentSearchTests()
    fixture.setUp()
    for module in (auth,workspace,notifications,assets):
        fixture.app.include_router(module.router,prefix='/api/v1')
    duplicate=Employee(company_id=fixture.a.id,employee_number='DUPLICATE',full_name=fixture.ea.full_name,job_title='الدعم الفني')
    inactive=Employee(company_id=fixture.a.id,employee_number='INACTIVE',full_name='موظف غير نشط',employment_status='Inactive')
    long_name='محمد عبدالله عبدالرحمن عبدالعزيز أحمد إبراهيم مهندس البنية التحتية والدعم الفني'
    long_employee=Employee(company_id=fixture.a.id,employee_number='LONG',full_name=long_name,job_title='مهندس دعم')
    fixture.db.add_all([duplicate,inactive,long_employee]);fixture.db.commit()
    errors=[]; requests=[]; result={}
    try:
        with sync_playwright() as p, patch('app.api.v1.endpoints.tasks.enqueue_task_notification',return_value=None) as enqueue:
            browser=p.chromium.launch(executable_path='C:/Program Files/Google/Chrome/Application/chrome.exe',headless=True)
            context=browser.new_context(viewport={'width':1280,'height':1000})
            page=context.new_page()
            page.on('pageerror',lambda error: errors.append(str(error)))
            def api_route(route):
                request=route.request
                parsed=urlsplit(request.url)
                path=parsed.path+('?' + parsed.query if parsed.query else '')
                requests.append((request.method,path,request.post_data_json if request.post_data else None))
                response=fixture.client.request(request.method,path,headers=fixture.headers,json=request.post_data_json if request.post_data else None)
                route.fulfill(status=response.status_code,content_type='application/json',body=response.text)
            context.route('**/api/**',api_route)
            page.goto(UI_URL+'/tasks')
            try:
                page.get_by_role('button',name='إضافة مهمة جديدة',exact=True).click(timeout=20000)
            except Exception:
                print('UI startup diagnostics:',page.locator('body').inner_text()[:2500],errors,requests[:15])
                raise
            combo=page.get_by_role('combobox',name='الموظف / الفني المسند إليه')
            combo.fill('احمد ابرا')
            expect(page.locator('[role=option]')).to_have_count(2)
            expect(page.locator('[role=option]').filter(has_text='Telegram مرتبط')).to_have_count(1)
            expect(page.locator('[role=option]').filter(has_text='Telegram غير مرتبط')).to_have_count(1)
            combo.fill('no-match-exists')
            expect(page.get_by_text('لا يوجد موظفون مطابقون متاحون للإسناد.')).to_be_visible()
            combo.fill('احمد')
            expect(page.locator('[role=option]')).to_have_count(2)
            combo.press('ArrowDown'); combo.press('ArrowDown'); combo.press('ArrowUp'); combo.press('Enter')
            expect(combo).to_have_value(fixture.ea.full_name)
            expect(combo).to_have_attribute('aria-expanded','false')
            form=page.locator('form').filter(has=combo)
            form.locator('input[type="text"]').first.fill('Isolated autocomplete browser task')
            page.get_by_role('button',name='حفظ وإنشاء المهمة').click()
            expect(page.get_by_text('Isolated autocomplete browser task',exact=True)).to_be_visible()
            created=next(r for r in requests if r[0]=='POST' and r[1]=='/api/v1/tasks')
            self_id=created[2]['assigned_to_id']
            assert self_id in {str(fixture.ea.id),str(duplicate.id)}
            assert enqueue.call_args.kwargs['event_type']=='task.assigned'
            result['arabic_multiword_duplicates_keyboard_create']='passed'
            page.get_by_role('button',name='التفاصيل وسير العمل',exact=True).first.click()
            page.get_by_role('button',name='تعديل المهمة والإسناد').click()
            combo=page.get_by_role('combobox',name='الموظف / الفني المسند إليه')
            expect(combo).to_have_value(fixture.ea.full_name)
            combo.fill('smi ahm')
            expect(page.locator('[role=option]')).to_have_count(1)
            page.locator('[role=option]').click()
            expect(combo).to_have_value('Ahmed Ibrahim Smith')
            page.get_by_role('button',name='حفظ تعديلات المهمة').click()
            task=fixture.db.query(__import__('app.models.task',fromlist=['Task']).Task).filter_by(title='Isolated autocomplete browser task').one()
            fixture.db.refresh(task)
            assert task.assigned_to_id==fixture.next_emp.id
            assert enqueue.call_args.kwargs['event_type']=='task.reassigned'
            result['english_mouse_edit_persistence_notifications']='passed'
            page.get_by_role('button',name='إضافة مهمة جديدة',exact=True).click()
            combo=page.get_by_role('combobox',name='الموظف / الفني المسند إليه')
            combo.fill('غير نشط')
            expect(page.locator('[role=option]')).to_have_count(0)
            combo.fill('احمد')
            expect(page.locator('[role=option]')).to_have_count(2)
            combo.press('Escape')
            expect(combo).to_have_attribute('aria-expanded','false')
            combo.fill('احمد ابراهيم')
            expect(page.locator('[role=option]')).to_have_count(2)
            result['inactive_empty_results_escape']='passed'
            context.close()
            mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            mobile.route('**/api/**',api_route)
            page=mobile.new_page();page.on('pageerror',lambda error: errors.append(str(error)))
            page.goto(UI_URL+'/tasks')
            page.get_by_role('button',name='إضافة مهمة جديدة',exact=True).tap()
            combo=page.get_by_role('combobox',name='الموظف / الفني المسند إليه')
            combo.fill('محمد عبدالله')
            option=page.locator('[role=option]');expect(option).to_have_count(1)
            option.tap();expect(combo).to_have_value(long_name)
            expect(combo).to_have_attribute('aria-expanded','false')
            assert combo.evaluate('el => getComputedStyle(el).direction')=='rtl'
            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            result['mobile_touch_rtl_long_names']='passed (Chrome emulation)'
            assert not errors,errors
            result['browser_errors']=errors
            result['api_requests']=len(requests)
            result['database']='isolated in-memory SQLite; no application records changed'
            browser.close()
    finally:
        fixture.tearDown()
    print(json.dumps(result,ensure_ascii=False,indent=2))

if __name__=='__main__':run()
