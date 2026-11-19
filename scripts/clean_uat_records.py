import sqlite3

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
c = conn.cursor()

tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").fetchall()]
counts = {}
for tbl in tables:
    cnt = c.execute(f"SELECT count(*) FROM {tbl}").fetchone()[0]
    counts[tbl] = cnt

print("Database table row counts:")
for t, cnt in sorted(counts.items()):
    print(f"  {t}: {cnt}")
