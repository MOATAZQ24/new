import sqlite3
import os

dbs = [
    "it_ops.db",
    "C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db"
]

for db_path in dbs:
    if not os.path.exists(db_path):
        continue
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cols = [c[1] for c in cur.execute("PRAGMA table_info(tasks)").fetchall()]
    print(f"=== Checking {db_path} ===")
    if "is_voice_task" not in cols:
        cur.execute("ALTER TABLE tasks ADD COLUMN is_voice_task BOOLEAN NOT NULL DEFAULT 0")
        print("  Added is_voice_task column")
    if "voice_note_url" not in cols:
        cur.execute("ALTER TABLE tasks ADD COLUMN voice_note_url VARCHAR(512)")
        print("  Added voice_note_url column")
    if "voice_note_duration" not in cols:
        cur.execute("ALTER TABLE tasks ADD COLUMN voice_note_duration INTEGER DEFAULT 0")
        print("  Added voice_note_duration column")
    conn.commit()
    conn.close()
    print(f"  Finished {db_path}")
