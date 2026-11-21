import sqlite3, json

conn = sqlite3.connect('it_ops.db')
c = conn.cursor()

c.execute('SELECT id, configuration FROM workspace_preferences')
rows = c.fetchall()
for row_id, raw_cfg in rows:
    cfg = json.loads(raw_cfg) if raw_cfg else {}
    if 'appearance' in cfg:
        cfg['appearance']['primary'] = '#131127'
        cfg['appearance']['secondary'] = '#7C3AED'
        cfg['appearance']['accent'] = '#8B5CF6'
        cfg['appearance']['background'] = '#F7F8FC'
        cfg['appearance']['surface'] = '#FFFFFF'
        c.execute('UPDATE workspace_preferences SET configuration = ? WHERE id = ?', (json.dumps(cfg), row_id))
        print('Updated workspace_preferences row:', row_id)

try:
    c.execute("""
        UPDATE user_workspace_preferences 
        SET primary_color = '#131127', secondary_color = '#7C3AED', accent_color = '#8B5CF6', background_color = '#F7F8FC', surface_color = '#FFFFFF'
    """)
    print('Updated user_workspace_preferences rows:', c.rowcount)
except Exception as e:
    print('user_workspace_preferences update note:', e)

conn.commit()
conn.close()
print('Database appearance updated to Royal Purple successfully!')
