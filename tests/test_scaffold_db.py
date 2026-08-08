from __future__ import annotations

import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPOSITORY_ROOT / "scripts" / "scaffold_db.py"
DATABASE_FILENAME = "feature_workflow.sqlite3"


class ScaffoldDatabaseTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.destination = Path(self.temporary_directory.name) / "output"
        result = self.run_command(self.destination)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.database_path = self.destination / DATABASE_FILENAME

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def run_command(self, destination: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [sys.executable, str(SCRIPT), str(destination), *arguments],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    @staticmethod
    def add_spec(connection: sqlite3.Connection, slug: str = "feature-alpha") -> int:
        cursor = connection.execute(
            "INSERT INTO specs (title, slug, description) VALUES (?, ?, ?)",
            ("Feature Alpha", slug, "# Goal\nImplement the requested feature."),
        )
        return int(cursor.lastrowid)

    @staticmethod
    def add_task(
        connection: sqlite3.Connection,
        spec_id: int,
        title: str,
        *,
        status: str = "pending",
        parent_id: int | None = None,
    ) -> int:
        cursor = connection.execute(
            """
            INSERT INTO tasks (spec_id, title, description, status, parent_id, branch)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (spec_id, title, f"# Goal\n{title}", status, parent_id, "feature/alpha"),
        )
        return int(cursor.lastrowid)

    def test_command_creates_expected_schema_and_keys(self) -> None:
        self.assertTrue(self.database_path.is_file())
        with self.connect() as connection:
            tables = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table'"
                )
            }
            self.assertTrue(
                {"specs", "tasks", "task_dependencies", "session_logs"}.issubset(tables)
            )

            task_columns = {
                row[1]: row for row in connection.execute("PRAGMA table_info(tasks)")
            }
            self.assertEqual(
                set(task_columns),
                {
                    "id",
                    "spec_id",
                    "title",
                    "description",
                    "status",
                    "parent_id",
                    "branch",
                    "created_at",
                    "updated_at",
                },
            )
            self.assertEqual(task_columns["spec_id"][2], "INTEGER")
            self.assertEqual(task_columns["description"][2], "TEXT")
            self.assertEqual(task_columns["id"][5], 1)
            self.assertEqual(task_columns["spec_id"][3], 1)

            session_columns = {
                row[1]: row
                for row in connection.execute("PRAGMA table_info(session_logs)")
            }
            self.assertEqual(session_columns["taken_decisions"][2], "TEXT")
            self.assertEqual(session_columns["files_changed"][2], "TEXT")
            self.assertEqual(session_columns["created_at"][2], "TEXT")

            dependency_columns = list(
                connection.execute("PRAGMA table_info(task_dependencies)")
            )
            self.assertEqual(
                [(row[1], row[5]) for row in dependency_columns],
                [("task_id", 1), ("required_task_id", 2)],
            )

            task_foreign_keys = {
                (row[3], row[2], row[4], row[5], row[6])
                for row in connection.execute("PRAGMA foreign_key_list(tasks)")
            }
            self.assertIn(("spec_id", "specs", "id", "NO ACTION", "CASCADE"), task_foreign_keys)
            self.assertIn(("parent_id", "tasks", "id", "NO ACTION", "CASCADE"), task_foreign_keys)

            dependency_foreign_keys = {
                (row[3], row[2], row[4], row[6])
                for row in connection.execute("PRAGMA foreign_key_list(task_dependencies)")
            }
            self.assertEqual(
                dependency_foreign_keys,
                {
                    ("task_id", "tasks", "id", "CASCADE"),
                    ("required_task_id", "tasks", "id", "CASCADE"),
                },
            )

            triggers = {
                row[0]
                for row in connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'trigger'"
                )
            }
            self.assertTrue(
                {
                    "tasks_validate_parent_before_insert",
                    "tasks_require_completed_dependencies",
                    "task_dependencies_validate_before_insert",
                    "session_logs_validate_json_before_insert",
                }.issubset(triggers)
            )

    def test_constraints_keep_task_hierarchy_and_dependencies_consistent(self) -> None:
        with self.connect() as connection:
            primary_spec = self.add_spec(connection, "feature-alpha")
            other_spec = self.add_spec(connection, "feature-beta")
            parent = self.add_task(connection, primary_spec, "Parent")
            child = self.add_task(connection, primary_spec, "Child", parent_id=parent)

            with self.assertRaisesRegex(sqlite3.IntegrityError, "same spec"):
                self.add_task(connection, other_spec, "Invalid child", parent_id=parent)
            with self.assertRaisesRegex(sqlite3.IntegrityError, "cycle"):
                connection.execute("UPDATE tasks SET parent_id = ? WHERE id = ?", (child, parent))

            foundation = self.add_task(connection, primary_spec, "Foundation")
            implementation = self.add_task(connection, primary_spec, "Implementation")
            connection.execute(
                "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                (implementation, foundation),
            )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "cannot advance"):
                connection.execute("UPDATE tasks SET status = 'wip' WHERE id = ?", (implementation,))

            connection.execute("UPDATE tasks SET status = 'done' WHERE id = ?", (foundation,))
            connection.execute("UPDATE tasks SET status = 'wip' WHERE id = ?", (implementation,))
            self.assertEqual(
                connection.execute(
                    "SELECT status FROM tasks WHERE id = ?", (implementation,)
                ).fetchone()[0],
                "wip",
            )

            unfinished = self.add_task(connection, primary_spec, "Unexpected dependency")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "unfinished dependency"):
                connection.execute(
                    "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                    (implementation, unfinished),
                )

            cross_spec_task = self.add_task(connection, other_spec, "Other feature task")
            with self.assertRaisesRegex(sqlite3.IntegrityError, "same spec"):
                connection.execute(
                    "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                    (implementation, cross_spec_task),
                )

            first = self.add_task(connection, primary_spec, "First planned task")
            second = self.add_task(connection, primary_spec, "Second planned task")
            third = self.add_task(connection, primary_spec, "Third planned task")
            connection.execute(
                "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                (first, second),
            )
            connection.execute(
                "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                (second, third),
            )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "cycle"):
                connection.execute(
                    "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
                    (third, first),
                )

    def test_status_and_foreign_key_constraints(self) -> None:
        with self.connect() as connection:
            spec_id = self.add_spec(connection)
            with self.assertRaises(sqlite3.IntegrityError):
                self.add_task(connection, spec_id, "Not valid", status="started")
            with self.assertRaises(sqlite3.IntegrityError):
                self.add_task(connection, 9999, "Missing spec")
            with self.assertRaises(sqlite3.IntegrityError):
                connection.execute(
                    "INSERT INTO specs (title, slug, description) VALUES (?, ?, ?)",
                    ("Another feature", "feature-alpha", "Description"),
                )

    def test_session_log_json_contract_and_timestamp(self) -> None:
        with self.connect() as connection:
            spec_id = self.add_spec(connection)
            task_id = self.add_task(connection, spec_id, "Log work")
            decisions = json.dumps(
                [
                    {
                        "decision": "Use the existing authorization policy.",
                        "gap": "The task did not define a new role.",
                        "justify": "It preserves the current business rule.",
                    }
                ]
            )
            files = json.dumps(
                [
                    {
                        "type": "modification",
                        "file": "src/policy.py",
                        "reason": "Applied the agreed authorization rule.",
                    }
                ]
            )
            connection.execute(
                """
                INSERT INTO session_logs
                    (task_id, session_id, overview, taken_decisions, files_changed)
                VALUES (?, ?, ?, ?, ?)
                """,
                (task_id, "agent-session-1", "Implemented the policy.", decisions, files),
            )
            created_at = connection.execute(
                "SELECT created_at FROM session_logs WHERE task_id = ?", (task_id,)
            ).fetchone()[0]
            self.assertRegex(created_at, r"^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$")

            with self.assertRaisesRegex(sqlite3.IntegrityError, "valid JSON"):
                connection.execute(
                    """
                    INSERT INTO session_logs
                        (task_id, session_id, overview, taken_decisions, files_changed)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (task_id, "agent-session-2", "Bad decisions.", "not-json", "[]"),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "needs decision"):
                connection.execute(
                    """
                    INSERT INTO session_logs
                        (task_id, session_id, overview, taken_decisions, files_changed)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (task_id, "agent-session-3", "Incomplete decisions.", '[{"decision":"x"}]', "[]"),
                )
            with self.assertRaisesRegex(sqlite3.IntegrityError, "valid type"):
                connection.execute(
                    """
                    INSERT INTO session_logs
                        (task_id, session_id, overview, taken_decisions, files_changed)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (
                        task_id,
                        "agent-session-4",
                        "Bad file change.",
                        "[]",
                        '[{"type":"rename","file":"src/policy.py","reason":"x"}]',
                    ),
                )

    def test_existing_database_is_preserved_unless_force_is_given(self) -> None:
        with self.connect() as connection:
            connection.execute("CREATE TABLE sentinel (id INTEGER PRIMARY KEY)")

        no_force_result = self.run_command(self.destination)
        self.assertNotEqual(no_force_result.returncode, 0)
        self.assertIn("already exists", no_force_result.stderr)
        with self.connect() as connection:
            self.assertIsNotNone(
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sentinel'"
                ).fetchone()
            )

        force_result = self.run_command(self.destination, "--force")
        self.assertEqual(force_result.returncode, 0, force_result.stderr)
        with self.connect() as connection:
            self.assertIsNone(
                connection.execute(
                    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sentinel'"
                ).fetchone()
            )


if __name__ == "__main__":
    unittest.main()
