from __future__ import annotations

import http.client
import importlib
from pathlib import Path
import sqlite3
import socket
import subprocess
import sys
import tempfile
import time
from threading import Thread
from urllib.parse import quote

import unittest


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = REPOSITORY_ROOT / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))
DATABASE_FILENAME = "feature_workflow.sqlite3"

scaffold_db_ = importlib.import_module("scaffold_db")
dashboard_ = importlib.import_module("dashboard")

SCRIPT = SCRIPTS_DIR / "scaffold_db.py"


def add_spec(connection: sqlite3.Connection, slug: str = "feature-alpha", title: str = "Feature Alpha") -> int:
    cursor = connection.execute(
        "INSERT INTO specs (title, slug, description) VALUES (?, ?, ?)",
        (title, slug, "# Goal\nImplement the requested feature."),
    )
    return int(cursor.lastrowid)


def add_revision(
    connection: sqlite3.Connection,
    spec_id: int,
    revision_number: int,
    content: str | None = None,
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO spec_revisions (spec_id, revision_number, content)
        VALUES (?, ?, ?)
        """,
        (spec_id, revision_number, content or f"# Feature revision {revision_number}"),
    )
    return int(cursor.lastrowid)


def add_definition_item(
    connection: sqlite3.Connection,
    spec_id: int,
    *,
    item_type: str = "clarification",
    source: str = "description",
    fingerprint: str | None = None,
    question: str | None = "What should happen when the budget does not exist?",
    example_type: str | None = None,
    title: str = "Budget behavior needs a decision",
    description: str = "The request does not state how a missing budget is handled.",
    suggested_resolution: str = "Create the budget automatically.",
) -> int:
    if fingerprint is None:
        fingerprint = f"{item_type}-{source}-{spec_id}-{hash(title)}"
    cursor = connection.execute(
        """
        INSERT INTO definition_items (
            spec_id, type, source, title, description, question,
            suggested_resolution, example_type, fingerprint, status
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        """,
        (
            spec_id,
            item_type,
            source,
            title,
            description,
            question,
            suggested_resolution,
            example_type,
            fingerprint,
        ),
    )
    return int(cursor.lastrowid)


def add_definition_response(
    connection: sqlite3.Connection,
    definition_item_id: int,
    response_type: str,
    content: str = "The user confirmed this behavior.",
) -> int:
    cursor = connection.execute(
        """
        INSERT INTO definition_responses (definition_item_id, response_type, content)
        VALUES (?, ?, ?)
        """,
        (definition_item_id, response_type, content),
    )
    return int(cursor.lastrowid)


def find_free_port() -> int:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class DashboardIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary_directory = tempfile.TemporaryDirectory()
        cls.destination = Path(cls.temporary_directory.name) / "output"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(cls.destination)],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Scaffold creation failed: {result.stderr}")
        cls.database_path = cls.destination / DATABASE_FILENAME

        connection = sqlite3.connect(cls.database_path)
        connection.execute("PRAGMA foreign_keys = ON")

        cls.spec_id = add_spec(connection, "create-budget", "Create Budget")
        add_revision(connection, cls.spec_id, 1, "# Create Budget\n\nFull spec for budget creation.")
        cls.other_spec_id = add_spec(connection, "import-budget", "Import Budget")
        add_revision(connection, cls.other_spec_id, 1, "# Import Budget\n\nFull spec for budget import.")

        cls.clarification_id = add_definition_item(
            connection, cls.spec_id,
            item_type="clarification",
            fingerprint="budget-missing-behavior",
            question="What should happen when the budget does not exist?",
        )
        cls.impact_id = add_definition_item(
            connection, cls.spec_id,
            item_type="impact",
            question=None,
            fingerprint="budget-impact-auth",
            title="Authorization impact",
            description="The change may affect existing permissions.",
        )
        cls.example_id = add_definition_item(
            connection, cls.spec_id,
            item_type="example",
            question=None,
            fingerprint="budget-edge-case",
            example_type="edge-case",
            title="Edge case: zero budget",
            description="What happens when the amount is zero?",
        )

        connection.commit()
        connection.close()

        cls.port = find_free_port()
        application = dashboard_.DashboardApplication(cls.database_path)
        handler = dashboard_.make_handler(application)
        cls.server = dashboard_.ThreadingHTTPServer(("127.0.0.1", cls.port), handler)
        cls.server_thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.server_thread.start()
        time.sleep(0.1)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.server_thread.join(timeout=2)
        cls.temporary_directory.cleanup()

    def connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def request(self, method: str, path: str, body: str | None = None) -> tuple[int, dict[str, str], str]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Content-Type": "application/x-www-form-urlencoded"} if body else {}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        headers = dict(response.getheaders())
        body_bytes = response.read()
        connection.close()
        return response.status, headers, body_bytes.decode("utf-8", errors="replace")

    def test_list_specs(self) -> None:
        status, _, body = self.request("GET", "/")
        self.assertEqual(status, 200)
        self.assertIn("Create Budget", body)
        self.assertIn("Import Budget", body)
        self.assertIn("create-budget", body)

    def test_open_spec_detail(self) -> None:
        status, _, body = self.request("GET", f"/specs/{self.spec_id}")
        self.assertEqual(status, 200)
        self.assertIn("Create Budget", body)
        self.assertIn("Definición actual", body)
        self.assertIn("Asuntos de definición", body)

    def test_shows_pending_items(self) -> None:
        status, _, body = self.request("GET", f"/specs/{self.spec_id}")
        self.assertEqual(status, 200)
        self.assertIn("pending", body.lower())
        self.assertIn("Asuntos de definición", body)

    def test_answer_clarification(self) -> None:
        status, headers, body = self.request(
            "POST",
            f"/items/{self.clarification_id}/answer",
            body=f"content={quote('Do not create automatically.')}",
        )
        self.assertEqual(status, 303)
        self.assertIn(f"/specs/{self.spec_id}", headers.get("Location", ""))

        with self.connect() as connection:
            item = connection.execute(
                "SELECT status FROM definition_items WHERE id = ?", (self.clarification_id,)
            ).fetchone()
            self.assertEqual(item[0], "accepted")

            responses = list(connection.execute(
                "SELECT response_type, content FROM definition_responses WHERE definition_item_id = ?",
                (self.clarification_id,),
            ))
            self.assertTrue(any(r[0] == "answer" for r in responses))

    def test_accept_impact(self) -> None:
        status, headers, body = self.request(
            "POST",
            f"/items/{self.impact_id}/decision",
            body="decision=accept&observation=Noted.",
        )
        self.assertEqual(status, 303)

        with self.connect() as connection:
            item = connection.execute(
                "SELECT status FROM definition_items WHERE id = ?", (self.impact_id,)
            ).fetchone()
            self.assertEqual(item[0], "accepted")

            responses = list(connection.execute(
                "SELECT response_type, content FROM definition_responses WHERE definition_item_id = ?",
                (self.impact_id,),
            ))
            self.assertTrue(any(r[0] == "accept" for r in responses))
            self.assertTrue(any(r[0] == "observation" and r[1] == "Noted." for r in responses))

    def test_reject_impact(self) -> None:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        impact_id = add_definition_item(
            connection, self.spec_id,
            item_type="impact",
            question=None,
            fingerprint="budget-impact-reject-test-99",
            title="Another impact",
            description="Might cause trouble.",
        )
        connection.commit()
        connection.close()

        status, _, _ = self.request(
            "POST",
            f"/items/{impact_id}/decision",
            body="decision=reject",
        )
        self.assertEqual(status, 303)

        with self.connect() as connection:
            item = connection.execute(
                "SELECT status FROM definition_items WHERE id = ?", (impact_id,)
            ).fetchone()
            self.assertEqual(item[0], "rejected")

            responses = list(connection.execute(
                "SELECT response_type FROM definition_responses WHERE definition_item_id = ?",
                (impact_id,),
            ))
            self.assertTrue(any(r[0] == "reject" for r in responses))

    def test_accept_example(self) -> None:
        status, _, _ = self.request(
            "POST",
            f"/items/{self.example_id}/decision",
            body="decision=accept&observation=Good case to cover.",
        )
        self.assertEqual(status, 303)

        with self.connect() as connection:
            item = connection.execute(
                "SELECT status FROM definition_items WHERE id = ?", (self.example_id,)
            ).fetchone()
            self.assertEqual(item[0], "accepted")

            responses = list(connection.execute(
                "SELECT response_type FROM definition_responses WHERE definition_item_id = ?",
                (self.example_id,),
            ))
            self.assertTrue(any(r[0] == "accept" for r in responses))

    def test_response_history_visible(self) -> None:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        item_id = add_definition_item(
            connection, self.spec_id,
            item_type="clarification",
            fingerprint="budget-history-test-88",
            question="Test history visibility?",
            title="History test",
        )
        add_definition_response(connection, item_id, "answer", "Yes, history works.")
        connection.execute("UPDATE definition_items SET status = 'accepted' WHERE id = ?", (item_id,))
        connection.commit()
        connection.close()

        status, _, body = self.request("GET", f"/specs/{self.spec_id}")
        self.assertEqual(status, 200)
        self.assertIn("History test", body)
        self.assertIn("answer", body)

    def test_interaction_does_not_modify_spec_content(self) -> None:
        with self.connect() as connection:
            before = connection.execute(
                "SELECT content FROM spec_revisions WHERE spec_id = ?", (self.spec_id,)
            ).fetchone()[0]

        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        item_id = add_definition_item(
            connection, self.spec_id,
            item_type="clarification",
            fingerprint="budget-no-modification-check-77",
            question="Does this modify the spec?",
            title="Integrity check",
        )
        add_definition_response(connection, item_id, "answer", "No.")
        connection.execute("UPDATE definition_items SET status = 'accepted' WHERE id = ?", (item_id,))
        connection.commit()
        connection.close()

        with self.connect() as connection:
            after = connection.execute(
                "SELECT content FROM spec_revisions WHERE spec_id = ?", (self.spec_id,)
            ).fetchone()[0]

        self.assertEqual(before, after)

    def test_status_reflects_after_interaction(self) -> None:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        item_id = add_definition_item(
            connection, self.spec_id,
            item_type="impact",
            question=None,
            fingerprint="budget-status-reflect-66",
            title="Status reflection test",
            description="Check status updates.",
        )
        connection.commit()
        connection.close()

        status, _, body = self.request("POST", f"/items/{item_id}/decision", body="decision=accept")
        self.assertEqual(status, 303)

        with self.connect() as connection:
            item = connection.execute(
                "SELECT status FROM definition_items WHERE id = ?", (item_id,)
            ).fetchone()
            self.assertEqual(item[0], "accepted")

    def test_spec_definition_status_shown(self) -> None:
        status, _, body = self.request("GET", f"/specs/{self.spec_id}")
        self.assertEqual(status, 200)
        self.assertIn("draft", body.lower())

    def test_unknown_spec_returns_error(self) -> None:
        status, _, body = self.request("GET", "/specs/99999")
        self.assertIn(status, (400, 404))

    def test_empty_answer_rejected(self) -> None:
        connection = sqlite3.connect(self.database_path)
        connection.execute("PRAGMA foreign_keys = ON")
        item_id = add_definition_item(
            connection, self.spec_id,
            item_type="clarification",
            fingerprint="budget-empty-answer-55",
            question="Test empty?",
            title="Empty answer test",
        )
        connection.commit()
        connection.close()

        status, _, _ = self.request("POST", f"/items/{item_id}/answer", body="content=")
        self.assertGreaterEqual(status, 400)

    def test_two_instances_different_databases(self) -> None:
        other_tempdir = tempfile.TemporaryDirectory()
        other_dest = Path(other_tempdir.name) / "other"
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(other_dest)],
            cwd=REPOSITORY_ROOT,
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0)

        other_db_path = other_dest / DATABASE_FILENAME
        connection = sqlite3.connect(other_db_path)
        connection.execute("PRAGMA foreign_keys = ON")
        other_spec = add_spec(connection, "remote-feature", "Remote Feature")
        add_revision(connection, other_spec, 1, "# Remote")
        add_definition_item(
            connection, other_spec,
            item_type="clarification",
            fingerprint="remote-clarification",
            question="Remote question?",
            title="Remote item",
        )
        connection.commit()
        connection.close()

        other_port = find_free_port()
        other_app = dashboard_.DashboardApplication(other_db_path)
        other_handler = dashboard_.make_handler(other_app)
        other_server = dashboard_.ThreadingHTTPServer(("127.0.0.1", other_port), other_handler)
        other_thread = Thread(target=other_server.serve_forever, daemon=True)
        other_thread.start()
        time.sleep(0.1)

        try:
            status1, _, body1 = self.request("GET", "/")
            status2, _, body2 = self.request("GET", f"/specs/{other_spec}")

            self.assertEqual(status1, 200)
            self.assertIn("Create Budget", body1)
            self.assertNotIn("Remote Feature", body1)

            alt_conn = http.client.HTTPConnection("127.0.0.1", other_port, timeout=5)
            alt_conn.request("GET", "/")
            alt_resp = alt_conn.getresponse()
            alt_body = alt_resp.read().decode("utf-8", errors="replace")
            alt_conn.close()

            self.assertEqual(alt_resp.status, 200)
            self.assertIn("Remote Feature", alt_body)
            self.assertNotIn("Create Budget", alt_body)
        finally:
            other_server.shutdown()
            other_server.server_close()
            other_thread.join(timeout=2)
            other_tempdir.cleanup()


if __name__ == "__main__":
    unittest.main()