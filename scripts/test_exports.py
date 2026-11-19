import urllib.request
import json
import os

body = json.dumps({'username': 'admin', 'password': 'Admin@123456'}).encode('utf-8')
req = urllib.request.Request('http://127.0.0.1:8000/api/v1/auth/login', data=body, headers={'Content-Type': 'application/json'}, method='POST')
with urllib.request.urlopen(req) as resp:
    token = json.loads(resp.read().decode())['data']['user']['token']

headers = {'Authorization': f'Bearer {token}'}

export_dir = 'scratch/exports_test'
os.makedirs(export_dir, exist_ok=True)

test_exports = [
    ('assets', 'csv'),
    ('assets', 'excel'),
    ('employees', 'csv'),
    ('employees', 'excel'),
    ('helpdesk', 'csv'),
    ('helpdesk', 'excel'),
    ('tasks', 'csv'),
    ('subscriptions', 'csv'),
]

results = []
for report_type, fmt in test_exports:
    url = f'http://127.0.0.1:8000/api/v1/reports/export?report_type={report_type}&format_type={fmt}'
    r = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            content_type = resp.headers.get('Content-Type')
            content_disp = resp.headers.get('Content-Disposition')
            data = resp.read()
            filename = f"{export_dir}/{report_type}.{('xlsx' if fmt == 'excel' else fmt)}"
            with open(filename, 'wb') as f:
                f.write(data)
            size = len(data)
            results.append({
                'report': report_type,
                'format': fmt,
                'status': resp.status,
                'size_bytes': size,
                'content_type': content_type,
                'filename': filename,
                'valid': size > 50
            })
            print(f"PASS: {report_type} ({fmt}) -> {size} bytes, type: {content_type}")
    except Exception as e:
        results.append({
            'report': report_type,
            'format': fmt,
            'error': str(e),
            'valid': False
        })
        print(f"FAIL: {report_type} ({fmt}) -> {e}")

print("\nSummary of export tests:", json.dumps(results, indent=2))
