"""Enterprise 3.0 schema, canonical five-branch reconciliation, and backfill migration."""

from alembic import op
import sqlalchemy as sa


revision = "20261117_enterprise_v3"
down_revision = "20261117_ai_agent_exec"
branch_labels = None
depends_on = None


ENTERPRISE_TABLES = [
    "physical_branch_locations",
    "employee_branch_assignments",
    "employee_assignment_history",
    "work_schedules",
    "attendance_records",
    "leave_requests",
    "employee_objectives",
    "performance_evaluations",
    "employee_documents",
    "projects",
    "project_milestones",
    "crm_customers",
    "crm_opportunities",
    "crm_activities",
    "purchase_requests",
    "workflow_approvals",
    "asset_branch_transfers",
]


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

    # Ensure all models are registered so checkfirst create works on fresh databases
    from app.core.database import Base
    import app.models  # noqa: F401

    existing_tables = set(inspector.get_table_names())
    for tbl_name in ENTERPRISE_TABLES:
        if tbl_name not in existing_tables and tbl_name in Base.metadata.tables:
            Base.metadata.tables[tbl_name].create(bind=bind, checkfirst=True)

    # Refresh inspector after creating missing tables
    inspector = sa.inspect(bind)
    columns_to_ensure = [
        ("branches", sa.Column("physical_branch_id", uuid_type, nullable=True)),
        ("employees", sa.Column("manager_id", uuid_type, nullable=True)),
        ("employees", sa.Column("hire_date", sa.Date(), nullable=True)),
        ("employees", sa.Column("employment_type", sa.String(length=50), nullable=True, server_default="Full-Time")),
        ("employees", sa.Column("work_location", sa.String(length=255), nullable=True)),
        ("employees", sa.Column("avatar_url", sa.String(length=512), nullable=True)),
        ("employees", sa.Column("person_id", uuid_type, nullable=True)),
        ("tasks", sa.Column("project_id", uuid_type, nullable=True)),
        ("technical_assets", sa.Column("asset_category", sa.String(length=50), nullable=True, server_default="IT")),
    ]
    for tbl, col in columns_to_ensure:
        _add_column_if_missing(inspector, tbl, col)

    # Idempotent canonical branch + physical_branch_id + EmployeeBranchAssignment backfill
    from sqlalchemy.orm import Session
    from app.models.company import Company
    from app.services.enterprise_service import ensure_canonical_five_branches

    session = Session(bind=bind)
    try:
        for comp in session.query(Company).all():
            ensure_canonical_five_branches(session, comp.id)
        session.commit()
    finally:
        session.close()


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "branches" in inspector.get_table_names():
        cols = {c["name"] for c in inspector.get_columns("branches")}
        if "physical_branch_id" in cols and bind.dialect.name != "sqlite":
            op.drop_column("branches", "physical_branch_id")
