"""Add independent workspace settings and sanitized branding storage.

Existing installations use create_all; this baseline ensures all core tables exist on fresh PostgreSQL/SQLite databases before adding workspace tables.
"""
from alembic import op
from app.models.workspace import WorkspacePreference, CompanyWorkspace

revision = "20261113_workspace"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    from app.core.database import Base
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=bind, checkfirst=True)
    for table in (WorkspacePreference.__table__, CompanyWorkspace.__table__):
        table.create(bind, checkfirst=True)


def downgrade():
    for table in (CompanyWorkspace.__table__, WorkspacePreference.__table__):
        table.drop(op.get_bind(), checkfirst=True)
