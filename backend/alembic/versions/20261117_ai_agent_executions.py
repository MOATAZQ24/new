"""Add ai_agent_executions table for AI Agent idempotency, confirmation, and audit."""

from alembic import op
import sqlalchemy as sa


revision = "20261117_ai_agent_exec"
down_revision = "20261117_telegram_scope"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "ai_agent_executions" in inspector.get_table_names():
        return

    uuid_type = sa.String(length=36) if bind.dialect.name == "sqlite" else sa.dialects.postgresql.UUID(as_uuid=True)
    op.create_table(
        "ai_agent_executions",
        sa.Column("id", uuid_type, primary_key=True, nullable=False),
        sa.Column("company_id", uuid_type, sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("idempotency_key", sa.String(length=128), nullable=False),
        sa.Column("confirmation_token", sa.String(length=128), nullable=True),
        sa.Column("action_name", sa.String(length=80), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="executed"),
        sa.Column("request_payload", sa.JSON(), nullable=True),
        sa.Column("result_payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("company_id", "user_id", "idempotency_key", name="uq_ai_agent_exec_idempotency"),
    )
    op.create_index("ix_ai_agent_executions_company_id", "ai_agent_executions", ["company_id"])
    op.create_index("ix_ai_agent_executions_user_id", "ai_agent_executions", ["user_id"])
    op.create_index("ix_ai_agent_executions_confirmation_token", "ai_agent_executions", ["confirmation_token"])
    op.create_index("ix_ai_agent_exec_created", "ai_agent_executions", ["created_at"])


def downgrade():
    op.drop_table("ai_agent_executions")
