# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import urllib.request
import json

body = json.dumps({'username': 'admin', 'password': 'Admin@123456'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/login', data=body, headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode())
    token = res['data']['user']['token']
    active_company = res['data']['user']['active_company_id']
    companies = res['data']['user']['companies']

print(f"Logged in as Super Admin. Total companies in user profile: {len(companies)}")
print(f"Active company ID: {active_company}")

# 1. Global dashboard (no company filter)
req_all = urllib.request.Request('http://127.0.0.1:8000/api/v1/dashboard', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req_all) as resp:
    d_all = json.loads(resp.read().decode())['data']
    print("\n--- Global Dashboard Metrics ---")
    print(f"Total Companies: {d_all['total_companies']}")
    print(f"Total Branches: {d_all['total_branches']}")
    print(f"Total Employees: {d_all['total_employees']} (Active: {d_all['active_employees']}, Inactive: {d_all['inactive_employees']})")
    print(f"Total Assets: {d_all['total_assets']} (Assigned: {d_all['assigned_assets']}, Available: {d_all['available_assets']}, Maintenance: {d_all['maintenance_assets']})")
    print(f"Total Tickets: {d_all['total_tickets']} (Open: {d_all['open_tickets']}, Closed: {d_all['closed_tickets']})")
    print(f"Total Tasks: {d_all['open_tasks']} open, {d_all['overdue_tasks']} overdue")
    print(f"Active Subscriptions: {d_all['active_subscriptions']}")

# 2. Scoped dashboard (active company filter)
req_scoped = urllib.request.Request(f'http://127.0.0.1:8000/api/v1/dashboard?company_id={active_company}', headers={'Authorization': f'Bearer {token}'})
with urllib.request.urlopen(req_scoped) as resp:
    d_scoped = json.loads(resp.read().decode())['data']
    print(f"\n--- Scoped Dashboard Metrics (Company {active_company}) ---")
    print(f"Total Branches: {d_scoped['total_branches']}")
    print(f"Total Employees: {d_scoped['total_employees']} (Active: {d_scoped['active_employees']}, Inactive: {d_scoped['inactive_employees']})")
    print(f"Total Assets: {d_scoped['total_assets']}")
    print(f"Total Tickets: {d_scoped['total_tickets']}")
    print(f"Total Subscriptions: {d_scoped['active_subscriptions']}")
