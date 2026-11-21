# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""In-memory integration tests; all Telegram delivery is mocked."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import json
from unittest.mock import patch
from fastapi import HTTPException
from test_telegram_manual_regressions import ManualLinkRegressions, BOT
from app.models.user import User, Role, CompanyMembership
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.models.subscription import ThirdPartySubscription
from app.services import telegram_service as service
from app.workers import telegram_poller as worker
from app.api.v1.endpoints import telegram
from app.services.telegram_permissions import POLICY_KEY


class RouterPermissions(ManualLinkRegressions):
    def linked(self, employee=None, account='1234567', role='Employee'):
        employee = employee or self.a
        self.verify(self.generate(employee)['token'], account)
        link = employee.telegram_link if hasattr(employee, 'telegram_link') else None
        from app.models.telegram import TelegramUserLink
        link = self.db.query(TelegramUserLink).filter_by(employee_id=employee.id).one()
        crm_role = self.db.query(Role).filter_by(name=role).first()
        if not crm_role:
            crm_role = Role(name=role); self.db.add(crm_role); self.db.flush()
        self.db.query(CompanyMembership).filter_by(user_id=link.user_id, company_id=employee.company_id).one().role_id = crm_role.id
        self.db.commit()
        return link

    def action(self, command, account='1234567'):
        return service.execute_bot_action(self.db, account, account, command)

    def admin(self):
        user = User(username='router-admin', email='router-admin@example.test', password_hash='test-only', is_superadmin=True, account_status='Active')
        self.db.add(user); self.db.commit()
        return user

    def test_every_menu_button_and_pagination_reauthorizes(self):
        link = self.linked(role='Company Admin')
        link.allowed_modules = ['tasks', 'tickets', 'custody', 'subscriptions', 'reports']
        link.data_scope = 'Company'
        for i in range(7):
            self.db.add(Task(company_id=self.company.id, assigned_to_id=self.a.id, title=f'Mine {i}', status='Assigned'))
        self.db.add(Task(company_id=self.other.id, assigned_to_id=self.c.id, title='SECRET OTHER COMPANY', status='Assigned'))
        self.db.add(ThirdPartySubscription(company_id=self.company.id, service_name='Authorized subscription'))
        self.db.commit()
        menu = self.action('cmd:main_menu')
        for row in menu['reply_markup']['inline_keyboard']:
            for button in row:
                result = self.action(button['callback_data'])
                self.assertTrue(result['success'], result)
                self.assertNotIn('SECRET OTHER COMPANY', result['message'])
                self.assertIn('reply_markup', result)
        first = self.action('cmd:my_tasks:0'); second = self.action('cmd:my_tasks:1')
        self.assertEqual(len(first['tasks']), 5); self.assertEqual(len(second['tasks']), 2)
        self.assertFalse({t['id'] for t in first['tasks']} & {t['id'] for t in second['tasks']})
        link.allowed_modules = []; self.db.commit()
        self.assertFalse(self.action('cmd:my_tasks:1')['success'])
        self.assertTrue(self.action('cmd:my_permissions')['success'])

    def test_invalid_pages_and_html_are_safe(self):
        self.linked()
        self.db.add(Task(company_id=self.company.id, assigned_to_id=self.a.id, title='<b>Untrusted</b>', status='Assigned')); self.db.commit()
        self.assertIn('&lt;b&gt;', self.action('cmd:my_tasks')['message'])
        for page in ('-1', 'bad', '100001', '0:extra'):
            self.assertFalse(self.action('cmd:my_tasks:'+page)['success'])

    def test_save_preview_empty_permissions_and_escalation(self):
        link = self.linked(); admin = self.admin()
        kwargs = dict(employee_id=self.a.id, company_id=self.company.id, current_user=admin, active_cid=self.company.id, db=self.db)
        telegram.update_employee_telegram_permissions(payload=telegram.UpdateTelegramPermissionsRequest(allowed_modules=[], actions={'tasks': []}, data_scope='Self'), **kwargs)
        self.assertFalse(self.action('cmd:my_tasks')['success'])
        details = telegram.get_employee_telegram_details(**kwargs)['data']
        self.assertEqual(details['permissions_matrix']['effective_actions']['tasks'], [])
        self.assertIn('maximum_actions', details['permissions_matrix'])
        for payload in [dict(actions={'reports':['manage']}), dict(allowed_modules=['reports']), dict(data_scope='Company')]:
            with self.assertRaises(HTTPException):
                telegram.update_employee_telegram_permissions(payload=telegram.UpdateTelegramPermissionsRequest(**payload), **kwargs)
        self.assertEqual(link.allowed_modules, [])

    def test_manager_without_access_management_cannot_save(self):
        link = self.linked(role='IT Manager')
        with self.assertRaises(HTTPException) as error:
            telegram.update_employee_telegram_permissions(self.a.id, telegram.UpdateTelegramPermissionsRequest(allowed_modules=[]), self.company.id, link.user, self.company.id, self.db)
        self.assertEqual(error.exception.status_code, 403)

    def test_policy_in_notification_payload_cannot_bypass_validation(self):
        link = self.linked(); admin = self.admin()
        telegram.update_employee_telegram_permissions(self.a.id, telegram.UpdateTelegramPermissionsRequest(notification_preferences={POLICY_KEY: {'scope':'Company','actions':{'reports':['manage']}}}), self.company.id, admin, self.company.id, self.db)
        self.assertNotEqual((link.notification_preferences or {}).get(POLICY_KEY, {}).get('scope'), 'Company')
        self.assertFalse(self.action('cmd:reports')['success'])

    def test_task_actions_ownership_updates_and_duplicate_start(self):
        link = self.linked()
        task = Task(company_id=self.company.id, assigned_to_id=self.a.id, title='Own task', status='Assigned')
        other = Task(company_id=self.other.id, assigned_to_id=self.c.id, title='Secret task', status='Assigned')
        self.db.add_all([task, other]); self.db.commit()
        self.assertFalse(self.action('act:start:'+str(other.id))['success'])
        for action in ['ack', 'start', 'start', 'done']:
            self.assertTrue(self.action(f'act:{action}:{task.id}')['success'])
        self.db.refresh(task); self.assertIn(task.status, ('Completed', 'Submitted for Review'))
        link.notification_preferences = {POLICY_KEY: {'actions': {'tasks': ['view']}}}; self.db.commit()
        self.assertFalse(self.action('act:start:'+str(task.id))['success'])

    def test_suspension_and_role_downgrade_apply_immediately(self):
        link = self.linked(role='Company Admin'); link.allowed_modules=['reports']; link.data_scope='Company'; self.db.commit()
        self.assertTrue(self.action('cmd:reports')['success'])
        membership = self.db.query(CompanyMembership).filter_by(user_id=link.user_id).one()
        membership.role_id = self.role.id; self.db.commit()
        self.assertFalse(self.action('cmd:reports')['success'])
        link.user.account_status='Suspended'; self.db.commit()
        self.assertFalse(self.action('cmd:my_permissions')['success'])
        link.user.account_status='Active'; membership.status='Inactive'; self.db.commit()
        self.assertFalse(self.action('cmd:main_menu')['success'])

    def test_callback_acknowledged_and_wrong_bot_denied(self):
        self.linked()
        update={'callback_query':{'id':'cb-test','from':{'id':1234567},'message':{'message_id':9,'chat':{'id':1234567}},'data':'cmd:my_tasks'}}
        with patch.object(worker, 'answer_callback_query') as ack, patch.object(worker, 'edit_telegram_message', return_value=True) as edit, patch.object(worker, 'send_telegram_reply') as send:
            worker.process_telegram_update(self.db, BOT, update)
            ack.assert_called_once(); edit.assert_called_once()
            worker.process_telegram_update(self.db, '999999999:other-test-bot-token', update)
            self.assertEqual(edit.call_count, 1); send.assert_called_once()

    def test_personal_ticket_scope_even_for_manager(self):
        link=self.linked(role='Company Admin'); link.allowed_modules=['tickets']; link.data_scope='Company'
        self.db.add(HelpDeskTicket(company_id=self.company.id, requester_id=self.b.id, issue_title='Someone else ticket', issue_description='Isolated test ticket', ticket_number='RT-OTHER'))
        self.db.commit()
        self.assertNotIn('Someone else ticket', self.action('cmd:my_tickets')['message'])
