# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.core.config import settings
from app.models.base import Base

db_url = settings.DATABASE_URL
if db_url.startswith("postgresql+asyncpg://"):
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

connect_args = {}
engine_kwargs = {}

if db_url.startswith("sqlite"):
    connect_args["check_same_thread"] = False
else:
    engine_kwargs["pool_pre_ping"] = True
    engine_kwargs["pool_size"] = 10
    engine_kwargs["max_overflow"] = 20

engine = create_engine(
    db_url,
    connect_args=connect_args,
    echo=False,
    **engine_kwargs
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def _migrate_columns():
    """Ensure newly added columns exist in existing SQLite/Postgres tables without breaking data."""
    from sqlalchemy import inspect, text
    with engine.connect() as conn:
        is_sqlite = engine.url.drivername.startswith("sqlite")
        existing_tables = set(inspect(conn).get_table_names())
        if not existing_tables:
            return
        
        # columns to add: (table, column, col_type_sqlite, col_type_pg)
        columns = [
            ("users", "must_change_password", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("users", "is_deleted", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("company_memberships", "branch_id", "CHAR(32)", "UUID"),
            ("company_memberships", "status", "VARCHAR(50) DEFAULT 'Active'", "VARCHAR(50) DEFAULT 'Active'"),
            ("company_memberships", "assigned_by", "CHAR(32)", "UUID"),
            ("company_memberships", "assigned_at", "DATETIME", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"),
            ("digital_assets", "recovery_email", "VARCHAR(255)", "VARCHAR(255)"),
            ("digital_assets", "two_factor_method", "VARCHAR(100) DEFAULT 'Authenticator App (TOTP)'", "VARCHAR(100) DEFAULT 'Authenticator App (TOTP)'"),
            ("digital_assets", "two_factor_phone", "VARCHAR(50)", "VARCHAR(50)"),
            ("digital_assets", "domain_registrar", "VARCHAR(100)", "VARCHAR(100)"),
            ("digital_assets", "nameservers", "VARCHAR(255)", "VARCHAR(255)"),
            ("digital_assets", "subscription_tier", "VARCHAR(100)", "VARCHAR(100)"),
            ("digital_assets", "payment_method", "VARCHAR(100)", "VARCHAR(100)"),
            ("tasks", "is_blocked", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("tasks", "blocker_reason", "TEXT", "TEXT"),
            ("tasks", "blocked_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "unblocked_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "acknowledged_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "accepted_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "submitted_for_review_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "reviewer_id", "CHAR(32)", "UUID"),
            ("tasks", "review_notes", "TEXT", "TEXT"),
            ("tasks", "rework_count", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("notifications", "priority", "VARCHAR(50) DEFAULT 'Normal'", "VARCHAR(50) DEFAULT 'Normal'"),
            ("telegram_user_links", "notifications_enabled", "BOOLEAN DEFAULT 1", "BOOLEAN DEFAULT TRUE"),
            ("telegram_user_links", "allowed_modules", "TEXT", "JSONB"),
            ("telegram_user_links", "notification_preferences", "TEXT", "JSONB"),
            ("telegram_user_links", "data_scope", "VARCHAR(50) DEFAULT 'Self'", "VARCHAR(50) DEFAULT 'Self'"),
            ("employees", "manager_id", "CHAR(32)", "UUID"),
            ("employees", "hire_date", "DATE", "DATE"),
            ("employees", "employment_type", "VARCHAR(50) DEFAULT 'Full-Time'", "VARCHAR(50) DEFAULT 'Full-Time'"),
            ("employees", "work_location", "VARCHAR(255)", "VARCHAR(255)"),
            ("employees", "avatar_url", "VARCHAR(512)", "VARCHAR(512)"),
            ("employees", "person_id", "CHAR(32)", "UUID"),
            ("branches", "physical_branch_id", "CHAR(32)", "UUID"),
            ("tasks", "project_id", "CHAR(32)", "UUID"),
            ("technical_assets", "asset_category", "VARCHAR(50) DEFAULT 'IT'", "VARCHAR(50) DEFAULT 'IT'"),
            ("companies", "company_type", "VARCHAR(50) DEFAULT 'Internal'", "VARCHAR(50) DEFAULT 'Internal'"),
            ("companies", "parent_company_id", "CHAR(32)", "UUID"),
            ("third_party_subscriptions", "branch_id", "CHAR(32)", "UUID"),
            ("third_party_subscriptions", "seat_limit", "INTEGER DEFAULT 1", "INTEGER DEFAULT 1"),
            ("helpdesk_tickets", "catalog_item_id", "CHAR(32)", "UUID"),
            ("helpdesk_tickets", "custom_fields_data", "TEXT", "JSON"),
            ("helpdesk_tickets", "current_approval_stage", "VARCHAR(100)", "VARCHAR(100)"),
            ("helpdesk_tickets", "approval_status", "VARCHAR(50) DEFAULT 'None'", "VARCHAR(50) DEFAULT 'None'"),
            ("helpdesk_tickets", "first_response_at", "DATETIME", "TIMESTAMP"),
            ("helpdesk_tickets", "escalated_at", "DATETIME", "TIMESTAMP"),
            ("helpdesk_tickets", "team_id", "CHAR(32)", "UUID"),
            ("helpdesk_tickets", "category_id", "CHAR(32)", "UUID"),
            ("helpdesk_tickets", "sla_policy_id", "CHAR(32)", "UUID"),
            ("helpdesk_tickets", "first_response_due_at", "DATETIME", "TIMESTAMP"),
            ("helpdesk_tickets", "resolution_due_at", "DATETIME", "TIMESTAMP"),
            ("helpdesk_tickets", "sla_state", "VARCHAR(20) DEFAULT 'ok'", "VARCHAR(20) DEFAULT 'ok'"),
            ("helpdesk_tickets", "merged_into_ticket_id", "CHAR(32)", "UUID"),
            ("helpdesk_tickets", "require_tasks_done_to_close", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("sla_policies", "business_hours", "TEXT", "JSON"),
            ("sla_policies", "is_default", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("sla_policies", "escalate_on_breach", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("sla_policies", "bump_priority_on_breach", "BOOLEAN DEFAULT 0", "BOOLEAN DEFAULT FALSE"),
            ("tasks", "team_id", "CHAR(32)", "UUID"),
            ("tasks", "assignee_id", "CHAR(32)", "UUID"),
            ("tasks", "requester_id", "CHAR(32)", "UUID"),
            ("tasks", "sla_policy_id", "CHAR(32)", "UUID"),
            ("tasks", "parent_task_id", "CHAR(32)", "UUID"),
            ("tasks", "first_response_due_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "resolution_due_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "sla_state", "VARCHAR(20) DEFAULT 'ok'", "VARCHAR(20) DEFAULT 'ok'"),
        ]

        for table, col, sqlite_type, pg_type in columns:
            if table not in existing_tables:
                continue
            try:
                if is_sqlite:
                    cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]
                    if col not in cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {sqlite_type}"))
                        conn.commit()
                else:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {pg_type}"))
                    conn.commit()
            except Exception as exc:
                conn.rollback()
                raise RuntimeError(
                    f"Schema migration failed for {table}.{col}; startup aborted"
                ) from exc


_migrate_columns()


def init_db():
    """Create all tables if they don't exist."""
    import app.models  # noqa: F401 - Ensure all models are registered
    Base.metadata.create_all(bind=engine)
    _migrate_columns()


def get_db():
    """FastAPI dependency for database session."""
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
