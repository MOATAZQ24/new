"""Add is_voice_task, voice_note_url, and voice_note_duration to tasks table for native WhatsApp-style voice task recording."""

from alembic import op
import sqlalchemy as sa


revision = "20261119_voice_tasks"
down_revision = "20261119_company_soft_delete"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "tasks" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("tasks")}
        if "is_voice_task" not in existing_cols:
            op.add_column(
                "tasks",
                sa.Column("is_voice_task", sa.Boolean(), nullable=False, server_default="0"),
            )
        if "voice_note_url" not in existing_cols:
            op.add_column(
                "tasks",
                sa.Column("voice_note_url", sa.String(512), nullable=True),
            )
        if "voice_note_duration" not in existing_cols:
            op.add_column(
                "tasks",
                sa.Column("voice_note_duration", sa.Integer(), nullable=True, server_default="0"),
            )


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())
    if "tasks" in existing_tables:
        existing_cols = {c["name"] for c in inspector.get_columns("tasks")}
        if "voice_note_duration" in existing_cols:
            op.drop_column("tasks", "voice_note_duration")
        if "voice_note_url" in existing_cols:
            op.drop_column("tasks", "voice_note_url")
        if "is_voice_task" in existing_cols:
            op.drop_column("tasks", "is_voice_task")
