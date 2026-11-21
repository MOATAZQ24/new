# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""
Secure legacy password upgrade script for Investor Gate OS.
Generates unique cryptographically secure random entropy per account,
hashes with Argon2id, and flags must_change_password=True.
Never uses shared or predictable fallback passwords.
"""
import sys
import secrets
from pathlib import Path
import sqlite3

ROOT = Path(__file__).resolve().parents[1]
sys.path.append(str(ROOT / "backend"))
from app.core.security import hash_password

TARGET_DBS = [
    "C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db",
    str(ROOT / "it_ops.db")
]

for db_path in TARGET_DBS:
    if not Path(db_path).exists():
        continue
    conn = sqlite3.connect(db_path)
    c = conn.cursor()
    c.execute("SELECT id, username, password_hash FROM users WHERE password_hash NOT LIKE '$%'")
    unhashed_rows = c.fetchall()
    print(f"{db_path}: found {len(unhashed_rows)} unhashed users")
    
    for uid, u, p in unhashed_rows:
        if p and len(p) >= 12 and not p.startswith("InvestorGate"):
            # Strong existing plain password in transition
            hashed = hash_password(p)
            c.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", (hashed, uid))
        else:
            # Insecure / legacy fallback: generate unique random entropy and enforce reset
            random_pw = secrets.token_urlsafe(32)
            hashed = hash_password(random_pw)
            c.execute("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", (hashed, uid))
            
    conn.commit()
    conn.close()
    print(f"{db_path}: successfully secured users with Argon2id and set must_change_password=1")
