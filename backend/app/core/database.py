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
    from sqlalchemy import text
    with engine.connect() as conn:
        # Check SQLite or Postgres
        is_sqlite = engine.url.drivername.startswith("sqlite")
        
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
            ("tasks", "accepted_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "submitted_for_review_at", "DATETIME", "TIMESTAMP"),
            ("tasks", "reviewer_id", "CHAR(32)", "UUID"),
            ("tasks", "review_notes", "TEXT", "TEXT"),
            ("tasks", "rework_count", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("notifications", "priority", "VARCHAR(50) DEFAULT 'Normal'", "VARCHAR(50) DEFAULT 'Normal'"),
        ]

        for table, col, sqlite_type, pg_type in columns:
            try:
                if is_sqlite:
                    # check table exists
                    tbl_check = conn.execute(text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")).fetchone()
                    if not tbl_check:
                        continue
                    cols = [row[1] for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()]
                    if col not in cols:
                        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {sqlite_type}"))
                        conn.commit()
                else:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {pg_type}"))
                    conn.commit()
            except Exception:
                pass


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
