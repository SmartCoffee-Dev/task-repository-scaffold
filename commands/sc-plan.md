# /sc-plan

## Purpose

Generate a plan of activities for a spec in `defined` state by decomposing it into user stories (level 1) and atomic activities per story (level 2). Each story and activity carries a bounded sub-spec in its `description` (same structure as the original spec) so sub-agents can work on them with full context and alignment. The plan is presented lightly in the chat (titles only), iterated upon with user feedback, and only persisted to the `tasks` table after explicit approval.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--spec_alias` | Yes | — | Slug-friendly unique identifier for the spec (lowercase letters, digits, and hyphens only). |
| `--base_branch` | No | `main` | Name of the branch against which the spec implementation will be integrated. |

### Parameter Extraction

The agent must parse the user's invocation string. Parameters are identified by their `--` prefix, followed by a space-separated value.

```
/sc-plan --spec_alias user-export --base_branch develop
```

If `--spec_alias` is missing, halt and ask the user to provide it.

---

## Database

All functions operate against `./feature_workflow.sqlite3` in the current working directory. The database path is resolved deterministically:

```python
from pathlib import Path
DB_PATH = Path.cwd() / "feature_workflow.sqlite3"
```

Every connection must enable foreign keys:

```python
import sqlite3
def connect():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn
```

---

## Level 1 — Query Functions (raw data access)

Each function opens its own connection via `connect()` and returns plain Python types (`dict`, `list[dict]`, `str`, `int`, `bool`, `None`). These are the building blocks for all decision logic.

### L1.1 — spec_by_slug

```python
def spec_by_slug(slug: str) -> dict | None:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT id, title, slug, description, current_revision_id, created_at, updated_at "
            "FROM specs WHERE slug = ?",
            (slug,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()
```

### L1.2 — current_revision_content

```python
def current_revision_content(spec_id: int) -> str | None:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT sr.content "
            "FROM specs s "
            "JOIN spec_revisions sr ON sr.id = s.current_revision_id "
            "WHERE s.id = ?",
            (spec_id,),
        ).fetchone()
        return row["content"] if row else None
    finally:
        conn.close()
```

### L1.3 — latest_revision_number

```python
def latest_revision_number(spec_id: int) -> int | None:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT MAX(revision_number) FROM spec_revisions WHERE spec_id = ?",
            (spec_id,),
        ).fetchone()
        return row[0] if row and row[0] is not None else None
    finally:
        conn.close()
```

### L1.4 — pending_definitions

```python
def pending_definitions(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, type, source, title, description, question, "
            "suggested_resolution, example_type, fingerprint, status, "
            "accepted_revision_number, incorporated_in_revision_id, created_at "
            "FROM definition_items "
            "WHERE spec_id = ? AND status = 'pending' "
            "ORDER BY created_at, id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.5 — is_defined_query

```python
def is_defined_query(spec_id: int) -> bool:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        row = conn.execute(
            "SELECT definition_status FROM spec_definition_states WHERE spec_id = ?",
            (spec_id,),
        ).fetchone()
        if row is None:
            raise ValueError(f"Unknown spec_id: {spec_id}")
        return row[0] == "defined"
    finally:
        conn.close()
```

### L1.6 — tasks_for_spec

Returns all tasks belonging to a spec, ordered by `id`. Root tasks (user stories) have `parent_id IS NULL`; child tasks (activities) have a non-null `parent_id`.

```python
def tasks_for_spec(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, spec_id, title, description, status, parent_id, branch, "
            "created_at, updated_at "
            "FROM tasks "
            "WHERE spec_id = ? "
            "ORDER BY id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.7 — tasks_root_for_spec

Returns only root tasks (user stories, `parent_id IS NULL`) for a spec, ordered by `id`.

```python
def tasks_root_for_spec(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, spec_id, title, description, status, parent_id, branch, "
            "created_at, updated_at "
            "FROM tasks "
            "WHERE spec_id = ? AND parent_id IS NULL "
            "ORDER BY id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.8 — children_of_task

Returns all child tasks for a given parent task, ordered by `id`.

```python
def children_of_task(parent_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, spec_id, title, description, status, parent_id, branch, "
            "created_at, updated_at "
            "FROM tasks "
            "WHERE parent_id = ? "
            "ORDER BY id",
            (parent_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.9 — create_task

Insert a task. For user stories, `parent_id` must be `None`. For activities, `parent_id` must reference a valid task in the same spec.

```python
def create_task(
    spec_id: int,
    title: str,
    description: str,
    parent_id: int | None = None,
    branch: str | None = None,
) -> int:
    """Insert a task. Returns the new task id."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        cursor = conn.execute(
            "INSERT INTO tasks (spec_id, title, description, status, parent_id, branch) "
            "VALUES (?, ?, ?, 'pending', ?, ?)",
            (spec_id, title, description, parent_id, branch),
        )
        conn.commit()
        return int(cursor.lastrowid)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.10 — create_task_dependency

Insert a dependency between two tasks. Both must belong to the same spec. The database trigger `task_dependencies_validate_before_insert` enforces this and prevents cycles.

```python
def create_task_dependency(task_id: int, required_task_id: int) -> None:
    """Insert a dependency edge. task_id requires required_task_id to be done first."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute(
            "INSERT INTO task_dependencies (task_id, required_task_id) VALUES (?, ?)",
            (task_id, required_task_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.11 — delete_all_tasks_for_spec

Delete every task belonging to a spec. Foreign key `ON DELETE CASCADE` ensures `task_dependencies` and `session_logs` are cleaned up as well.

```python
def delete_all_tasks_for_spec(spec_id: int) -> int:
    """Delete all tasks for a spec. Returns the number of deleted rows."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        cursor = conn.execute("DELETE FROM tasks WHERE spec_id = ?", (spec_id,))
        conn.commit()
        return cursor.rowcount
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.12 — task_dependencies_for_spec

Returns all dependencies where both tasks belong to the given spec, ordered by `task_id`.

```python
def task_dependencies_for_spec(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT td.task_id, td.required_task_id "
            "FROM task_dependencies td "
            "JOIN tasks t ON t.id = td.task_id "
            "WHERE t.spec_id = ? "
            "ORDER BY td.task_id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

---

## Level 2 — Boolean Interpretation Functions

These functions consume Level 1 functions and reduce their results to boolean decisions. They do **not** open database connections directly.

### L2.1 — spec_exists

```python
def spec_exists(slug: str) -> bool:
    return spec_by_slug(slug) is not None
```

### L2.2 — spec_is_defined

```python
def spec_is_defined(spec_id: int) -> bool:
    """True if no pending definition items exist for the spec."""
    return is_defined_query(spec_id)
```

### L2.3 — has_pending_definitions

```python
def has_pending_definitions(spec_id: int) -> bool:
    return len(pending_definitions(spec_id)) > 0
```

### L2.4 — has_existing_tasks

```python
def has_existing_tasks(spec_id: int) -> bool:
    return len(tasks_for_spec(spec_id)) > 0
```

---

## Sub-spec template

Every user story and activity carries a bounded sub-spec as its `description`. The sub-spec must follow the same structure as the parent spec ([spec content template](./docs/spec-content-template.md)) so sub-agents receive full, aligned context:

```markdown
# Goal
(What this story/activity solves, aligned with the parent spec's goal)

# Impact
(Collateral effects of this specific story/activity on the system)

# Scope
## Included
(Bounded, verifiable scope — concrete items that are in scope for this story/activity)
## Excluded
(What is explicitly NOT in scope — natural extensions or adjacent concerns)

# Acceptance
(Testable criteria that must be satisfied for this story/activity to be considered done)

# RBAC
## Authorized
(Actors entitled to interact with or benefit from this story/activity)
## Unauthorized
(Actors explicitly excluded, even if they might appear to have a legitimate claim)

# ADR
(Technical design decisions relevant to this specific story/activity — how to build, not what)

# Relevant Files
(Files involved in this story/activity — create, modify, or awareness)
```

---

## Workflow

The agent must execute these steps in strict order. At each decision point, respond to the user with the required action or question before proceeding.

### Constraint: plan is live until approved

The plan exists only in memory (the agent's context) during the interactive phase. Nothing is written to the database until the user explicitly approves the plan. The user may iterate freely — reorder, add, remove, rename, or adjust dependencies — and the agent regenerates the in-memory plan each round without touching the database.

---

### Step 1 — Verify spec existence

```
spec = spec_by_slug(slug=spec_alias)
```

**Branch A — spec does NOT exist (`spec is None`):**

Halt. Inform the user:

> Spec `{spec_alias}` not found. Create it first with `/sc-add-to-spec --spec_alias {spec_alias} --description "..."`.

**Branch B — spec EXISTS (`spec is not None`):**

Store `spec_id = spec["id"]`. Proceed to Step 2.

---

### Step 2 — Block if spec is not defined

```
if not spec_is_defined(spec_id):
```

**Branch A — spec is in `draft` state (pending definition items exist):**

1. List the pending items to the user:

   > The spec `{slug}` is not yet **defined**. It has {count} open definition items that must be resolved before planning:
   > - `#{id}` [{type}] {title}

2. **Halt.** Tell the user:

   > Please resolve these items via the dashboard (`task-repository dashboard`) before continuing. Once the spec is `defined`, re-run this command.

**Branch B — spec is `defined`:**

Proceed to Step 3.

---

### Step 3 — Handle existing tasks

```
existing = has_existing_tasks(spec_id)
```

**Branch A — existing tasks found:**

1. Retrieve the existing task tree:
   ```
   roots = tasks_root_for_spec(spec_id)
   deps = task_dependencies_for_spec(spec_id)
   ```

2. Present a summary of existing tasks to the user:

   > The spec `{slug}` already has {count} tasks across {root_count} user stories:
   > - US: {title} ({child_count} activities)
   > - US: {title} ({child_count} activities)
   >
   > What would you like to do?
   > 1. **Replace** — remove all existing tasks and generate a completely new plan
   > 2. **Extend** — keep existing tasks and add new user stories and activities to the plan
   > 3. **Cancel** — leave everything as-is

3. Based on the user's choice:

   - **Replace**: store `plan_mode = "replace"`. Proceed to Step 4.
   - **Extend**: store `plan_mode = "extend"`. Load existing tasks into the in-memory plan as a starting point. Proceed to Step 4.
   - **Cancel**: halt. Nothing is modified.

**Branch B — no existing tasks:**

Store `plan_mode = "replace"` (semantically equivalent — first plan). Proceed to Step 4.

---

### Step 4 — Load spec content and generate the plan

Load the full context:

```
content = current_revision_content(spec_id)
rev_number = latest_revision_number(spec_id)
```

The agent must analyze the spec's sections — Goal, Impact, Scope, Acceptance, RBAC, ADR, and Relevant Files — and decompose them into:

#### 4.1 — Generate user stories (level 1)

A user story is a root task (`parent_id = NULL`) that delivers real, independently valuable functionality to an identifiable stakeholder. Stakeholders are inferred from the spec's RBAC section (and, if applicable, from Goal/Scope mentions of user roles or personas).

Each user story must have:

| Field | Content |
|-------|---------|
| `title` | `[US-{N}] {Verbo} {qué} {para quién}` — concise, stakeholder-visible outcome |
| `description` | Full sub-spec following the [sub-spec template](#sub-spec-template). The Goal must name the stakeholder and the value they gain. Scope must be bounded and falsifiable. Acceptance must list testable criteria specific to this story. |
| Stakeholder | Inferred from the spec. Displayed in the chat summary but not stored as a separate column (it is embedded in the sub-spec). |

**Guidelines for story decomposition:**

- Each story must be independently valuable: a stakeholder would consider the feature incomplete without this story, yet the story itself delivers a usable increment.
- Stories should be ordered by priority (natural order = priority). Higher-priority stories are presented first.
- A story's scope should be narrow enough that it can be completed in a reasonable timeframe, yet broad enough to deliver real value. If a story feels too large, split it further.
- If a story depends on another story (e.g., "Export data" requires "Filter data"), document the dependency. Dependencies between stories become `task_dependencies` at the root level.

#### 4.2 — Generate activities per user story (level 2)

For each user story, generate a list of atomic activities (child tasks, `parent_id` pointing to the story). Each activity must be:

| Field | Content |
|-------|---------|
| `title` | Concrete verb phrase — `Crear endpoint X`, `Implementar servicio Y`, `Agregar validación Z` |
| `description` | Full sub-spec following the [sub-spec template](#sub-spec-template), bounded to only what this activity covers. Relevant Files are especially important here: list the exact files this activity will create, modify, or need awareness of. |

**Guidelines for activity decomposition:**

- Each activity must be atomic: one unit of work that can be completed in a single focused session.
- Activities should be ordered within their story by execution sequence. Natural dependencies (e.g., "Create model" before "Create endpoint") are implicit in the ordering; explicit `task_dependencies` are only needed for cross-story dependencies.
- An activity's sub-spec should be narrow enough that a sub-agent can read it and know exactly what to do, what files to touch, and what constitutes "done."
- Each activity must have concrete acceptance criteria in its sub-spec.

#### 4.3 — Identify cross-story dependencies

Some user stories may depend on others. For example, "View exported file history" depends on "Export file" being completed first. These become `task_dependencies` between root tasks:

```
story_b requires story_a → task_dependencies(task_id=story_b.id, required_task_id=story_a.id)
```

Dependencies within a story (activities depending on each other) are implicit in their ordering and do not need explicit `task_dependencies` entries unless the user requests them.

---

### Step 5 — Present the plan in chat (titles only)

Render the plan lightly — show only titles, not the full sub-specs. The full sub-specs are part of the in-memory plan and will be persisted on approval.

**For `replace` mode:**

```
## Plan for spec: {slug} (revision {rev_number})

### US-1: {title}
  - {activity_title}
  - {activity_title}
  ⬆️ depends on: US-3

### US-2: {title}
  - {activity_title}
  - {activity_title}
  - {activity_title}

### US-3: {title}
  - {activity_title}
  - {activity_title}
```

**For `extend` mode:**

First show existing tasks (read-only context), then the new additions:

```
## Existing tasks for spec: {slug}

### US-1: {title} [EXISTING]
  - {activity_title}
  - {activity_title}

### US-2: {title} [EXISTING]
  - {activity_title}

---

## New additions to the plan

### US-3: {title} [NEW]
  - {activity_title}
  - {activity_title}
  ⬆️ depends on: US-2
```

After presenting, ask:

> Would you like to adjust anything? You can reorder, add, remove, rename stories/activities, or adjust dependencies. Reply `approved` or `ok` when the plan looks good.

---

### Step 6 — Iterate on feedback

The user may request changes. The agent updates the in-memory plan accordingly and re-presents it (titles only). No database writes occur during this phase.

Common adjustments the agent must handle:

| User request | Action |
|-------------|--------|
| Reorder stories | Adjust the in-memory list order |
| Add a user story | Insert into the in-memory list at the specified position; generate sub-spec |
| Remove a user story | Delete from the in-memory list (and all its activities) |
| Rename a story or activity | Update `title` in the in-memory plan |
| Add an activity to a story | Append to the story's activity list; generate sub-spec |
| Remove an activity | Delete from the story's activity list |
| Add/remove a cross-story dependency | Update the in-memory dependency list |
| "Show details for US-N" | On explicit request, display the full sub-spec for that story (including activities' sub-specs) |

Continue iterating until the user explicitly approves. Recognized approval signals: `approved`, `ok`, `looks good`, `guardar`, `aprobar`, `save`, `yes`, `confirm`.

---

### Step 7 — Persist the plan

This step runs **only after explicit user approval**.

#### 7.1 — For `replace` mode

Delete all existing tasks (cascade removes dependencies and logs):

```
deleted = delete_all_tasks_for_spec(spec_id)
```

Then insert all stories and activities from the in-memory plan.

#### 7.2 — For `extend` mode

Keep existing tasks. Only insert the new stories and activities from the in-memory plan. Do not delete anything.

#### 7.3 — Insert stories first, then activities

Stories must be inserted before their children so `parent_id` references are valid:

```
story_id_map = {}  # in-memory index → database id

for index, story in enumerate(plan.stories):
    if story.is_new or plan_mode == "replace":
        task_id = create_task(
            spec_id=spec_id,
            title=story.title,
            description=story.description,
            parent_id=None,
            branch=None,
        )
        story_id_map[index] = task_id
    else:
        story_id_map[index] = story.existing_id

for index, story in enumerate(plan.stories):
    parent_id = story_id_map[index]
    for activity in story.activities:
        if activity.is_new or plan_mode == "replace":
            create_task(
                spec_id=spec_id,
                title=activity.title,
                description=activity.description,
                parent_id=parent_id,
                branch=None,
            )

for dep in plan.dependencies:
    if dep.is_new or plan_mode == "replace":
        create_task_dependency(
            task_id=story_id_map[dep.story_index],
            required_task_id=story_id_map[dep.required_story_index],
        )
```

#### 7.4 — Report

```
Plan persisted for spec `{slug}`: {story_count} user stories, {activity_count} activities, {dep_count} cross-story dependencies.
```

---

### Step 8 — Final status

Print a summary:

```
Spec: {slug} (id={spec_id})
Revision: {rev_number}
Tasks: {story_count} user stories, {activity_count} activities
Dependencies: {dep_count}
```

> Run `task-repository dashboard` to view and manage the task board.

---

## Session Awareness

If the agent has a session context, it must track:

- **`--base_branch` reuse:** If `--base_branch` was specified in a previous invocation of `/sc-add-to-spec`, `/sc-definitions-to-spec`, or this command within the same session, reuse that value unless the user provides a different one.
- **Spec context:** The spec being worked on should be remembered for the session duration, so subsequent mentions do not require re-validation of existence.
- **Plan in progress:** If a plan was partially iterated but not yet approved, the agent should remember it within the session so the user can resume without re-generating from scratch.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Database file not found | Inform the user: `"No feature_workflow.sqlite3 found in the current directory. Create one with: python3 scripts/scaffold_db.py ."` |
| `--spec_alias` missing | Ask the user to provide it. |
| `--spec_alias` invalid (characters outside `[a-z0-9-]`, leading/trailing hyphens, consecutive hyphens) | Reject and ask for a valid slug. |
| Spec not found | Inform: `"Spec '{spec_alias}' not found. Create it first with /sc-add-to-spec."` |
| Spec is not `defined` (pending definition items exist) | List pending items and halt. Tell user to resolve via dashboard first. |
| No spec revision content available | Unexpected error — report and halt. |
| `create_task` fails | Roll back any tasks already inserted in this batch and report the error. |
| `create_task_dependency` fails | Roll back the dependency and report which pair caused the issue. Continue with remaining dependencies. |
| SQLite integrity error on insert | Report the specific constraint violation and halt. |
| User cancels or does not approve the plan | Discard the in-memory plan. Nothing is written to the database. |