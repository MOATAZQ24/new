import sqlite3

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

rows = c.execute("SELECT id, recipient_chat_id, status, created_at, sent_at, last_error FROM notification_outbox WHERE recipient_chat_id='5451561520' ORDER BY created_at DESC LIMIT 10").fetchall()
print("Messages to 5451561520:")
for r in rows:
    print(r)
