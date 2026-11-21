import sqlite3, json

conn = sqlite3.connect('it_ops.db')
c = conn.cursor()
c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%workspace%'")
print("Workspace tables:", c.fetchall())

c.execute("SELECT * FROM workspace_preferences")
rows = c.fetchall()
print(f"Workspace preferences rows: {len(rows)}")
for r in rows:
    print(r)

conn.close()
