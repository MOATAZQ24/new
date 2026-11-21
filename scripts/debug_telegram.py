# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

import sqlite3
import json
import urllib.request

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

# Check failed outbox rows
errors = c.execute("SELECT DISTINCT last_error FROM notification_outbox WHERE status='Failed'").fetchall()
print("Distinct failed errors:", errors)
counts = c.execute("SELECT status, count(*) FROM notification_outbox GROUP BY status").fetchall()
print("Status counts in notification_outbox:", counts)

# Check telegram config
cfg = c.execute("SELECT service_name, is_enabled, status, config_data, last_error FROM integration_configs WHERE service_name='telegram'").fetchone()
print("\nTelegram Integration Config:")
print(f"  Service: {cfg[0]}, Enabled: {cfg[1]}, Status: {cfg[2]}")
print(f"  Last Error: {cfg[4]}")
if cfg[3]:
    try:
        data = json.loads(cfg[3])
        # Mask sensitive bot_token
        if 'bot_token' in data and data['bot_token']:
            data['bot_token'] = data['bot_token'][:6] + '...' + data['bot_token'][-4:]
        print(f"  Config Data: {data}")
    except Exception as e:
        print(f"  Config Data raw: {cfg[3]}")

# Check telegram worker status file if any
import os
for f in ['.telegram_worker_status.json', '.telegram_poller.lock', '.telegram_offset.json']:
    if os.path.exists(f):
        print(f"\nFile {f} exists:")
        try:
            with open(f, 'r') as fp:
                print(fp.read())
        except Exception as e:
            print(f"  Error reading {f}: {e}")
    else:
        print(f"\nFile {f} does NOT exist.")
