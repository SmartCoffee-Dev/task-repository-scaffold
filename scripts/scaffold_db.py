#!/usr/bin/env python3
"""Create the SQLite database used to plan and track feature implementation."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import sqlite3
import sys
import tempfile


DATABASE_FILENAME = "feature_workflow.sqlite3"

SCHEMA_SQL = """
PRAGMA foreign_keys = ON;

CREATE TABLE specs (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    slug TEXT NOT NULL UNIQUE CHECK (
        length(slug) > 0
        AND slug NOT GLOB '*[^a-z0-9-]*'
        AND slug NOT LIKE '-%'
        AND slug NOT LIKE '%-'
        AND slug NOT LIKE '%--%'
    ),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    current_revision_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (current_revision_id) REFERENCES spec_revisions(id) ON DELETE RESTRICT
);

CREATE TABLE spec_revisions (
    id INTEGER PRIMARY KEY,
    spec_id INTEGER NOT NULL,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    content TEXT NOT NULL CHECK (length(trim(content)) > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (spec_id, revision_number),
    FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE CASCADE
);

CREATE INDEX spec_revisions_by_spec_and_created_at
ON spec_revisions(spec_id, created_at);

CREATE TABLE definition_items (
    id INTEGER PRIMARY KEY,
    spec_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('clarification', 'tension', 'impact', 'example')),
    source TEXT NOT NULL CHECK (source IN ('description', 'spec', 'base_branch')),
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    question TEXT,
    suggested_resolution TEXT,
    example_type TEXT CHECK (example_type IN ('happy-path', 'edge-case')),
    fingerprint TEXT NOT NULL CHECK (length(trim(fingerprint)) > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('pending', 'accepted', 'rejected', 'incorporated')
    ),
    accepted_revision_number INTEGER NOT NULL DEFAULT 0 CHECK (accepted_revision_number >= 0),
    incorporated_in_revision_id INTEGER,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (type = 'example' AND example_type IS NOT NULL)
        OR (type <> 'example' AND example_type IS NULL)
    ),
    CHECK (
        type <> 'clarification'
        OR (question IS NOT NULL AND length(trim(question)) > 0)
    ),
    CHECK (
        (status = 'incorporated' AND incorporated_in_revision_id IS NOT NULL)
        OR (status <> 'incorporated' AND incorporated_in_revision_id IS NULL)
    ),
    FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE CASCADE,
    FOREIGN KEY (incorporated_in_revision_id) REFERENCES spec_revisions(id) ON DELETE RESTRICT
);

CREATE INDEX definition_items_by_spec_and_status
ON definition_items(spec_id, status);

CREATE INDEX definition_items_by_spec_and_type
ON definition_items(spec_id, type);

CREATE UNIQUE INDEX definition_items_unique_open_fingerprint
ON definition_items(spec_id, fingerprint)
WHERE status IN ('pending', 'accepted');

CREATE TABLE definition_responses (
    id INTEGER PRIMARY KEY,
    definition_item_id INTEGER NOT NULL,
    response_type TEXT NOT NULL CHECK (
        response_type IN ('answer', 'accept', 'reject', 'observation')
    ),
    content TEXT NOT NULL DEFAULT '' CHECK (
        response_type IN ('accept', 'reject') OR length(trim(content)) > 0
    ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (definition_item_id) REFERENCES definition_items(id) ON DELETE CASCADE
);

CREATE INDEX definition_responses_by_item_and_created_at
ON definition_responses(definition_item_id, created_at);

CREATE VIEW spec_definition_states AS
SELECT
    specs.id AS spec_id,
    CASE
        WHEN EXISTS (
            SELECT 1
            FROM definition_items
            WHERE definition_items.spec_id = specs.id
              AND definition_items.status = 'pending'
        ) THEN 'draft'
        ELSE 'defined'
    END AS definition_status
FROM specs;

CREATE TABLE tasks (
    id INTEGER PRIMARY KEY,
    spec_id INTEGER NOT NULL,
    title TEXT NOT NULL CHECK (length(trim(title)) > 0),
    description TEXT NOT NULL CHECK (length(trim(description)) > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN ('blocked', 'pending', 'wip', 'in_review', 'done')
    ),
    parent_id INTEGER,
    branch TEXT CHECK (branch IS NULL OR length(trim(branch)) > 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (spec_id) REFERENCES specs(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX tasks_by_spec_and_status ON tasks(spec_id, status);
CREATE INDEX tasks_by_parent ON tasks(parent_id);

CREATE TABLE task_dependencies (
    task_id INTEGER NOT NULL,
    required_task_id INTEGER NOT NULL,
    PRIMARY KEY (task_id, required_task_id),
    CHECK (task_id <> required_task_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (required_task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX task_dependencies_by_required_task ON task_dependencies(required_task_id);

CREATE TABLE session_logs (
    id INTEGER PRIMARY KEY,
    task_id INTEGER NOT NULL,
    session_id TEXT NOT NULL CHECK (length(trim(session_id)) > 0),
    overview TEXT NOT NULL CHECK (length(trim(overview)) > 0),
    taken_decisions TEXT NOT NULL DEFAULT '[]' CHECK (
        json_valid(taken_decisions) = 1
        AND json_type(taken_decisions) = 'array'
    ),
    files_changed TEXT NOT NULL DEFAULT '[]' CHECK (
        json_valid(files_changed) = 1
        AND json_type(files_changed) = 'array'
    ),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (task_id, session_id),
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX session_logs_by_task_and_created_at ON session_logs(task_id, created_at);

CREATE TRIGGER specs_touch_updated_at
AFTER UPDATE OF title, slug, description, current_revision_id ON specs
FOR EACH ROW
BEGIN
    UPDATE specs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER spec_revisions_require_sequential_numbers
BEFORE INSERT ON spec_revisions
FOR EACH ROW
WHEN NEW.revision_number <> COALESCE(
    (SELECT MAX(revision_number) + 1 FROM spec_revisions WHERE spec_id = NEW.spec_id),
    1
)
BEGIN
    SELECT RAISE(ABORT, 'Spec revision numbers must be sequential within a spec');
END;

CREATE TRIGGER spec_revisions_are_immutable
BEFORE UPDATE ON spec_revisions
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'Spec revisions are immutable');
END;

CREATE TRIGGER spec_revisions_become_current
AFTER INSERT ON spec_revisions
FOR EACH ROW
BEGIN
    UPDATE specs SET current_revision_id = NEW.id WHERE id = NEW.spec_id;
END;

CREATE TRIGGER specs_validate_current_revision_before_update
BEFORE UPDATE OF current_revision_id ON specs
FOR EACH ROW
WHEN NEW.current_revision_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM spec_revisions
            WHERE id = NEW.current_revision_id
              AND spec_id = NEW.id
        )
        THEN RAISE(ABORT, 'A current revision must belong to its spec')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM spec_revisions AS candidate
            JOIN spec_revisions AS current ON current.id = NEW.current_revision_id
            WHERE candidate.spec_id = NEW.id
              AND candidate.revision_number > current.revision_number
        )
        THEN RAISE(ABORT, 'A current revision must be the latest revision')
    END;
END;

CREATE TRIGGER specs_prevent_clearing_current_revision
BEFORE UPDATE OF current_revision_id ON specs
FOR EACH ROW
WHEN NEW.current_revision_id IS NULL
     AND EXISTS (SELECT 1 FROM spec_revisions WHERE spec_id = NEW.id)
BEGIN
    SELECT RAISE(ABORT, 'A spec with revisions must have a current revision');
END;

CREATE TRIGGER definition_items_start_pending
BEFORE INSERT ON definition_items
FOR EACH ROW
WHEN NEW.status <> 'pending'
BEGIN
    SELECT RAISE(ABORT, 'Definition items must start pending');
END;

CREATE TRIGGER definition_items_validate_status_transition
BEFORE UPDATE OF status ON definition_items
FOR EACH ROW
WHEN NEW.status <> OLD.status
BEGIN
    SELECT CASE
        WHEN NOT (
            (OLD.status = 'pending' AND NEW.status IN ('accepted', 'rejected'))
            OR (OLD.status = 'accepted' AND NEW.status IN ('rejected', 'incorporated'))
            OR (OLD.status = 'rejected' AND NEW.status = 'accepted')
        )
        THEN RAISE(ABORT, 'Invalid definition item status transition')
    END;

    SELECT CASE
        WHEN NEW.status = 'accepted' AND NOT EXISTS (
            SELECT 1
            FROM definition_responses
            WHERE definition_item_id = NEW.id
              AND response_type IN ('answer', 'accept')
        )
        THEN RAISE(ABORT, 'An accepted definition item needs an answer or acceptance')
    END;

    SELECT CASE
        WHEN NEW.status = 'rejected' AND NOT EXISTS (
            SELECT 1
            FROM definition_responses
            WHERE definition_item_id = NEW.id
              AND response_type = 'reject'
        )
        THEN RAISE(ABORT, 'A rejected definition item needs a rejection response')
    END;

    SELECT CASE
        WHEN NEW.status = 'incorporated' AND NOT EXISTS (
            SELECT 1
            FROM specs
            JOIN spec_revisions
              ON spec_revisions.id = NEW.incorporated_in_revision_id
            WHERE specs.id = NEW.spec_id
              AND specs.current_revision_id = NEW.incorporated_in_revision_id
              AND spec_revisions.spec_id = NEW.spec_id
              AND spec_revisions.revision_number > NEW.accepted_revision_number
        )
        THEN RAISE(
            ABORT,
            'An incorporated definition item needs a new current revision of its spec'
        )
    END;
END;

CREATE TRIGGER definition_items_capture_accepted_revision
AFTER UPDATE OF status ON definition_items
FOR EACH ROW
WHEN NEW.status = 'accepted' AND NEW.status <> OLD.status
BEGIN
    UPDATE definition_items
    SET accepted_revision_number = COALESCE(
        (
            SELECT spec_revisions.revision_number
            FROM specs
            JOIN spec_revisions ON spec_revisions.id = specs.current_revision_id
            WHERE specs.id = NEW.spec_id
        ),
        0
    )
    WHERE id = NEW.id;
END;

CREATE TRIGGER definition_items_validate_accepted_revision_number
BEFORE UPDATE OF accepted_revision_number ON definition_items
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NEW.status = 'incorporated'
        THEN RAISE(ABORT, 'An incorporated definition item cannot change its accepted revision')
    END;

    SELECT CASE
        WHEN NEW.accepted_revision_number <> COALESCE(
            (
                SELECT spec_revisions.revision_number
                FROM specs
                JOIN spec_revisions ON spec_revisions.id = specs.current_revision_id
                WHERE specs.id = NEW.spec_id
            ),
            0
        )
        THEN RAISE(ABORT, 'An accepted revision number must match the current spec revision')
    END;
END;

CREATE TRIGGER definition_items_touch_updated_at
AFTER UPDATE OF type, source, title, description, question, suggested_resolution,
                example_type, fingerprint, status, accepted_revision_number,
                incorporated_in_revision_id ON definition_items
FOR EACH ROW
BEGIN
    UPDATE definition_items SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER definition_responses_prevent_changes_after_incorporation
BEFORE INSERT ON definition_responses
FOR EACH ROW
WHEN EXISTS (
    SELECT 1
    FROM definition_items
    WHERE id = NEW.definition_item_id
      AND status = 'incorporated'
)
BEGIN
    SELECT RAISE(ABORT, 'Cannot add a response to an incorporated definition item');
END;

CREATE TRIGGER tasks_touch_updated_at
AFTER UPDATE OF title, description, status, parent_id, branch ON tasks
FOR EACH ROW
BEGIN
    UPDATE tasks SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER tasks_prevent_spec_change
BEFORE UPDATE OF spec_id ON tasks
FOR EACH ROW
WHEN NEW.spec_id <> OLD.spec_id
BEGIN
    SELECT RAISE(ABORT, 'A task cannot be moved to another spec');
END;

CREATE TRIGGER tasks_validate_parent_before_insert
BEFORE INSERT ON tasks
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NEW.parent_id = NEW.id
        THEN RAISE(ABORT, 'A task cannot be its own parent')
    END;

    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM tasks AS parent
            WHERE parent.id = NEW.parent_id
              AND parent.spec_id = NEW.spec_id
        )
        THEN RAISE(ABORT, 'A task parent must belong to the same spec')
    END;

    WITH RECURSIVE ancestors(id) AS (
        SELECT NEW.parent_id
        UNION
        SELECT task.parent_id
        FROM tasks AS task
        JOIN ancestors ON task.id = ancestors.id
        WHERE task.parent_id IS NOT NULL
    )
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
        THEN RAISE(ABORT, 'A task hierarchy cannot contain a cycle')
    END;
END;

CREATE TRIGGER tasks_validate_parent_before_update
BEFORE UPDATE OF parent_id ON tasks
FOR EACH ROW
WHEN NEW.parent_id IS NOT NULL
BEGIN
    SELECT CASE
        WHEN NEW.parent_id = NEW.id
        THEN RAISE(ABORT, 'A task cannot be its own parent')
    END;

    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM tasks AS parent
            WHERE parent.id = NEW.parent_id
              AND parent.spec_id = NEW.spec_id
        )
        THEN RAISE(ABORT, 'A task parent must belong to the same spec')
    END;

    WITH RECURSIVE ancestors(id) AS (
        SELECT NEW.parent_id
        UNION
        SELECT task.parent_id
        FROM tasks AS task
        JOIN ancestors ON task.id = ancestors.id
        WHERE task.parent_id IS NOT NULL
    )
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM ancestors WHERE id = NEW.id)
        THEN RAISE(ABORT, 'A task hierarchy cannot contain a cycle')
    END;
END;

CREATE TRIGGER tasks_require_completed_dependencies
BEFORE UPDATE OF status ON tasks
FOR EACH ROW
WHEN NEW.status IN ('wip', 'in_review', 'done')
BEGIN
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM task_dependencies AS dependency
            JOIN tasks AS required_task ON required_task.id = dependency.required_task_id
            WHERE dependency.task_id = NEW.id
              AND required_task.status <> 'done'
        )
        THEN RAISE(ABORT, 'A task cannot advance while dependencies are not done')
    END;
END;

CREATE TRIGGER task_dependencies_validate_before_insert
BEFORE INSERT ON task_dependencies
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM tasks AS task
            JOIN tasks AS required_task
              ON required_task.id = NEW.required_task_id
            WHERE task.id = NEW.task_id
              AND task.spec_id = required_task.spec_id
        )
        THEN RAISE(ABORT, 'Task dependencies must belong to the same spec')
    END;

    WITH RECURSIVE prerequisites(id) AS (
        SELECT NEW.required_task_id
        UNION
        SELECT dependency.required_task_id
        FROM task_dependencies AS dependency
        JOIN prerequisites ON dependency.task_id = prerequisites.id
    )
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM prerequisites WHERE id = NEW.task_id)
        THEN RAISE(ABORT, 'Task dependencies cannot contain a cycle')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM tasks AS task
            JOIN tasks AS required_task ON required_task.id = NEW.required_task_id
            WHERE task.id = NEW.task_id
              AND task.status IN ('wip', 'in_review', 'done')
              AND required_task.status <> 'done'
        )
        THEN RAISE(ABORT, 'Cannot add an unfinished dependency to an active task')
    END;
END;

CREATE TRIGGER task_dependencies_validate_before_update
BEFORE UPDATE OF task_id, required_task_id ON task_dependencies
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1
            FROM tasks AS task
            JOIN tasks AS required_task
              ON required_task.id = NEW.required_task_id
            WHERE task.id = NEW.task_id
              AND task.spec_id = required_task.spec_id
        )
        THEN RAISE(ABORT, 'Task dependencies must belong to the same spec')
    END;

    WITH RECURSIVE prerequisites(id) AS (
        SELECT NEW.required_task_id
        UNION
        SELECT dependency.required_task_id
        FROM task_dependencies AS dependency
        JOIN prerequisites ON dependency.task_id = prerequisites.id
    )
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM prerequisites WHERE id = NEW.task_id)
        THEN RAISE(ABORT, 'Task dependencies cannot contain a cycle')
    END;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM tasks AS task
            JOIN tasks AS required_task ON required_task.id = NEW.required_task_id
            WHERE task.id = NEW.task_id
              AND task.status IN ('wip', 'in_review', 'done')
              AND required_task.status <> 'done'
        )
        THEN RAISE(ABORT, 'Cannot add an unfinished dependency to an active task')
    END;
END;

CREATE TRIGGER session_logs_validate_json_before_insert
BEFORE INSERT ON session_logs
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN json_valid(NEW.taken_decisions) <> 1
        THEN RAISE(ABORT, 'taken_decisions must be valid JSON')
    END;
    SELECT CASE
        WHEN json_type(NEW.taken_decisions) <> 'array'
        THEN RAISE(ABORT, 'taken_decisions must be a JSON array')
    END;
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM json_each(NEW.taken_decisions)
            WHERE json_type(value) IS NOT 'object'
               OR json_type(value, '$.decision') IS NOT 'text'
               OR json_type(value, '$.gap') IS NOT 'text'
               OR json_type(value, '$.justify') IS NOT 'text'
               OR length(trim(json_extract(value, '$.decision'))) = 0
               OR length(trim(json_extract(value, '$.gap'))) = 0
               OR length(trim(json_extract(value, '$.justify'))) = 0
        )
        THEN RAISE(ABORT, 'Each taken_decisions item needs decision, gap, and justify text')
    END;

    SELECT CASE
        WHEN json_valid(NEW.files_changed) <> 1
        THEN RAISE(ABORT, 'files_changed must be valid JSON')
    END;
    SELECT CASE
        WHEN json_type(NEW.files_changed) <> 'array'
        THEN RAISE(ABORT, 'files_changed must be a JSON array')
    END;
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM json_each(NEW.files_changed)
            WHERE json_type(value) IS NOT 'object'
               OR json_type(value, '$.type') IS NOT 'text'
               OR lower(json_extract(value, '$.type'))
                    NOT IN ('creation', 'modification', 'deletion')
               OR json_type(value, '$.file') IS NOT 'text'
               OR json_type(value, '$.reason') IS NOT 'text'
               OR length(trim(json_extract(value, '$.file'))) = 0
               OR length(trim(json_extract(value, '$.reason'))) = 0
        )
        THEN RAISE(ABORT, 'Each files_changed item needs a valid type, file, and reason')
    END;
END;

CREATE TRIGGER session_logs_validate_json_before_update
BEFORE UPDATE OF taken_decisions, files_changed ON session_logs
FOR EACH ROW
BEGIN
    SELECT CASE
        WHEN json_valid(NEW.taken_decisions) <> 1
        THEN RAISE(ABORT, 'taken_decisions must be valid JSON')
    END;
    SELECT CASE
        WHEN json_type(NEW.taken_decisions) <> 'array'
        THEN RAISE(ABORT, 'taken_decisions must be a JSON array')
    END;
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM json_each(NEW.taken_decisions)
            WHERE json_type(value) IS NOT 'object'
               OR json_type(value, '$.decision') IS NOT 'text'
               OR json_type(value, '$.gap') IS NOT 'text'
               OR json_type(value, '$.justify') IS NOT 'text'
               OR length(trim(json_extract(value, '$.decision'))) = 0
               OR length(trim(json_extract(value, '$.gap'))) = 0
               OR length(trim(json_extract(value, '$.justify'))) = 0
        )
        THEN RAISE(ABORT, 'Each taken_decisions item needs decision, gap, and justify text')
    END;

    SELECT CASE
        WHEN json_valid(NEW.files_changed) <> 1
        THEN RAISE(ABORT, 'files_changed must be valid JSON')
    END;
    SELECT CASE
        WHEN json_type(NEW.files_changed) <> 'array'
        THEN RAISE(ABORT, 'files_changed must be a JSON array')
    END;
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM json_each(NEW.files_changed)
            WHERE json_type(value) IS NOT 'object'
               OR json_type(value, '$.type') IS NOT 'text'
               OR lower(json_extract(value, '$.type'))
                    NOT IN ('creation', 'modification', 'deletion')
               OR json_type(value, '$.file') IS NOT 'text'
               OR json_type(value, '$.reason') IS NOT 'text'
               OR length(trim(json_extract(value, '$.file'))) = 0
               OR length(trim(json_extract(value, '$.reason'))) = 0
        )
        THEN RAISE(ABORT, 'Each files_changed item needs a valid type, file, and reason')
    END;
END;
"""


def is_spec_defined(connection: sqlite3.Connection, spec_id: int) -> bool:
    """Return whether a persisted spec has no pending definition items.

    The database view owns the predicate so callers do not need to duplicate
    the definition-status rule in a CLI, dashboard, or workflow agent.
    """
    row = connection.execute(
        "SELECT definition_status FROM spec_definition_states WHERE spec_id = ?", (spec_id,)
    ).fetchone()
    if row is None:
        raise ValueError(f"Unknown spec id: {spec_id}")
    return row[0] == "defined"


def resolve_output_path(destination: Path) -> Path:
    """Use a directory as a container and a suffixed path as the database file."""
    if destination.exists() and destination.is_dir():
        return destination / DATABASE_FILENAME
    if destination.suffix:
        return destination
    return destination / DATABASE_FILENAME


def create_database(output_path: Path, force: bool = False) -> None:
    """Build the schema in a temporary file, then atomically publish it."""
    if output_path.exists() and not force:
        raise FileExistsError(
            f"The database already exists: {output_path}. Use --force to replace it."
        )
    if output_path.exists() and output_path.is_dir():
        raise IsADirectoryError(f"The database path is a directory: {output_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{output_path.name}.", suffix=".tmp", dir=output_path.parent
    )
    os.close(descriptor)
    temporary_path = Path(temporary_name)

    connection: sqlite3.Connection | None = None
    try:
        connection = sqlite3.connect(temporary_path)
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            connection.execute("SELECT json_valid('[]')")
        except sqlite3.OperationalError as error:
            raise RuntimeError(
                "The SQLite library used by Python needs JSON functions enabled."
            ) from error
        connection.executescript(SCHEMA_SQL)
        connection.commit()
        connection.close()
        connection = None
        os.replace(temporary_path, output_path)
    except Exception:
        if connection is not None:
            connection.close()
        temporary_path.unlink(missing_ok=True)
        raise


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create the SQLite database for feature implementation tracking."
    )
    parser.add_argument(
        "destination",
        type=Path,
        help=(
            "Destination directory or database file. A directory creates "
            f"{DATABASE_FILENAME} inside it."
        ),
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Replace an existing database at the resolved output path.",
    )
    return parser.parse_args(arguments)


def main(arguments: list[str] | None = None) -> int:
    parsed = parse_arguments(arguments if arguments is not None else sys.argv[1:])
    output_path = resolve_output_path(parsed.destination)
    try:
        create_database(output_path, force=parsed.force)
    except (OSError, RuntimeError, sqlite3.Error) as error:
        print(f"error: {error}", file=sys.stderr)
        return 1

    print(f"Database created: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
