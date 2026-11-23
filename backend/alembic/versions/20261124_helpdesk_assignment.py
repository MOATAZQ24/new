# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Help Desk & Task Assignment Engine Migration (SQLite & PostgreSQL portable):
- New tables: teams, team_members, assignment_rules, round_robin_cursors,
  ticket_categories, ticket_events, workflow_transitions, ticket_watchers,
  task_watchers, task_checklist_items, macros, saved_views, idempotency_keys.
- Additive extensions on sla_policies, helpdesk_tickets, tasks with composite indexes.
- Non-destructive idempotent backfill of ticket_comments -> ticket_events.
"""

import json
import uuid
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID


revision = "20261124_helpdesk_assignment"
down_revision = "20261120_admin_ops_upgrade"
branch_labels = None
depends_on = None


def _get_inspector():
    return sa.inspect(op.get_bind())


def _is_offline() -> bool:
    from alembic import context
    return context.is_offline_mode()


def upgrade():
    offline = _is_offline()
    if offline:
        existing_tables = set()
        inspector = None
    else:
        inspector = _get_inspector()
        existing_tables = set(inspector.get_table_names())

    # 1. teams
    if "teams" not in existing_tables:
        op.create_table(
            "teams",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("branch_id", UUID(as_uuid=True), sa.ForeignKey("branches.id", ondelete="SET NULL"), nullable=True),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("default_strategy", sa.String(30), nullable=False, server_default="least_loaded"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("lead_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "name", name="uq_teams_company_name"),
        )
        op.create_index("ix_teams_company_id", "teams", ["company_id"])
        op.create_index("ix_teams_company_active", "teams", ["company_id", "is_active"])
        op.create_index("ix_teams_branch_id", "teams", ["branch_id"])
        op.create_index("ix_teams_lead_user_id", "teams", ["lead_user_id"])

    # 2. team_members
    if "team_members" not in existing_tables:
        op.create_table(
            "team_members",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("skills", sa.JSON(), nullable=False),
            sa.Column("max_open_items", sa.Integer(), nullable=False, server_default="10"),
            sa.Column("is_available", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("last_assigned_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("team_id", "user_id", name="uq_team_member_team_user"),
        )
        op.create_index("ix_team_members_company_team", "team_members", ["company_id", "team_id"])
        op.create_index("ix_team_members_company_user", "team_members", ["company_id", "user_id"])
        op.create_index("ix_team_members_user_id", "team_members", ["user_id"])

    # 3. assignment_rules
    if "assignment_rules" not in existing_tables:
        op.create_table(
            "assignment_rules",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("entity_type", sa.String(20), nullable=False, server_default="ticket"),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("conditions", sa.JSON(), nullable=False),
            sa.Column("team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="CASCADE"), nullable=False),
            sa.Column("strategy", sa.String(30), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("stop_on_match", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index(
            "ix_assignment_rules_company_entity_pos",
            "assignment_rules",
            ["company_id", "entity_type", "is_active", "position"],
        )
        op.create_index("ix_assignment_rules_team_id", "assignment_rules", ["team_id"])

    # 4. round_robin_cursors
    if "round_robin_cursors" not in existing_tables:
        op.create_table(
            "round_robin_cursors",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scope_type", sa.String(20), nullable=False, server_default="team"),
            sa.Column("scope_id", UUID(as_uuid=True), nullable=False),
            sa.Column("last_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("last_index", sa.Integer(), nullable=False, server_default="-1"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "scope_type", "scope_id", name="uq_rr_cursor_company_scope"),
        )
        op.create_index("ix_rr_cursors_company_scope", "round_robin_cursors", ["company_id", "scope_type", "scope_id"])

    # 5. ticket_categories
    if "ticket_categories" not in existing_tables:
        op.create_table(
            "ticket_categories",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("name_ar", sa.String(150), nullable=True),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("default_priority", sa.String(50), nullable=False, server_default="Medium"),
            sa.Column("default_team_id", UUID(as_uuid=True), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("required_skills", sa.JSON(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "name", name="uq_ticket_categories_company_name"),
        )
        op.create_index("ix_ticket_categories_company_id", "ticket_categories", ["company_id"])
        op.create_index("ix_ticket_categories_default_team", "ticket_categories", ["default_team_id"])

    # 6. ticket_events
    if "ticket_events" not in existing_tables:
        op.create_table(
            "ticket_events",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("helpdesk_tickets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("actor_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("kind", sa.String(40), nullable=False),
            sa.Column("payload", sa.JSON(), nullable=False),
            sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_ticket_events_ticket_created", "ticket_events", ["ticket_id", "created_at"])
        op.create_index("ix_ticket_events_company_kind", "ticket_events", ["company_id", "kind"])
        op.create_index("ix_ticket_events_actor_id", "ticket_events", ["actor_id"])

    # 7. workflow_transitions
    if "workflow_transitions" not in existing_tables:
        op.create_table(
            "workflow_transitions",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("entity_type", sa.String(20), nullable=False),
            sa.Column("from_status", sa.String(50), nullable=False),
            sa.Column("to_status", sa.String(50), nullable=False),
            sa.Column("required_permission", sa.String(80), nullable=True),
            sa.Column("requires_comment", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "entity_type", "from_status", "to_status", name="uq_workflow_transition_edge"),
        )
        op.create_index(
            "ix_workflow_transitions_company_entity",
            "workflow_transitions",
            ["company_id", "entity_type", "from_status"],
        )

    # 8. ticket_watchers
    if "ticket_watchers" not in existing_tables:
        op.create_table(
            "ticket_watchers",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("ticket_id", UUID(as_uuid=True), sa.ForeignKey("helpdesk_tickets.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("ticket_id", "user_id", name="uq_ticket_watcher"),
        )
        op.create_index("ix_ticket_watchers_company_user", "ticket_watchers", ["company_id", "user_id"])
        op.create_index("ix_ticket_watchers_ticket_id", "ticket_watchers", ["ticket_id"])

    # 9. task_watchers
    if "task_watchers" not in existing_tables:
        op.create_table(
            "task_watchers",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("task_id", "user_id", name="uq_task_watcher"),
        )
        op.create_index("ix_task_watchers_company_user", "task_watchers", ["company_id", "user_id"])
        op.create_index("ix_task_watchers_task_id", "task_watchers", ["task_id"])

    # 10. task_checklist_items
    if "task_checklist_items" not in existing_tables:
        op.create_table(
            "task_checklist_items",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(300), nullable=False),
            sa.Column("is_completed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("completed_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_task_checklist_task_pos", "task_checklist_items", ["task_id", "position"])
        op.create_index("ix_task_checklist_company_id", "task_checklist_items", ["company_id"])

    # 11. macros
    if "macros" not in existing_tables:
        op.create_table(
            "macros",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(200), nullable=False),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("visibility", sa.String(20), nullable=False, server_default="public"),
            sa.Column("created_by_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
            sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_macros_company_shared", "macros", ["company_id", "is_shared"])
        op.create_index("ix_macros_created_by", "macros", ["created_by_id"])

    # 12. saved_views
    if "saved_views" not in existing_tables:
        op.create_table(
            "saved_views",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("scope", sa.String(30), nullable=False),
            sa.Column("name", sa.String(150), nullable=False),
            sa.Column("filters", sa.JSON(), nullable=False),
            sa.Column("sort", sa.JSON(), nullable=False),
            sa.Column("columns", sa.JSON(), nullable=False),
            sa.Column("is_shared", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
        )
        op.create_index("ix_saved_views_company_scope", "saved_views", ["company_id", "scope", "user_id"])

    # 13. idempotency_keys
    if "idempotency_keys" not in existing_tables:
        op.create_table(
            "idempotency_keys",
            sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
            sa.Column("company_id", UUID(as_uuid=True), sa.ForeignKey("companies.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("key", sa.String(128), nullable=False),
            sa.Column("method", sa.String(10), nullable=False),
            sa.Column("path", sa.String(255), nullable=False),
            sa.Column("response_status", sa.Integer(), nullable=False),
            sa.Column("response_body", sa.JSON(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=True, server_default=sa.func.now()),
            sa.UniqueConstraint("company_id", "user_id", "key", name="uq_idempotency_company_user_key"),
        )
        op.create_index("ix_idempotency_keys_expires_at", "idempotency_keys", ["expires_at"])

    # 14. Extend sla_policies
    if offline or "sla_policies" in existing_tables:
        sla_cols = set() if offline else {c["name"] for c in inspector.get_columns("sla_policies")}
        with op.batch_alter_table("sla_policies") as batch_op:
            if "business_hours" not in sla_cols:
                batch_op.add_column(sa.Column("business_hours", sa.JSON(), nullable=True))
            if "is_default" not in sla_cols:
                batch_op.add_column(sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.false()))
            if "escalate_on_breach" not in sla_cols:
                batch_op.add_column(sa.Column("escalate_on_breach", sa.Boolean(), nullable=False, server_default=sa.false()))
            if "bump_priority_on_breach" not in sla_cols:
                batch_op.add_column(sa.Column("bump_priority_on_breach", sa.Boolean(), nullable=False, server_default=sa.false()))

    # 15. Extend helpdesk_tickets
    if offline or "helpdesk_tickets" in existing_tables:
        t_cols = set() if offline else {c["name"] for c in inspector.get_columns("helpdesk_tickets")}
        t_idx = set() if offline else {i["name"] for i in inspector.get_indexes("helpdesk_tickets")}
        with op.batch_alter_table("helpdesk_tickets") as batch_op:
            if "team_id" not in t_cols:
                batch_op.add_column(sa.Column("team_id", UUID(as_uuid=True), nullable=True))
            if "category_id" not in t_cols:
                batch_op.add_column(sa.Column("category_id", UUID(as_uuid=True), nullable=True))
            if "sla_policy_id" not in t_cols:
                batch_op.add_column(sa.Column("sla_policy_id", UUID(as_uuid=True), nullable=True))
            if "first_response_due_at" not in t_cols:
                batch_op.add_column(sa.Column("first_response_due_at", sa.DateTime(), nullable=True))
            if "resolution_due_at" not in t_cols:
                batch_op.add_column(sa.Column("resolution_due_at", sa.DateTime(), nullable=True))
            if "sla_state" not in t_cols:
                batch_op.add_column(sa.Column("sla_state", sa.String(20), nullable=False, server_default="ok"))
            if "merged_into_ticket_id" not in t_cols:
                batch_op.add_column(sa.Column("merged_into_ticket_id", UUID(as_uuid=True), nullable=True))
            if "require_tasks_done_to_close" not in t_cols:
                batch_op.add_column(sa.Column("require_tasks_done_to_close", sa.Boolean(), nullable=False, server_default=sa.false()))
            if "ix_helpdesk_tickets_company_status" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_company_status", ["company_id", "status"])
            if "ix_helpdesk_tickets_company_assignee" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_company_assignee", ["company_id", "assigned_technician_id"])
            if "ix_helpdesk_tickets_company_team" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_company_team", ["company_id", "team_id"])
            if "ix_helpdesk_tickets_company_sla_state" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_company_sla_state", ["company_id", "sla_state"])
            if "ix_helpdesk_tickets_sla_policy_id" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_sla_policy_id", ["sla_policy_id"])
            if "ix_helpdesk_tickets_category_id" not in t_idx:
                batch_op.create_index("ix_helpdesk_tickets_category_id", ["category_id"])

    # 16. Extend tasks
    if offline or "tasks" in existing_tables:
        tk_cols = set() if offline else {c["name"] for c in inspector.get_columns("tasks")}
        tk_idx = set() if offline else {i["name"] for i in inspector.get_indexes("tasks")}
        with op.batch_alter_table("tasks") as batch_op:
            if "team_id" not in tk_cols:
                batch_op.add_column(sa.Column("team_id", UUID(as_uuid=True), nullable=True))
            if "assignee_id" not in tk_cols:
                batch_op.add_column(sa.Column("assignee_id", UUID(as_uuid=True), nullable=True))
            if "requester_id" not in tk_cols:
                batch_op.add_column(sa.Column("requester_id", UUID(as_uuid=True), nullable=True))
            if "sla_policy_id" not in tk_cols:
                batch_op.add_column(sa.Column("sla_policy_id", UUID(as_uuid=True), nullable=True))
            if "parent_task_id" not in tk_cols:
                batch_op.add_column(sa.Column("parent_task_id", UUID(as_uuid=True), nullable=True))
            if "first_response_due_at" not in tk_cols:
                batch_op.add_column(sa.Column("first_response_due_at", sa.DateTime(), nullable=True))
            if "resolution_due_at" not in tk_cols:
                batch_op.add_column(sa.Column("resolution_due_at", sa.DateTime(), nullable=True))
            if "sla_state" not in tk_cols:
                batch_op.add_column(sa.Column("sla_state", sa.String(20), nullable=False, server_default="ok"))
            if "ix_tasks_company_status" not in tk_idx:
                batch_op.create_index("ix_tasks_company_status", ["company_id", "status"])
            if "ix_tasks_company_assignee" not in tk_idx:
                batch_op.create_index("ix_tasks_company_assignee", ["company_id", "assignee_id"])
            if "ix_tasks_company_team" not in tk_idx:
                batch_op.create_index("ix_tasks_company_team", ["company_id", "team_id"])
            if "ix_tasks_parent_task_id" not in tk_idx:
                batch_op.create_index("ix_tasks_parent_task_id", ["parent_task_id"])
            if "ix_tasks_related_ticket_id" not in tk_idx:
                batch_op.create_index("ix_tasks_related_ticket_id", ["related_ticket_id"])

    # 17. Non-destructive data backfill (online mode only)
    if not offline:
        conn = op.get_bind()
        is_sqlite = conn.dialect.name == "sqlite"

        # 17a. Backfill ticket_comments -> ticket_events (idempotent via legacy_comment_id)
        if "ticket_comments" in existing_tables and "helpdesk_tickets" in existing_tables:
            existing_event_comment_ids = set()
            ev_rows = conn.execute(
                sa.text("SELECT payload FROM ticket_events WHERE kind IN ('comment_public', 'comment_internal')")
            ).fetchall()
            for (payload_val,) in ev_rows:
                if isinstance(payload_val, str):
                    try:
                        payload_obj = json.loads(payload_val)
                    except Exception:
                        payload_obj = {}
                elif isinstance(payload_val, dict):
                    payload_obj = payload_val
                else:
                    payload_obj = {}
                if payload_obj.get("legacy_comment_id"):
                    existing_event_comment_ids.add(str(payload_obj["legacy_comment_id"]))

            comment_rows = conn.execute(
                sa.text(
                    "SELECT c.id, c.ticket_id, t.company_id, c.user_id, c.content, c.is_internal, c.created_at "
                    "FROM ticket_comments c JOIN helpdesk_tickets t ON t.id = c.ticket_id"
                )
            ).fetchall()
            for row in comment_rows:
                cid_str = str(row[0])
                if cid_str in existing_event_comment_ids:
                    continue
                is_int = bool(row[5])
                ev_id = uuid.uuid4().hex if is_sqlite else str(uuid.uuid4())
                payload_json = json.dumps(
                    {"content": row[4], "legacy_comment_id": cid_str},
                    ensure_ascii=False,
                )
                conn.execute(
                    sa.text(
                        "INSERT INTO ticket_events (id, ticket_id, company_id, actor_id, kind, payload, visibility, created_at) "
                        "VALUES (:id, :ticket_id, :company_id, :actor_id, :kind, :payload, :visibility, :created_at)"
                    ),
                    {
                        "id": ev_id,
                        "ticket_id": row[1],
                        "company_id": row[2],
                        "actor_id": row[3],
                        "kind": "comment_internal" if is_int else "comment_public",
                        "payload": payload_json,
                        "visibility": "internal" if is_int else "public",
                        "created_at": row[6] or datetime.utcnow(),
                    },
                )

        # 17b. Backfill tasks.assignee_id from users linked to tasks.assigned_to_id
        if "tasks" in existing_tables and "users" in existing_tables:
            conn.execute(
                sa.text(
                    "UPDATE tasks SET assignee_id = ("
                    "  SELECT u.id FROM users u WHERE u.employee_id = tasks.assigned_to_id LIMIT 1"
                    ") WHERE assignee_id IS NULL AND assigned_to_id IS NOT NULL"
                )
            )


def downgrade():
    offline = _is_offline()
    if offline:
        existing_tables = {
            "teams", "team_members", "assignment_rules", "round_robin_cursors",
            "ticket_categories", "ticket_events", "workflow_transitions",
            "ticket_watchers", "task_watchers", "task_checklist_items",
            "macros", "saved_views", "idempotency_keys",
            "sla_policies", "helpdesk_tickets", "tasks",
        }
        inspector = None
    else:
        inspector = _get_inspector()
        existing_tables = set(inspector.get_table_names())

    # 1. Revert tasks columns & indexes
    if "tasks" in existing_tables:
        tk_cols = None if offline else {c["name"] for c in inspector.get_columns("tasks")}
        tk_idx = None if offline else {i["name"] for i in inspector.get_indexes("tasks")}
        with op.batch_alter_table("tasks") as batch_op:
            for idx in (
                "ix_tasks_related_ticket_id",
                "ix_tasks_parent_task_id",
                "ix_tasks_company_team",
                "ix_tasks_company_assignee",
                "ix_tasks_company_status",
            ):
                if offline or idx in tk_idx:
                    batch_op.drop_index(idx)
            for col in (
                "sla_state",
                "resolution_due_at",
                "first_response_due_at",
                "parent_task_id",
                "sla_policy_id",
                "requester_id",
                "assignee_id",
                "team_id",
            ):
                if offline or col in tk_cols:
                    batch_op.drop_column(col)

    # 2. Revert helpdesk_tickets columns & indexes
    if "helpdesk_tickets" in existing_tables:
        t_cols = None if offline else {c["name"] for c in inspector.get_columns("helpdesk_tickets")}
        t_idx = None if offline else {i["name"] for i in inspector.get_indexes("helpdesk_tickets")}
        with op.batch_alter_table("helpdesk_tickets") as batch_op:
            for idx in (
                "ix_helpdesk_tickets_category_id",
                "ix_helpdesk_tickets_sla_policy_id",
                "ix_helpdesk_tickets_company_sla_state",
                "ix_helpdesk_tickets_company_team",
                "ix_helpdesk_tickets_company_assignee",
                "ix_helpdesk_tickets_company_status",
            ):
                if offline or idx in t_idx:
                    batch_op.drop_index(idx)
            for col in (
                "require_tasks_done_to_close",
                "merged_into_ticket_id",
                "sla_state",
                "resolution_due_at",
                "first_response_due_at",
                "sla_policy_id",
                "category_id",
                "team_id",
            ):
                if offline or col in t_cols:
                    batch_op.drop_column(col)

    # 3. Revert sla_policies columns
    if "sla_policies" in existing_tables:
        sla_cols = None if offline else {c["name"] for c in inspector.get_columns("sla_policies")}
        with op.batch_alter_table("sla_policies") as batch_op:
            for col in ("bump_priority_on_breach", "escalate_on_breach", "is_default", "business_hours"):
                if offline or col in sla_cols:
                    batch_op.drop_column(col)

    # 4. Drop new tables in reverse dependency order
    for tbl in (
        "idempotency_keys",
        "saved_views",
        "macros",
        "task_checklist_items",
        "task_watchers",
        "ticket_watchers",
        "workflow_transitions",
        "ticket_events",
        "ticket_categories",
        "round_robin_cursors",
        "assignment_rules",
        "team_members",
        "teams",
    ):
        if tbl in existing_tables:
            op.drop_table(tbl)
