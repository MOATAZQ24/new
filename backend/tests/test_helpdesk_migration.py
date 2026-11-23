# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Migration verification tests for 20261124_helpdesk_assignment:
- Upgrade -> verify schema, data preservation, and idempotent backfill
- Downgrade -> verify clean rollback and zero loss of pre-existing records
- Re-upgrade -> verify repeatable clean migration
- Offline PostgreSQL DDL generation check (upgrade + downgrade)
"""

import io
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO_ROOT = os.path.abspath(os.path.join(BACKEND_DIR, ".."))
SRC_DB = os.path.join(REPO_ROOT, "it_ops.db")

NEW_TABLES = {
    "teams",
    "team_members",
    "assignment_rules",
    "round_robin_cursors",
    "ticket_categories",
    "ticket_events",
    "workflow_transitions",
    "ticket_watchers",
    "task_watchers",
    "task_checklist_items",
    "macros",
    "saved_views",
    "idempotency_keys",
}

NEW_TICKET_COLS = {
    "team_id",
    "category_id",
    "sla_policy_id",
    "first_response_due_at",
    "resolution_due_at",
    "sla_state",
    "merged_into_ticket_id",
    "require_tasks_done_to_close",
}

NEW_TASK_COLS = {
    "team_id",
    "assignee_id",
    "requester_id",
    "sla_policy_id",
    "parent_task_id",
    "first_response_due_at",
    "resolution_due_at",
    "sla_state",
}

NEW_SLA_COLS = {
    "business_hours",
    "is_default",
    "escalate_on_breach",
    "bump_priority_on_breach",
}


def _run_alembic(args: list[str], db_url: str) -> str:
    env = os.environ.copy()
    env["DATABASE_URL"] = db_url
    proc = subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise AssertionError(
            f"alembic {' '.join(args)} failed (code {proc.returncode}):\n"
            f"STDOUT:\n{proc.stdout}\nSTDERR:\n{proc.stderr}"
        )
    return proc.stdout


def _inspect_sqlite(db_path: str):
    con = sqlite3.connect(db_path)
    try:
        cur = con.cursor()
        tables = {
            r[0]
            for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
        cols_map = {
            tbl: {r[1] for r in cur.execute(f"PRAGMA table_info({tbl})").fetchall()}
            for tbl in tables
        }
        counts_map = {}
        for tbl in ("helpdesk_tickets", "ticket_comments", "ticket_events", "tasks", "users", "companies"):
            counts_map[tbl] = cur.execute(f"SELECT COUNT(*) FROM {tbl}").fetchone()[0] if tbl in tables else 0
        return tables, lambda tbl: cols_map.get(tbl, set()), lambda tbl: counts_map.get(tbl, 0)
    finally:
        con.close()


def test_sqlite_upgrade_downgrade_reupgrade():
    assert os.path.exists(SRC_DB), f"Source SQLite DB not found at {SRC_DB}"
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db = os.path.join(tmpdir, "test_migration.db")
        shutil.copy2(SRC_DB, test_db)
        db_url = f"sqlite:///{test_db.replace(os.sep, '/')}"

        # Ensure temp copy starts at previous revision so test is deterministic even after dev DB is upgraded
        cur_rev = _run_alembic(["current"], db_url)
        if "20261124_helpdesk_assignment" in cur_rev:
            _run_alembic(["downgrade", "20261120_admin_ops_upgrade"], db_url)

        tables_before, cols_before, count_before = _inspect_sqlite(test_db)
        pre_tickets = count_before("helpdesk_tickets")
        pre_comments = count_before("ticket_comments")
        pre_tasks = count_before("tasks")
        pre_users = count_before("users")
        pre_companies = count_before("companies")

        assert NEW_TABLES.isdisjoint(tables_before), f"Unexpected tables before upgrade: {NEW_TABLES & tables_before}"

        # 1. Upgrade to head
        _run_alembic(["upgrade", "head"], db_url)
        tables_up, cols_up, count_up = _inspect_sqlite(test_db)

        assert NEW_TABLES.issubset(tables_up), f"Missing tables after upgrade: {NEW_TABLES - tables_up}"
        assert NEW_TICKET_COLS.issubset(cols_up("helpdesk_tickets"))
        assert NEW_TASK_COLS.issubset(cols_up("tasks"))
        assert NEW_SLA_COLS.issubset(cols_up("sla_policies"))

        # Existing data intact
        assert count_up("helpdesk_tickets") == pre_tickets
        assert count_up("ticket_comments") == pre_comments
        assert count_up("tasks") == pre_tasks
        assert count_up("users") == pre_users
        assert count_up("companies") == pre_companies

        # Backfill verified
        assert count_up("ticket_events") >= pre_comments

        # 2. Downgrade back to 20261120_admin_ops_upgrade
        _run_alembic(["downgrade", "20261120_admin_ops_upgrade"], db_url)
        tables_down, cols_down, count_down = _inspect_sqlite(test_db)

        assert NEW_TABLES.isdisjoint(tables_down), f"Tables not dropped on downgrade: {NEW_TABLES & tables_down}"
        assert NEW_TICKET_COLS.isdisjoint(cols_down("helpdesk_tickets"))
        assert NEW_TASK_COLS.isdisjoint(cols_down("tasks"))
        assert NEW_SLA_COLS.isdisjoint(cols_down("sla_policies"))

        # Zero data loss after downgrade
        assert count_down("helpdesk_tickets") == pre_tickets
        assert count_down("ticket_comments") == pre_comments
        assert count_down("tasks") == pre_tasks
        assert count_down("users") == pre_users
        assert count_down("companies") == pre_companies

        # 3. Re-upgrade to head cleanly
        _run_alembic(["upgrade", "head"], db_url)
        tables_reup, _, count_reup = _inspect_sqlite(test_db)
        assert NEW_TABLES.issubset(tables_reup)
        assert count_reup("ticket_events") >= pre_comments
        assert count_reup("helpdesk_tickets") == pre_tickets
        print(
            f"  OK SQLite migration round-trip passed "
            f"(preserved {pre_tickets} tickets, {pre_comments} comments -> {count_reup('ticket_events')} events, {pre_tasks} tasks)"
        )


def test_offline_postgres_sql_generation():
    pg_url = "postgresql://itops_app:placeholder@localhost:5432/itops"
    up_sql = _run_alembic(["upgrade", "20261120_admin_ops_upgrade:20261124_helpdesk_assignment", "--sql"], pg_url)
    for tbl in NEW_TABLES:
        assert f"CREATE TABLE {tbl}" in up_sql, f"Missing CREATE TABLE {tbl} in PG SQL"
    assert "DEFAULT true" in up_sql and "DEFAULT false" in up_sql
    assert "DEFAULT '0'" not in up_sql or "position INTEGER DEFAULT '0'" in up_sql

    down_sql = _run_alembic(["downgrade", "20261124_helpdesk_assignment:20261120_admin_ops_upgrade", "--sql"], pg_url)
    for tbl in NEW_TABLES:
        assert f"DROP TABLE {tbl}" in down_sql, f"Missing DROP TABLE {tbl} in PG downgrade SQL"
    print("  OK PostgreSQL offline upgrade & downgrade SQL verified")


if __name__ == "__main__":
    print("=" * 65)
    print("RUNNING HELPDESK & ASSIGNMENT MIGRATION VERIFICATION TESTS")
    print("=" * 65)
    test_sqlite_upgrade_downgrade_reupgrade()
    test_offline_postgres_sql_generation()
    print("ALL MIGRATION TESTS PASSED!")
