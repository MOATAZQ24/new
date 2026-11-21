# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Direct schema enhancement script for SQLite backend.
Creates missing tables and columns safely and idempotently.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "it_ops.db")

def run():
    print(f"Connecting to database: {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 1. employee_branch_assignments
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS employee_branch_assignments (
        id CHAR(32) PRIMARY KEY,
        employee_id CHAR(32) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        company_id CHAR(32) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        branch_id CHAR(32) NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        department_id CHAR(32) REFERENCES departments(id) ON DELETE SET NULL,
        manager_id CHAR(32) REFERENCES employees(id) ON DELETE SET NULL,
        role_name VARCHAR(100) DEFAULT 'Employee',
        job_title VARCHAR(255),
        section VARCHAR(100),
        team VARCHAR(100),
        start_date DATE,
        end_date DATE,
        is_primary BOOLEAN NOT NULL DEFAULT 0,
        status VARCHAR(50) NOT NULL DEFAULT 'Active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, company_id, branch_id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_emp_branch_assign_emp ON employee_branch_assignments(employee_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_emp_branch_assign_company ON employee_branch_assignments(company_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_emp_branch_assign_branch ON employee_branch_assignments(branch_id)")

    # Check if existing table needs columns added
    cursor.execute("PRAGMA table_info(employee_branch_assignments)")
    cols = {row[1] for row in cursor.fetchall()}
    for col_name, col_type in [
        ("manager_id", "CHAR(32) REFERENCES employees(id) ON DELETE SET NULL"),
        ("section", "VARCHAR(100)"),
        ("team", "VARCHAR(100)"),
        ("start_date", "DATE"),
        ("end_date", "DATE"),
    ]:
        if col_name not in cols:
            print(f"Adding column {col_name} to employee_branch_assignments...")
            cursor.execute(f"ALTER TABLE employee_branch_assignments ADD COLUMN {col_name} {col_type}")

    # 2. tasks
    cursor.execute("PRAGMA table_info(tasks)")
    task_cols = {row[1] for row in cursor.fetchall()}
    new_task_cols = [
        ("deadline_type", "VARCHAR(50) DEFAULT 'fixed_datetime'"),
        ("target_duration_minutes", "INTEGER"),
        ("deadline_at", "DATETIME"),
        ("escalated_at", "DATETIME"),
        ("escalation_level", "INTEGER DEFAULT 0"),
        ("is_broadcast", "BOOLEAN DEFAULT 0"),
        ("broadcast_mode", "VARCHAR(50)"),
        ("broadcast_group_id", "CHAR(32)"),
        ("is_accountable", "BOOLEAN DEFAULT 1"),
    ]
    for col_name, col_def in new_task_cols:
        if col_name not in task_cols:
            print(f"Adding column {col_name} to tasks...")
            cursor.execute(f"ALTER TABLE tasks ADD COLUMN {col_name} {col_def}")

    # 3. task_participants table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS task_participants (
        id CHAR(32) PRIMARY KEY,
        task_id CHAR(32) NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        employee_id CHAR(32) NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        role_type VARCHAR(50) NOT NULL DEFAULT 'collaborator',
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(task_id, employee_id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_task_participants_task_id ON task_participants(task_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_task_participants_employee_id ON task_participants(employee_id)")

    # 4. problem_records table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS problem_records (
        id CHAR(32) PRIMARY KEY,
        company_id CHAR(32) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        root_cause TEXT,
        workaround TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'Open',
        assigned_to_id CHAR(32) REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_problem_records_company_id ON problem_records(company_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_problem_records_status ON problem_records(status)")

    # 5. knowledge_articles table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS knowledge_articles (
        id CHAR(32) PRIMARY KEY,
        company_id CHAR(32) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL DEFAULT 'General',
        symptom TEXT NOT NULL,
        diagnostic_steps TEXT,
        resolution TEXT NOT NULL,
        is_published BOOLEAN NOT NULL DEFAULT 0,
        author_id CHAR(32) REFERENCES users(id) ON DELETE SET NULL,
        approved_by_id CHAR(32) REFERENCES users(id) ON DELETE SET NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_articles_company_id ON knowledge_articles(company_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_articles_category ON knowledge_articles(category)")
    cursor.execute("CREATE INDEX IF NOT EXISTS ix_knowledge_articles_published ON knowledge_articles(is_published)")

    # 6. helpdesk_tickets
    cursor.execute("PRAGMA table_info(helpdesk_tickets)")
    ticket_cols = {row[1] for row in cursor.fetchall()}
    new_ticket_cols = [
        ("ticket_type", "VARCHAR(50) DEFAULT 'Incident'"),
        ("tier", "VARCHAR(20) DEFAULT 'L1'"),
        ("sla_target_at", "DATETIME"),
        ("sla_paused_at", "DATETIME"),
        ("sla_paused_total_seconds", "INTEGER DEFAULT 0"),
        ("sla_status", "VARCHAR(50) DEFAULT 'Within_SLA'"),
        ("voice_note_url", "VARCHAR(512)"),
        ("reopened_count", "INTEGER DEFAULT 0"),
        ("problem_id", "CHAR(32) REFERENCES problem_records(id) ON DELETE SET NULL"),
    ]
    for col_name, col_def in new_ticket_cols:
        if col_name not in ticket_cols:
            print(f"Adding column {col_name} to helpdesk_tickets...")
            cursor.execute(f"ALTER TABLE helpdesk_tickets ADD COLUMN {col_name} {col_def}")

    conn.commit()
    conn.close()
    print("Schema enhancement completed successfully.")

if __name__ == "__main__":
    run()
