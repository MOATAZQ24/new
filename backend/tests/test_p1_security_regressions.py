# ==============================================================================
# Investor Gate OS (IGOS) - Technical Operations Platform
# Original Developer: Moataz Qasem (2026)
# Attribution Framework: IGOS Developer Attribution & Provenance Framework (IGOS-DAPF)
# ==============================================================================

"""Isolated worker and schema-upgrade regression tests. No Telegram network calls."""
import os
import sys
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from contextlib import ExitStack

os.environ["DATABASE_URL"] = "sqlite://"
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, text, inspect
from app.core import database
from app.workers import telegram_poller as poller


class PollingRegressions(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = str(Path(self.temp.name) / "offset.json")
        self.patch = patch.object(poller, "OFFSET_FILE", self.path)
        self.patch.start()
        self.bot_a = "100:dummy-a"
        self.bot_b = "200:dummy-b"

    def tearDown(self):
        self.patch.stop(); self.temp.cleanup()

    def test_independent_offsets_survive_restart_and_rotation(self):
        poller.save_offset(901, self.bot_a)
        self.assertEqual(poller.load_offset(self.bot_b), 0)
        poller.save_offset(12, self.bot_b)
        self.assertEqual(poller.load_offset(self.bot_a), 901)
        self.assertEqual(poller.load_offset(self.bot_b), 12)
        self.assertEqual(poller.load_offset("100:rotated-secret"), 901)
        content = Path(self.path).read_text()
        self.assertNotIn(self.bot_a, content)
        self.assertNotIn(self.bot_b, content)

    def test_legacy_offset_used_only_when_explicitly_single_bot(self):
        Path(self.path).write_text(json.dumps({"offset": 700}))
        self.assertEqual(poller.load_offset(self.bot_a), 0)
        self.assertEqual(poller.load_offset(self.bot_a, allow_legacy=True), 700)
        poller.save_offset(701, self.bot_a)
        self.assertEqual(poller.load_offset(self.bot_b, allow_legacy=True), 0)

    def test_corrupt_offset_fails_without_resetting_progress(self):
        Path(self.path).write_text("invalid json")
        with self.assertRaises(json.JSONDecodeError):
            poller.load_offset(self.bot_a)
        self.assertEqual(Path(self.path).read_text(), "invalid json")

    def test_failed_atomic_save_preserves_last_offset(self):
        poller.save_offset(10, self.bot_a)
        with patch.object(poller.os, "replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                poller.save_offset(11, self.bot_a)
        self.assertEqual(poller.load_offset(self.bot_a), 10)

    def run_one_poll(self, fail_processing=False):
        configs = [{"token": self.bot_a}, {"token": self.bot_b}]
        seen = []
        def fetch(bot_token, offset, timeout):
            seen.append((bot_token, offset))
            return [{"update_id": 900 if bot_token == self.bot_a else 8}]
        def stop(_):
            poller.RUNNING = False
        with ExitStack() as stack:
            stack.enter_context(patch.object(poller, "RUNNING", True))
            stack.enter_context(patch.object(poller, "init_db"))
            stack.enter_context(patch.object(poller, "SessionLocal", return_value=Mock()))
            stack.enter_context(patch.object(poller, "dispatch_outbox_notifications", return_value={}))
            stack.enter_context(patch.object(poller, "get_active_bot_tokens", return_value=configs))
            stack.enter_context(patch.object(poller, "update_worker_status"))
            stack.enter_context(patch.object(poller, "fetch_telegram_updates", side_effect=fetch))
            stack.enter_context(patch.object(poller, "process_telegram_update", side_effect=RuntimeError("processing failed") if fail_processing else None))
            stack.enter_context(patch.object(poller.time, "sleep", side_effect=stop))
            poller.run_poller_loop()
        return seen

    def test_worker_passes_each_bots_offset_to_telegram(self):
        poller.save_offset(800, self.bot_a)
        poller.save_offset(3, self.bot_b)
        self.assertEqual(self.run_one_poll(), [(self.bot_a, 800), (self.bot_b, 3)])
        self.assertEqual(poller.load_offset(self.bot_a), 901)
        self.assertEqual(poller.load_offset(self.bot_b), 9)

    def test_failed_processing_does_not_acknowledge_update(self):
        poller.save_offset(800, self.bot_a)
        self.run_one_poll(fail_processing=True)
        self.assertEqual(poller.load_offset(self.bot_a), 800)
        self.assertEqual(poller.load_offset(self.bot_b), 0)


class MigrationRegressions(unittest.TestCase):
    def test_additive_migration_preserves_rows_and_is_repeatable(self):
        engine = create_engine("sqlite://")
        try:
            with engine.begin() as conn:
                conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY)"))
                conn.execute(text("INSERT INTO users (id) VALUES (42)"))
            with patch.object(database, "engine", engine):
                database._migrate_columns()
                database._migrate_columns()
            self.assertIn("must_change_password", [c["name"] for c in inspect(engine).get_columns("users")])
            with engine.connect() as conn:
                self.assertEqual(conn.execute(text("SELECT id FROM users")).scalar_one(), 42)
        finally:
            engine.dispose()

    def test_database_error_is_rolled_back_and_propagated(self):
        engine = Mock()
        engine.url.drivername = "sqlite"
        from unittest.mock import MagicMock
        connection = MagicMock()
        connection.execute.side_effect = RuntimeError("database unavailable")
        engine.connect.return_value = MagicMock()
        engine.connect.return_value.__enter__.return_value = connection
        with patch.object(database, "engine", engine):
            with self.assertRaisesRegex(RuntimeError, "users.must_change_password; startup aborted"):
                database._migrate_columns()
        connection.rollback.assert_called_once()


if __name__ == "__main__":
    unittest.main()
