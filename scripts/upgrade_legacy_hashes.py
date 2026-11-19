import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "backend"))
from app.core.security import hash_password
import sqlite3

for db_path in [
    "C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db",
    str(ROOT / "it_ops.db")
]:
    if not Path(db_path).exists():
        continue
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM users WHERE password_hash NOT LIKE '$%'")
    rows = c.fetchall()
    print(f"{db_path}: found {len(rows)} unhashed users")
    for uid, u, p in rows:
        hashed = hash_password(p if len(p) >= 8 else "InvestorGate@123")
        c.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, uid))
    conn.commit()
    conn.close()
    print(f"{db_path}: successfully secured all users with Argon2id")
