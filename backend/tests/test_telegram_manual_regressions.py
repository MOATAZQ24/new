# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Isolated manual-link/worker regressions: no live database or Telegram calls."""
import os
os.environ['DATABASE_URL'] = 'sqlite://'
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import io
import json
import hashlib
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch, MagicMock
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.models import Base
from app.models.company import Company
from app.models.user import Employee, User, Role, CompanyMembership
from app.models.telegram import TelegramUserLink, TelegramActionLog, TelegramBotMenuConfig, NotificationOutbox
from app.models.integration import IntegrationConfig, IntegrationLog
from app.models.task import Task
from app.models.ticket import HelpDeskTicket
from app.services import telegram_service as service
from app.workers import telegram_poller as worker
from app.api.v1.endpoints import telegram
from app.core.database import get_db

BOT = '123456789:isolated-test-bot-credential'

class ManualLinkRegressions(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread':False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.company = Company(company_name_ar='اختبار', company_name_en='Test', company_code='TGM-1')
        self.other = Company(company_name_ar='أخرى', company_name_en='Other', company_code='TGM-2')
        self.role = Role(name='Employee')
        self.db.add_all([self.company, self.other, self.role]); self.db.flush()
        self.a = self.employee('A', self.company)
        self.b = self.employee('B', self.company)
        self.c = self.employee('C', self.other)
        for company in [self.company, self.other]:
            self.db.add(IntegrationConfig(company_id=company.id, service_name='telegram', display_name='Test', is_enabled=True, config_data={'bot_token':BOT,'bot_username':'InvestorGateBot'}))
        self.db.commit()

    def employee(self, number, company):
        emp = Employee(company_id=company.id, employee_number=number, full_name='Employee '+number, employment_status='Active')
        self.db.add(emp); self.db.flush()
        user = User(employee_id=emp.id, username='user-'+number, email=number+'@example.test', password_hash='unusable-test-hash', account_status='Active')
        self.db.add(user); self.db.flush()
        self.db.add(CompanyMembership(user_id=user.id, company_id=company.id, role_id=self.role.id, status='Active'))
        return emp

    def tearDown(self):
        self.db.close(); self.engine.dispose()

    def generate(self, emp=None):
        emp = emp or self.a
        return service.generate_telegram_link_token(self.db, emp.id, emp.company_id)

    def verify(self, token, account='1234567', bot=BOT):
        return service.verify_telegram_link(self.db, token, account, account, 'test_employee', bot_token=bot)

    def test_exact_command_links_once_with_tenant_and_audit(self):
        generated = self.generate()
        self.assertEqual(generated['command'], '/start '+generated['token'])
        self.assertNotIn('deep_link', generated)
        result = self.verify(generated['token'])
        self.assertEqual(result['company_id'], str(self.company.id))
        self.db.expire_all()
        link = self.db.query(TelegramUserLink).filter_by(employee_id=self.a.id).one()
        self.assertTrue(link.is_verified)
        self.assertEqual(link.user.employee_id, self.a.id)
        log = self.db.query(TelegramActionLog).filter_by(action='verify_telegram_link').one()
        self.assertEqual(log.details['token_ref'], hashlib.sha256(generated['token'].encode()).hexdigest())
        self.assertNotIn(generated['token'], json.dumps(log.details))
        for account in ['1234567', '7654321']:
            with self.assertRaises(ValueError): self.verify(generated['token'], account)
        self.assertEqual(link.telegram_user_id, '1234567')

    def test_expired_and_pin_prefix_and_replaced_tokens_rejected(self):
        generated = self.generate()
        with self.assertRaises(ValueError): self.verify(generated['pin_code'])
        replacement = self.generate()
        with self.assertRaises(ValueError): self.verify(generated['token'])
        link = self.db.query(TelegramUserLink).filter_by(employee_id=self.a.id).one()
        link.token_expires_at = datetime.utcnow()-timedelta(seconds=1); self.db.commit()
        with self.assertRaisesRegex(ValueError, 'انتهت'): self.verify(replacement['token'])
        self.assertFalse(link.is_verified)

    def test_conflict_preserves_original_same_and_cross_company(self):
        self.verify(self.generate()['token'])
        for employee in [self.b, self.c]:
            generated = self.generate(employee)
            with self.assertRaisesRegex(ValueError, 'مسؤول'): self.verify(generated['token'])
            old = self.db.query(TelegramUserLink).filter_by(employee_id=self.a.id).one()
            target = self.db.query(TelegramUserLink).filter_by(employee_id=employee.id).one()
            self.assertTrue(old.is_verified)
            self.assertFalse(target.is_verified)
            self.assertEqual(old.telegram_user_id, '1234567')

    def test_generation_does_not_revoke_verified_link(self):
        self.verify(self.generate()['token'])
        with self.assertRaisesRegex(ValueError, 'مسؤول'): self.generate()
        self.assertTrue(self.db.query(TelegramUserLink).filter_by(employee_id=self.a.id).one().is_verified)

    def test_wrong_company_wrong_bot_inactive_and_group_rejected(self):
        with self.assertRaises(ValueError): service.generate_telegram_link_token(self.db, self.a.id, self.other.id)
        token = self.generate()['token']
        with self.assertRaises(ValueError): self.verify(token, bot='other-bot-credential')
        with self.assertRaises(ValueError): service.verify_telegram_link(self.db, token, '1234567', '-123', bot_token=BOT)
        self.a.employment_status = 'Terminated'; self.db.commit()
        with self.assertRaises(ValueError): self.verify(token)

    def test_database_uniqueness_prevents_racing_identity_claim(self):
        self.verify(self.generate()['token'])
        self.generate(self.b)
        second = self.db.query(TelegramUserLink).filter_by(employee_id=self.b.id).one()
        second.telegram_user_id='1234567'; second.is_verified=True
        with self.assertRaises(IntegrityError): self.db.commit()
        self.db.rollback()

    def test_start_handler_uses_new_company_for_keyboard_and_welcome(self):
        token = self.generate()['token']
        with patch.object(worker, 'send_telegram_reply') as reply:
            worker.process_telegram_update(self.db, BOT, {'message':{'text':'/start '+token,'from':{'id':1234567},'chat':{'id':1234567}}})
        self.assertIn('تم ربط حسابك بنجاح', reply.call_args.args[2])
        self.assertIsNotNone(reply.call_args.kwargs['reply_markup'])
        self.assertGreater(self.db.query(TelegramBotMenuConfig).filter_by(company_id=self.company.id).count(), 0)

    def test_no_company_keyboard_does_not_write_invalid_defaults(self):
        self.assertIsNone(service.build_telegram_reply_keyboard(self.db, None))
        self.assertEqual(self.db.query(TelegramBotMenuConfig).count(), 0)

    def test_ticket_message_does_not_crash_before_next_start(self):
        self.verify(self.generate()['token'])
        self.db.add(HelpDeskTicket(company_id=self.company.id, ticket_number='TEST-1', issue_title='Ticket title', issue_description='Details', status='In Progress', requester_id=self.a.id)); self.db.commit()
        with patch.object(worker, 'send_telegram_reply') as reply:
            worker.process_telegram_update(self.db, BOT, {'message':{'text':'/tickets','from':{'id':1234567},'chat':{'id':1234567}}})
        self.assertIn('Ticket title', reply.call_args.args[2])

    def test_bad_update_does_not_starve_later_updates(self):
        generated = self.generate()
        employee_id = self.a.id
        other_command = self.generate(self.b)['command']
        good = {'update_id':11,'message':{'text':'/start '+generated['token'],'from':{'id':1234567},'chat':{'id':1234567}}}
        actual = worker.process_telegram_update
        def process(db, bot_token, update):
            if update['update_id']==10: raise AttributeError('poison update')
            actual(db, bot_token, update)
        def finish(_): worker.RUNNING=False
        worker.RUNNING=True
        bad = {'update_id':10,'message':{'text':other_command,'from':{'id':7654321},'chat':{'id':7654321,'type':'private'}}}
        with patch.object(worker,'init_db'), patch.object(worker,'SessionLocal',return_value=self.db), patch.object(worker,'get_active_bot_tokens',return_value=[{'token':BOT}]), patch.object(worker,'dispatch_outbox_notifications',return_value={}), patch.object(worker,'load_offset',return_value=10), patch.object(worker,'fetch_telegram_updates',return_value=[bad,good]), patch.object(worker,'save_offset') as offset, patch.object(worker,'update_worker_status'), patch.object(worker,'process_telegram_update',side_effect=process), patch.object(worker,'send_telegram_reply'), patch.object(worker.time,'sleep',side_effect=finish):
            worker.run_poller_loop()
            self.assertEqual(offset.call_args.args[0],12)
        worker.RUNNING=True
        self.assertTrue(self.db.query(TelegramUserLink).filter_by(employee_id=employee_id).one().is_verified)

    def test_status_reports_conflict_without_disclosing_token(self):
        self.verify(self.generate()['token'])
        generated = self.generate(self.b)
        with self.assertRaises(ValueError): self.verify(generated['token'])
        admin=MagicMock(is_superadmin=True)
        result=telegram.get_employee_link_status(self.b.id, company_id=self.company.id, current_user=admin, active_cid=self.company.id, db=self.db)['data']
        self.assertEqual(result['last_result'],'Conflict')
        self.assertIn('مسؤول', result['last_error'])
        self.assertNotIn(generated['token'], json.dumps(result))

    def test_public_verify_and_untrusted_webhook_are_blocked(self):
        app=FastAPI(); app.include_router(telegram.router, prefix='/api/v1')
        app.dependency_overrides[get_db]=lambda:self.db
        with TestClient(app) as client:
            r=client.post('/api/v1/telegram/links/verify',json={'token':self.generate()['token'],'telegram_user_id':'1234567','telegram_chat_id':'1234567'})
            self.assertEqual(r.status_code,401)
            self.assertEqual(client.post('/api/v1/telegram/webhook',json={}).status_code,403)

    def test_task_delivery_records_api_result_and_employee_acknowledges(self):
        # Use an employee with the CRM task-update grant; Telegram must not widen RBAC.
        self.role.name='IT Technician'; self.db.commit()
        self.verify(self.generate()['token'])
        task=Task(company_id=self.company.id, assigned_to_id=self.a.id,title='Isolated Telegram delivery',status='Assigned',priority='High')
        self.db.add(task); self.db.flush()
        item=service.enqueue_task_notification(self.db,task,'task.assigned'); self.db.commit()
        response=MagicMock(status=200)
        response.read.return_value=json.dumps({'ok':True,'result':{'message_id':42}}).encode()
        response.__enter__.return_value=response
        with patch.object(service.urllib.request,'urlopen',return_value=response):
            result=service.dispatch_outbox_notifications(self.db)
        self.assertEqual(result['sent'],1)
        self.db.refresh(item)
        self.assertEqual(item.payload['telegram_api_result']['message_id'],42)
        self.assertEqual(self.db.query(IntegrationLog).filter_by(status='Success').one().response_data['message_id'],42)
        self.assertIn('act:ack:'+str(task.id), json.dumps(item.reply_markup))
        result=service.execute_bot_action(self.db,'1234567','1234567','act:ack:'+str(task.id))
        self.assertTrue(result['success'],result)
        self.db.refresh(task)
        self.assertIsNotNone(task.acknowledged_at)
        self.assertNotEqual(task.status,'Completed')

    def test_http_200_ok_false_is_not_successful_delivery(self):
        self.verify(self.generate()['token'])
        task=Task(company_id=self.company.id,assigned_to_id=self.a.id,title='Failure',status='Assigned')
        self.db.add(task); self.db.flush()
        item=service.enqueue_task_notification(self.db,task,'task.assigned'); self.db.commit()
        response=MagicMock(status=200); response.read.return_value=b'{"ok":false,"error_code":400}'
        response.__enter__.return_value=response
        with patch.object(service.urllib.request,'urlopen',return_value=response): service.dispatch_outbox_notifications(self.db)
        self.assertNotEqual(item.status,'Sent')
        self.assertFalse(item.payload['telegram_api_result']['ok'])

if __name__=='__main__': unittest.main()
