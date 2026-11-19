import sqlite3

db_path = 'C:/Users/Acodet/.gemini/antigravity/brain/679861f6-e7cc-414c-80ff-827632c96a59/scratch/live_runtime.db'
conn = sqlite3.connect(db_path)
for row in conn.execute("SELECT id, service_name, renewal_date FROM third_party_subscriptions WHERE renewal_date LIKE '% %'").fetchall():
    print("Dirty subscription date:", row)

# Clean up dirty dates
conn.execute("UPDATE third_party_subscriptions SET renewal_date = substr(renewal_date, 1, 10) WHERE renewal_date LIKE '% %'")
conn.commit()
print("Cleaned up dirty dates in third_party_subscriptions.")
