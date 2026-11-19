import sqlite3

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
for tbl in ['helpdesk_tickets', 'tasks', 'third_party_subscriptions', 'asset_custody', 'employees']:
    try:
        cols = [c[1] for c in conn.execute(f"PRAGMA table_info({tbl})").fetchall()]
        conditions = []
        if 'title' in cols:
            conditions.append("title LIKE '%UAT%'")
        if 'full_name' in cols:
            conditions.append("full_name LIKE '%UAT%'")
        if 'service_name' in cols:
            conditions.append("service_name LIKE '%UAT%'")
        if conditions:
            where_clause = " OR ".join(conditions)
            cnt = conn.execute(f"SELECT count(*) FROM {tbl} WHERE {where_clause}").fetchone()[0]
            print(f"{tbl}: {cnt} UAT rows found")
        else:
            print(f"{tbl}: no searchable columns")
    except Exception as e:
        print(f"{tbl} error: {e}")
