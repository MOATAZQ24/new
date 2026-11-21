# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Add is_deleted and deleted_at to employees table for reversible soft deletion and archiving."""

from alembic import op
import sqlalchemy as sa


revision = "20261119_employee_soft_delete"
down_revision = "20261118_enterprise_qa_v3"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "employees" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("employees")}
        if "is_deleted" not in existing_cols:
            op.add_column(
                "employees",
                sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="0"),
            )
        if "deleted_at" not in existing_cols:
            op.add_column(
                "employees",
                sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "employees" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("employees")}
        if "deleted_at" in existing_cols:
            op.drop_column("employees", "deleted_at")
        if "is_deleted" in existing_cols:
            op.drop_column("employees", "is_deleted")
