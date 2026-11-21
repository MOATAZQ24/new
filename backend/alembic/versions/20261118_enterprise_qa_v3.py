# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Enterprise 3.0 QA completion: employee_subscriptions M:N table, subscription branch/seats, canonical internal companies hierarchy."""

from alembic import op
import sqlalchemy as sa


revision = "20261118_enterprise_qa_v3"
down_revision = "20261117_enterprise_v3"
branch_labels = None
depends_on = None


def _add_column_if_missing(inspector, table: str, column: sa.Column) -> None:
    if table not in inspector.get_table_names():
        return
    existing_cols = {c["name"] for c in inspector.get_columns(table)}
    if column.name not in existing_cols:
        op.add_column(table, column)


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    is_sqlite = bind.dialect.name == "sqlite"
    uuid_type = sa.String(length=36) if is_sqlite else sa.dialects.postgresql.UUID(as_uuid=True)

    from app.core.database import Base
    import app.models  # noqa: F401

    existing_tables = set(inspector.get_table_names())
    if "employee_subscriptions" not in existing_tables and "employee_subscriptions" in Base.metadata.tables:
        Base.metadata.tables["employee_subscriptions"].create(bind=bind, checkfirst=True)

    inspector = sa.inspect(bind)
    for tbl, col in (
        ("companies", sa.Column("company_type", sa.String(length=50), nullable=False, server_default="Internal")),
        ("companies", sa.Column("parent_company_id", uuid_type, nullable=True)),
        ("third_party_subscriptions", sa.Column("branch_id", uuid_type, nullable=True)),
        ("third_party_subscriptions", sa.Column("seat_limit", sa.Integer(), nullable=False, server_default="1")),
    ):
        _add_column_if_missing(inspector, tbl, col)

    from sqlalchemy.orm import Session
    from app.services.enterprise_service import ensure_canonical_internal_companies

    session = Session(bind=bind)
    try:
        ensure_canonical_internal_companies(session)
        session.commit()
    finally:
        session.close()


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "employee_subscriptions" in inspector.get_table_names():
        op.drop_table("employee_subscriptions")
