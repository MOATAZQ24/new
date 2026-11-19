import urllib.request
import json

body = json.dumps({'username': 'admin', 'password': 'Admin@123456'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/login', data=body, headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode())
    token = res['data']['user']['token']
    active_cid = res['data']['user']['active_company_id']

headers = {'Authorization': f'Bearer {token}'}

def get(path):
    r = urllib.request.Request(f'http://127.0.0.1:8000{path}', headers=headers)
    with urllib.request.urlopen(r) as resp:
        return json.loads(resp.read().decode())

rep = get('/api/v1/reports/overview')
dash = get('/api/v1/dashboard')
emp_sum = get('/api/v1/employees/summary')
tix = get('/api/v1/tickets?per_page=100')

print("=== Reports Overview ===")
print("Reports ticket total:", rep.get('data', {}).get('tickets', {}).get('total'))
print("Reports employee total:", rep.get('data', {}).get('employees', {}).get('total'))

print("\n=== Dashboard Overview ===")
print("Dashboard ticket total:", dash.get('data', {}).get('total_tickets'))
print("Dashboard employee total:", dash.get('data', {}).get('total_employees'))

print("\n=== Employees Summary ===")
print("Employees summary total:", emp_sum.get('data', {}).get('total'))

print("\n=== Tickets List (total count) ===")
print("Tickets pagination total:", tix.get('pagination', {}).get('total'))
