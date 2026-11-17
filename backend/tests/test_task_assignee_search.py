"""Authenticated HTTP assignment regressions, isolated SQLite and mocked delivery."""
import os
import sys

_HERE = os.path.abspath(os.path.dirname(__file__))
_BACKEND = os.path.abspath(os.path.join(_HERE, '..'))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

os.environ['DATABASE_URL'] = 'sqlite://'
import unittest
from datetime import datetime, timedelta
from unittest.mock import patch
from sqlalchemy import event
import test_security_regressions as fixtures
from app.api.v1.endpoints import tasks
from app.models.user import Employee, User, CompanyMembership
from app.models.telegram import TelegramUserLink, NotificationOutbox
from app.models.task import Task
from app.services.task_assignment import normalize_name


class AssignmentSearchTests(unittest.TestCase):
    make_user = fixtures.SecurityRegressions.make_user
    tearDown = fixtures.SecurityRegressions.tearDown

    def setUp(self):
        fixtures.SecurityRegressions.setUp(self)
        self.app.include_router(tasks.router, prefix='/api/v1')
        self.ea.full_name = 'أَحْمَد   إِبراهيم آل سالم'
        self.next_emp.full_name = 'Ahmed Ibrahim Smith'
        self.ea.job_title = 'مهندس شبكات'
        self.db.add(TelegramUserLink(employee_id=self.ea.id, company_id=self.a.id, verification_token='assignment-test-only', token_expires_at=datetime.utcnow()+timedelta(hours=1), telegram_user_id='11223344', telegram_chat_id='11223344', is_verified=True))
        self.db.commit()

    def lookup(self, **params):
        return self.client.get('/api/v1/tasks/assignees', params=params, headers=self.headers)

    def test_assignee_search_is_not_intercepted_as_a_task_uuid(self):
        """Regression: literal 'assignees' must never become path.task_id."""
        from starlette.routing import Match
        task_scope = {'type': 'http', 'method': 'GET', 'path': '/tasks/assignees', 'root_path': ''}
        task_matches = [r for r in tasks.router.routes if r.matches(task_scope)[0] == Match.FULL]
        self.assertTrue(task_matches)
        match_route = task_matches[0]
        endpoint = getattr(match_route, 'endpoint', None)
        if endpoint is None and hasattr(match_route, 'original_router'):
            endpoint = getattr(match_route.original_router.routes[0], 'endpoint', None)
        self.assertEqual(endpoint, tasks.list_task_assignees)
        for search in ('', 'احمد', 'احمد ابراهيم', 'Ahmed Smith'):
            response = self.lookup(search=search, limit=15)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertNotIn('detail', response.json())
        hydrated = self.lookup(selected_id=str(self.ea.id))
        self.assertEqual(hydrated.status_code, 200, hydrated.text)
        self.assertEqual(hydrated.json()['data'][0]['id'], str(self.ea.id))
        invalid = self.client.get('/api/v1/tasks/not-a-uuid', headers=self.headers)
        self.assertEqual(invalid.status_code, 422)
        self.assertIn(['path', 'task_id'], [error['loc'] for error in invalid.json()['detail']])

    def test_arabic_variants_diacritics_partial_and_multiple_terms(self):
        for search in ['احم', 'احمد ابرا', '  آل   احمد ', 'إبراهيم سالم', 'أحمد', 'اِبرا']:
            response = self.lookup(search=search)
            self.assertEqual(response.status_code, 200, response.text)
            self.assertIn(str(self.ea.id), [e['id'] for e in response.json()['data']], search)
        self.assertEqual(normalize_name(' أَحْمَد\tإبراهيم '), 'احمد ابراهيم')

    def test_english_case_partial_multiword_empty_and_literal_wildcards(self):
        self.assertEqual(self.lookup(search='SMI ahm').json()['data'][0]['id'], str(self.next_emp.id))
        for query in ['no-such-person', '%', '_']:
            self.assertEqual(self.lookup(search=query).json()['data'], [])

    def test_duplicate_names_use_distinct_ids_and_telegram_is_not_required(self):
        self.next_emp.full_name = self.ea.full_name; self.db.commit()
        data=self.lookup(search='احمد').json()['data']
        self.assertEqual(len(data), 2)
        self.assertEqual(len({e['id'] for e in data}), 2)
        self.assertEqual({e['is_telegram_linked'] for e in data}, {True, False})
        self.assertTrue(all(e['assignable'] for e in data))

    def test_inactive_employee_or_account_or_membership_not_assignable(self):
        for employee_status, user_status, membership_status in [('Inactive','Active','Active'), ('Active','Inactive','Active'), ('Active','Active','Inactive')]:
            with self.subTest(employee_status=employee_status, user_status=user_status, membership_status=membership_status):
                self.ea.employment_status=employee_status
                user=self.db.query(User).filter_by(employee_id=self.ea.id).first()
                if not user:
                    user=self.make_user('assignee', self.a, self.employee_role); user.employee_id=self.ea.id
                    self.db.flush()
                user.account_status=user_status
                self.db.query(CompanyMembership).filter_by(user_id=user.id).one().status=membership_status
                self.db.commit()
                self.assertNotIn(str(self.ea.id), [e['id'] for e in self.lookup(search='احمد').json()['data']])
                current=self.lookup(selected_id=str(self.ea.id)).json()['data'][0]
                self.assertFalse(current['assignable'])
                result=self.client.post('/api/v1/tasks', headers=self.headers, json={'title':'Invalid assignee','assigned_to_id':str(self.ea.id),'notify_telegram':False})
                self.assertEqual(result.status_code,400)
        self.assertEqual(self.db.query(Task).count(),0)

    def test_rbac_and_cross_company_search_hydration_create_update(self):
        self.assertNotIn(str(self.eb.id), [e['id'] for e in self.lookup().json()['data']])
        self.assertEqual(self.lookup(selected_id=str(self.eb.id)).json()['data'], [])
        denied=self.client.get('/api/v1/tasks/assignees', headers={'Authorization':'Bearer worker','X-Company-ID':str(self.a.id)})
        self.assertEqual(denied.status_code,403)
        self.assertEqual(self.client.get('/api/v1/tasks/assignees').status_code,401)
        for payload in [{'company_id':str(self.b.id)}, {'assigned_to_id':str(self.eb.id)}]:
            response=self.client.post('/api/v1/tasks',headers=self.headers,json={'title':'Denied',**payload})
            self.assertIn(response.status_code,(400,403))
        task=Task(company_id=self.a.id,title='Assignment',assigned_to_id=self.ea.id)
        self.db.add(task);self.db.commit()
        response=self.client.put('/api/v1/tasks/'+str(task.id),headers=self.headers,json={'assigned_to_id':str(self.eb.id)})
        self.assertEqual(response.status_code,400)
        self.db.refresh(task); self.assertEqual(task.assigned_to_id,self.ea.id)

    def test_create_edit_persistence_audit_and_telegram_dispatch_contract(self):
        with patch('app.api.v1.endpoints.tasks.enqueue_task_notification', return_value=None) as enqueue:
            response=self.client.post('/api/v1/tasks',headers=self.headers,json={'title':'Assignment workflow','assigned_to_id':str(self.ea.id),'notify_telegram':True})
            self.assertEqual(response.status_code,200,response.text)
            enqueue.assert_called_once(); self.assertEqual(enqueue.call_args.kwargs['event_type'],'task.assigned')
            task_id=response.json()['data']['id']
            response=self.client.put('/api/v1/tasks/'+task_id,headers=self.headers,json={'assigned_to_id':str(self.next_emp.id)})
            self.assertEqual(response.status_code,200,response.text)
            self.assertEqual(enqueue.call_args.kwargs['event_type'],'task.reassigned')
        record=self.client.get('/api/v1/tasks/'+task_id,headers=self.headers).json()['data']
        self.assertEqual(record['assigned_to_id'],str(self.next_emp.id))
        self.assertEqual(record['assigned_to_name'],self.next_emp.full_name)
        from app.models.audit import AuditLog
        self.assertEqual(self.db.query(AuditLog).filter(AuditLog.resource_type=='Task',AuditLog.resource_id==task_id).count(),2)
        response=self.client.put('/api/v1/tasks/'+task_id,headers=self.headers,json={'assigned_to_id':None})
        self.assertEqual(response.status_code,200)
        self.assertIsNone(self.client.get('/api/v1/tasks/'+task_id,headers=self.headers).json()['data']['assigned_to_id'])

    def test_unchanged_assignment_preserves_notification_rules(self):
        task=Task(company_id=self.a.id,title='Unchanged',assigned_to_id=self.ea.id)
        self.db.add(task);self.db.commit()
        with patch('app.api.v1.endpoints.tasks.enqueue_task_notification') as enqueue:
            self.assertEqual(self.client.put('/api/v1/tasks/'+str(task.id),headers=self.headers,json={'assigned_to_id':str(self.ea.id),'title':'Edited'}).status_code,200)
            enqueue.assert_not_called()

    def test_real_outbox_linked_unlinked_and_notification_opt_out(self):
        with patch('app.services.telegram_service.dispatch_outbox_notifications',return_value={'sent':0}):
            for employee, notify in [(self.ea,True),(self.next_emp,True),(self.ea,False)]:
                response=self.client.post('/api/v1/tasks',headers=self.headers,json={'title':'Outbox regression','assigned_to_id':str(employee.id),'notify_telegram':notify})
                self.assertEqual(response.status_code,200,response.text)
        entries=self.db.query(NotificationOutbox).all()
        self.assertEqual(len(entries),2)
        linked=next(entry for entry in entries if entry.payload['employee_id']==str(self.ea.id))
        unlinked=next(entry for entry in entries if entry.payload['employee_id']==str(self.next_emp.id))
        self.assertEqual(linked.recipient_chat_id,'11223344')
        self.assertEqual(linked.status,'Pending')
        self.assertEqual(unlinked.status,'Skipped (Unlinked)')

    def test_large_list_is_bounded_and_queries_do_not_grow_with_results(self):
        self.db.add_all([Employee(company_id=self.a.id, employee_number=f'PERF-{i}',full_name=f'Performance Employee {i}') for i in range(100)])
        self.db.commit()
        statements=[]
        def capture(*args): statements.append(args[2])
        event.listen(self.engine,'before_cursor_execute',capture)
        try: response=self.lookup(search='employee performance',limit=15)
        finally: event.remove(self.engine,'before_cursor_execute',capture)
        self.assertEqual(len(response.json()['data']),15)
        self.assertLess(len(statements),12,statements)
        self.assertEqual(self.lookup(limit=31).status_code,422)
        self.assertEqual(self.lookup(search='x'*161).status_code,422)


if __name__ == '__main__':
    unittest.main()
