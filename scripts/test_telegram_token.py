import sqlite3
import json
import urllib.request

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()
cfg = c.execute("SELECT config_data FROM integration_configs WHERE service_name='telegram'").fetchone()

if not cfg or not cfg[0]:
    print("No telegram config found!")
    exit(1)

data = json.loads(cfg[0])
bot_token = data.get("bot_token")
print(f"Bot token exists: {bool(bot_token)}, length: {len(bot_token) if bot_token else 0}")

if not bot_token:
    print("Bot token is empty!")
    exit(1)

url = f"https://api.telegram.org/bot{bot_token}/getMe"
print("Testing request to Telegram API getMe...")
try:
    req = urllib.request.Request(url, headers={"User-Agent": "InvestorGateBot/3.0"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        res = json.loads(resp.read().decode('utf-8'))
        print("Telegram getMe SUCCESS:")
        print(json.dumps(res, indent=2, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(f"Telegram HTTP Error {e.code}: {e.read().decode('utf-8')}")
except Exception as e:
    print(f"Telegram Network/General Error: {e}")
