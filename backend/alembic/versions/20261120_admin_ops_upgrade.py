"""Administrative & Operational Intelligence Upgrade Migration:
- Employee multi-position enhancements (manager_id, section, team, start_date, end_date)
- Fast Task broadcast & duration-based deadline models (TaskParticipant, deadline_type, SLA escalation)
- Service desk ITIL 4 transformations (ProblemRecord, KnowledgeArticle, HelpDeskTicket SLA/multimedia/tier)
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "20261120_admin_ops_upgrade"
down_revision = "20261119_voice_tasks"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    # 1. Employee Branch Assignments enhancements
    if "employee_branch_assignments" in existing_tables:
        cols = {c["name"] for c in inspector.get_columns("employee_branch_assignments")}
        if "manager_id" not in cols:
            op.add_column("employee_branch_assignments", sa.Column("manager_id", UUID(as_uuid=True), nullable=True))
        if "section" not in cols:
            op.add_column("employee_branch_assignments", sa.Column("section", sa.String(100), nullable=True))
        if "team" not in cols:
            op.add_column("employee_branch_assignments", sa.Column("team", sa.String(100), nullable=True))
        if "start_date" not in cols:
            op.add_column("employee_branch_assignments", sa.Column("start_date", sa.Date(), nullable=True))
        if "end_date" not in cols:
            op.add_column("employee_branch_assignments", sa.Column("end_date", sa.Date(), nullable=True))

    # 2. Task enhancements (broadcast, flexible deadlines, escalation)
    if "tasks" in existing_tables:
        task_cols = {c["name"] for c in inspector.get_columns("tasks")}
        if "deadline_type" not in task_cols:
            op.add_column("tasks", sa.Column("deadline_type", sa.String(50), nullable=False, server_default="fixed_datetime"))
        if "target_duration_minutes" not in task_cols:
            op.add_column("tasks", sa.Column("target_duration_minutes", sa.Integer(), nullable=True))
        if "deadline_at" not in task_cols:
            op.add_column("tasks", sa.Column("deadline_at", sa.DateTime(), nullable=True))
        if "escalated_at" not in task_cols:
            op.add_column("tasks", sa.Column("escalated_at", sa.DateTime(), nullable=True))
        if "escalation_level" not in task_cols:
            op.add_column("tasks", sa.Column("escalation_level", sa.Integer(), nullable=False, server_default="0"))
        if "is_broadcast" not in task_cols:
            op.add_column("tasks", sa.Column("is_broadcast", sa.Boolean(), nullable=False, server_default="0"))
        if "broadcast_mode" not in task_cols:
            op.add_column("tasks", sa.Column("broadcast_mode", sa.String(50), nullable=True))
        if "broadcast_group_id" not in task_cols:
            op.add_column("tasks", sa.Column("broadcast_group_id", UUID(as_uuid=True), nullable=True))
        if "is_accountable" not in task_cols:
            op.add_column("tasks", sa.Column("is_accountable", sa.Boolean(), nullable=False, server_default="1"))

    # 3. Task Participants table
    if "task_participants" not in existing_tables:
        op.create_table(
            "task_participants",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("employee_id", UUID(as_uuid=True), sa.ForeignKey("employees.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role_type", sa.String(50), nullable=False, server_default="collaborator"),
            sa.Column("status", sa.String(50), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("task_id", "employee_id", name="uq_task_participant"),
        )
        op.create_index("ix_task_participants_task_id", "task_participants", ["task_id"])
        op.create_index("ix_task_participants_employee_id", "task_participants", ["employee_id"])

    # 4. Problem Records table (ITIL Problem Management)
    if "problem_records" not in existing_tables:
        op.create_table(
            "problem_records",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=False),
            sa.Column("root_cause", sa.Text(), nullable=True),
            sa.Column("workaround", sa.Text(), nullable=True),
            sa.Column("status", sa.String(50), nullable=False, server_default="Open"),
            sa.Column("assigned_to_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_problem_records_company_id", "problem_records", ["company_id"])
        op.create_index("ix_problem_records_status", "problem_records", ["status"])

    # 5. Knowledge Articles table
    if "knowledge_articles" not in existing_tables:
        op.create_table(
            "knowledge_articles",
            sa.Column("id", UUID(as_uuid=True), primary_key=True),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(255), nullable=False),
            sa.Column("category", sa.String(100), nullable=False, server_default="General"),
            sa.Column("symptom", sa.Text(), nullable=False),
            sa.Column("diagnostic_steps", sa.Text(), nullable=True),
            sa.Column("resolution", sa.Text(), nullable=False),
            sa.Column("is_published", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column("author_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("approved_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_knowledge_articles_company_id", "knowledge_articles", ["company_id"])
        op.create_index("ix_knowledge_articles_category", "knowledge_articles", ["category"])
        op.create_index("ix_knowledge_articles_published", "knowledge_articles", ["is_published"])

    # 6. HelpDesk Tickets enhancements
    if "helpdesk_tickets" in existing_tables:
        ticket_cols = {c["name"] for c in inspector.get_columns("helpdesk_tickets")}
        if "ticket_type" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("ticket_type", sa.String(50), nullable=False, server_default="Incident"))
        if "tier" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("tier", sa.String(20), nullable=False, server_default="L1"))
        if "sla_target_at" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("sla_target_at", sa.DateTime(), nullable=True))
        if "sla_paused_at" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("sla_paused_at", sa.DateTime(), nullable=True))
        if "sla_paused_total_seconds" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("sla_paused_total_seconds", sa.Integer(), nullable=False, server_default="0"))
        if "sla_status" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("sla_status", sa.String(50), nullable=False, server_default="Within_SLA"))
        if "voice_note_url" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("voice_note_url", sa.String(512), nullable=True))
        if "reopened_count" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("reopened_count", sa.Integer(), nullable=False, server_default="0"))
        if "problem_id" not in ticket_cols:
            op.add_column("helpdesk_tickets", sa.Column("problem_id", UUID(as_uuid=True), nullable=True))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = set(inspector.get_table_names())

    if "knowledge_articles" in existing_tables:
        op.drop_table("knowledge_articles")
    if "problem_records" in existing_tables:
        op.drop_table("problem_records")
    if "task_participants" in existing_tables:
        op.drop_table("task_participants")
