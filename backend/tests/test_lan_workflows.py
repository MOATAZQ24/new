"""HTTP regression checks on an isolated database; never touch live records or Telegram."""
import secrets
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.models import Base
from app.models.company import Company
from app.models.user import User, Employee, Role, CompanyMembership
from app.core.database import get_db
from app.core.security import hash_password
from app.api.v1.endpoints import auth, tasks, notifications


class LanWorkflows(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.company = Company(company_name_ar='اختبار', company_name_en='Test', company_code='LAN-TEST')
        self.other = Company(company_name_ar='أخرى', company_name_en='Other', company_code='LAN-OTHER')
        manager_role, employee_role = Role(name='IT Manager'), Role(name='Employee')
        self.db.add_all([self.company, self.other, manager_role, employee_role]); self.db.flush()
        self.employee = Employee(company_id=self.company.id, employee_number='LAN-1', full_name='Test employee')
        self.db.add(self.employee); self.db.flush()
        self.password = secrets.token_urlsafe(24)
        self.manager = User(username='lan-manager', email='manager@example.test', password_hash=hash_password(self.password))
        self.user = User(username='lan-employee', email='employee@example.test', employee_id=self.employee.id, password_hash=hash_password(self.password))
        self.db.add_all([self.manager, self.user]); self.db.flush()
        self.db.add_all([
            CompanyMembership(user_id=self.manager.id, company_id=self.company.id, role_id=manager_role.id, is_default=True),
            CompanyMembership(user_id=self.user.id, company_id=self.company.id, role_id=employee_role.id, is_default=True),
        ]); self.db.commit()
        app = FastAPI()
        for router in [auth.router, tasks.router, notifications.router]: app.include_router(router, prefix='/api/v1')
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app, base_url='http://192.168.8.137:3000')
        self.headers = {'X-Company-ID': str(self.company.id)}
        self.telegram_patch = patch.object(tasks, 'enqueue_task_notification')
        self.telegram_patch.start()

    def tearDown(self):
        self.telegram_patch.stop(); self.client.close(); self.db.close(); self.engine.dispose()

    def login(self, username):
        r = self.client.post('/api/v1/auth/login', json={'username': username, 'password': self.password})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertIn('HttpOnly', r.headers['set-cookie'])
        self.assertIn('SameSite=lax', r.headers['set-cookie'])
        self.assertNotIn('Domain=', r.headers['set-cookie'])

    def test_login_task_assignment_my_tasks_notifications_and_logout(self):
        self.assertEqual(self.client.get('/api/v1/tasks').status_code, 401)
        self.login(self.manager.username)
        payload = {'company_id': str(self.company.id), 'assigned_to_id': str(self.employee.id), 'title': 'LAN regression task', 'status': 'Assigned', 'priority': 'High', 'start_date': '2026-11-14', 'due_date': '2026-11-15'}
        created = self.client.post('/api/v1/tasks', headers=self.headers, json=payload)
        self.assertEqual(created.status_code, 200, created.text)
        task_id = created.json()['data']['id']
        # New query after expiration proves data is stored, rather than only in ORM memory.
        self.db.expire_all()
        detail = self.client.get('/api/v1/tasks/' + task_id, headers=self.headers)
        self.assertEqual(detail.json()['data']['assigned_to_id'], str(self.employee.id))
        self.assertEqual(detail.json()['data']['due_date'], payload['due_date'])
        self.assertEqual(self.client.post('/api/v1/auth/logout').status_code, 200)
        self.assertEqual(self.client.get('/api/v1/auth/me').status_code, 401)
        self.login(self.user.username)
        mine = self.client.get('/api/v1/tasks?filter_mode=my', headers=self.headers)
        self.assertEqual(mine.status_code, 200, mine.text)
        self.assertEqual([t['id'] for t in mine.json()['data']], [task_id])
        messages = self.client.get('/api/v1/notifications').json()['data']
        self.assertTrue(any(n['related_record_id'] == task_id for n in messages))
        self.assertEqual(self.client.post('/api/v1/tasks', headers=self.headers, json=payload).status_code, 403)
        self.assertEqual(self.client.get('/api/v1/tasks', headers={'X-Company-ID': str(self.other.id)}).status_code, 403)
        self.assertEqual(self.client.post('/api/v1/tasks/' + task_id + '/accept', headers=self.headers).status_code, 200)

    def test_invalid_uuid_and_date_return_field_validation(self):
        self.login(self.manager.username)
        result = self.client.post('/api/v1/tasks', headers=self.headers, json={'title':'Invalid', 'assigned_to_id':'invalid', 'due_date':'not-a-date'})
        self.assertEqual(result.status_code, 422, result.text)
        fields = [e['loc'][-1] for e in result.json()['detail']]
        self.assertIn('assigned_to_id', fields)
        self.assertIn('due_date', fields)


if __name__ == '__main__': unittest.main(verbosity=2)
