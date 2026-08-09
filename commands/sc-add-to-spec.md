# /sc-add-to-spec

## Purpose

Add a new description to incorporate into a new revision of a spec. The command analyzes the incoming description against the current state of the spec and the codebase, detects discrepancies or ambiguities, and generates `definition_items` that the human must resolve via the dashboard before the spec can be considered `defined`.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--spec_alias` | Yes | — | Slug-friendly unique identifier for the spec (lowercase letters, digits, and hyphens only). |
| `--base_branch` | No | `main` | Name of the branch against which the spec implementation will be integrated. Used as `source = 'base_branch'` when generating definition items related to codebase discrepancies. |
| `--description` | Yes | — | New aspects to add to the spec and/or guidelines for how to implement them. Free-form text. |

### Parameter Extraction

The agent must parse the user's invocation string. Parameters are identified by their `--` prefix, followed by a space-separated value. The `--description` value spans until the next `--` flag or end of input.

```
/sc-add-to-spec --spec_alias user-export --base_branch develop --description Add CSV export endpoint with column selection. Use streaming to avoid memory issues.
```

If `--spec_alias` or `--description` is missing, halt and ask the user to provide them.

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

### L1.2 — pending_definitions

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

### L1.3 — accepted_unincorporated

```python
def accepted_unincorporated(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, type, source, title, description, question, "
            "suggested_resolution, example_type, fingerprint, "
            "accepted_revision_number, incorporated_in_revision_id "
            "FROM definition_items "
            "WHERE spec_id = ? AND status = 'accepted' "
            "ORDER BY accepted_revision_number, id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.4 — current_revision_content

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

### L1.5 — active_fingerprints

```python
def active_fingerprints(spec_id: int) -> set[str]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT fingerprint FROM definition_items "
            "WHERE spec_id = ? AND status IN ('pending', 'accepted')",
            (spec_id,),
        ).fetchall()
        return {r[0] for r in rows}
    finally:
        conn.close()
```

### L1.6 — all_definition_items

```python
def all_definition_items(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT di.id, di.type, di.source, di.title, di.description, di.question, "
            "di.suggested_resolution, di.example_type, di.fingerprint, di.status, "
            "di.accepted_revision_number, di.incorporated_in_revision_id, di.created_at, "
            "sr.revision_number AS incorporated_revision_number "
            "FROM definition_items di "
            "LEFT JOIN spec_revisions sr ON sr.id = di.incorporated_in_revision_id "
            "WHERE di.spec_id = ? "
            "ORDER BY "
            "CASE di.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 "
            "WHEN 'rejected' THEN 2 ELSE 3 END, "
            "di.created_at, di.id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.7 — latest_revision_number

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

### L1.8 — definition_responses_for_item

```python
def definition_responses_for_item(definition_item_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT id, response_type, content, created_at "
            "FROM definition_responses "
            "WHERE definition_item_id = ? "
            "ORDER BY created_at, id",
            (definition_item_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.9 — is_defined_query

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

### L1.10 — create_spec

```python
def create_spec(slug: str, title: str, description: str, initial_content: str) -> int:
    """Create a new spec with an initial revision. Returns the new spec_id."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        cursor = conn.execute(
            "INSERT INTO specs (title, slug, description) VALUES (?, ?, ?)",
            (title, slug, description),
        )
        spec_id = cursor.lastrowid
        conn.execute(
            "INSERT INTO spec_revisions (spec_id, revision_number, content) VALUES (?, 1, ?)",
            (spec_id, initial_content),
        )
        conn.commit()
        return int(spec_id)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.11 — create_revision

```python
def create_revision(spec_id: int, content: str) -> int:
    """Create a new spec revision. Returns the new revision_id."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        next_num = (latest_revision_number(spec_id) or 0) + 1
        cursor = conn.execute(
            "INSERT INTO spec_revisions (spec_id, revision_number, content) VALUES (?, ?, ?)",
            (spec_id, next_num, content),
        )
        conn.commit()
        return int(cursor.lastrowid)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.12 — insert_definition_item

```python
def insert_definition_item(
    spec_id: int,
    item_type: str,         # 'clarification', 'tension', 'impact', 'example'
    source: str,            # 'description', 'spec', 'base_branch'
    title: str,
    description: str,
    fingerprint: str,
    question: str | None = None,
    suggested_resolution: str | None = None,
    example_type: str | None = None,  # 'happy-path' or 'edge-case' (required for 'example')
) -> int:
    """Insert a definition item. Returns the new item id."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        cursor = conn.execute(
            "INSERT INTO definition_items "
            "(spec_id, type, source, title, description, question, "
            "suggested_resolution, example_type, fingerprint) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (spec_id, item_type, source, title, description,
             question, suggested_resolution, example_type, fingerprint),
        )
        conn.commit()
        return int(cursor.lastrowid)
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.13 — incorporate_item

```python
def incorporate_item(item_id: int, revision_id: int) -> None:
    """Mark a definition item as incorporated into the given revision."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute(
            "UPDATE definition_items "
            "SET status = 'incorporated', incorporated_in_revision_id = ? "
            "WHERE id = ? AND status = 'accepted'",
            (revision_id, item_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### L1.14 — update_spec_description

```python
def update_spec_description(spec_id: int, description: str) -> None:
    """Update a spec's description field."""
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        conn.execute(
            "UPDATE specs SET description = ? WHERE id = ?",
            (description, spec_id),
        )
        conn.commit()
    except Exception:
        conn.rollback()
        raise
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

### L2.2 — has_pending

```python
def has_pending(spec_id: int) -> bool:
    return len(pending_definitions(spec_id)) > 0
```

### L2.3 — has_unincorporated

```python
def has_unincorporated(spec_id: int) -> bool:
    return len(accepted_unincorporated(spec_id)) > 0
```

### L2.4 — has_revisions

```python
def has_revisions(spec_id: int) -> bool:
    return latest_revision_number(spec_id) is not None
```

### L2.5 — fingerprint_collides

```python
def fingerprint_collides(spec_id: int, fingerprint: str) -> bool:
    return fingerprint in active_fingerprints(spec_id)
```

### L2.6 — is_blocked_by_pending

```python
def is_blocked_by_pending(spec_id: int) -> bool:
    """True if the spec has open definition items that must be resolved first."""
    pending = pending_definitions(spec_id)
    return len(pending) > 0
```

### L2.7 — needs_incorporation

```python
def needs_incorporation(spec_id: int) -> bool:
    """True if there are accepted items ready to be incorporated into a new revision."""
    return len(accepted_unincorporated(spec_id)) > 0
```

---

## Workflow

The agent must execute these steps in strict order. At each decision point, respond to the user with the required action or question before proceeding.

---

### Step 1 — Verify spec existence

```
spec = spec_by_slug(slug=spec_alias)
```

**Branch A — spec does NOT exist (`spec is None`):**

1. Derive a title from `description` (use the first sentence or a short summary).
2. Build the initial revision content following the [spec content template](./docs/spec-content-template.md). Start with the sections that can be filled from `description`. Mark unresolved sections with a placeholder like `<!-- PENDING: needs human input -->`.
3. Call `create_spec(slug, title, description, initial_content)`.
4. Inform the user: `"Spec '{slug}' created with revision 1. Now analyzing for definition items…"`
5. Proceed to **Step 4**.

**Branch B — spec EXISTS (`spec is not None`):**

1. Store `spec_id = spec["id"]`.
2. If the spec has **not been mentioned in the current session**, ask the user:

   > The spec `{slug}` already exists (title: "{title}"). Do you want to:
   > 1. Continue working on the existing spec
   > 2. Use a different slug

   If the user chooses option 2, ask for the new slug and restart from Step 1. Otherwise, continue.

3. Proceed to **Step 2**.

---

### Step 2 — Validate no open definitions exist

```
if has_pending(spec_id):
```

**Branch A — pending items found:**

1. List the pending items to the user:

   > The spec `{slug}` has {count} open definition items that must be resolved before adding more content:
   > - `#{id}` [{type}] {title}

2. **Halt.** Tell the user:

   > Please resolve these items via the dashboard (`task-repository dashboard`) before continuing. Once all items are resolved, re-run this command.

3. Do not proceed further.

**Branch B — no pending items:**

Proceed to **Step 3**.

---

### Step 3 — Incorporate accepted decisions (if any)

```
if has_unincorporated(spec_id):
```

**Branch A — accepted items ready for incorporation:**

1. Retrieve the current revision content:
   ```
   current_content = current_revision_content(spec_id)
   accepted = accepted_unincorporated(spec_id)
   ```

2. For each accepted item, retrieve its responses to understand the human's decision:
   ```
   for item in accepted:
       responses = definition_responses_for_item(item["id"])
   ```

3. Build a new revision content by merging the accepted decisions into `current_content`, following the [spec content template](./docs/spec-content-template.md). Update the relevant sections based on each accepted item's type:
   - `clarification` → update the section the question pertains to with the answer
   - `impact` → update the `# Impact` section
   - `example` → update the `# Acceptance` section with the new case
   - `tension` → resolve the tension in the relevant section

4. Create the new revision:
   ```
   revision_id = create_revision(spec_id, new_content)
   ```

5. Mark all accepted items as incorporated:
   ```
   for item in accepted:
       incorporate_item(item["id"], revision_id)
   ```

6. Inform the user:
   > Incorporated {count} accepted decisions into revision {revision_number}.

**Branch B — no accepted items:**

Proceed to **Step 4**.

---

### Step 4 — Analyze discrepancies and generate definition items

This is the core analysis step. The agent must compare the incoming `description` against:

1. **The current spec content** (from `current_revision_content(spec_id)`)
2. **The codebase** at `base_branch` (read files listed in `# Relevant Files` of the spec and any files mentioned in `description`)
3. **Previously resolved definition items** (from `all_definition_items(spec_id)`)

#### 4.1 — Load context

```
current_content = current_revision_content(spec_id) or ""
existing_items = all_definition_items(spec_id)
active_fps = active_fingerprints(spec_id)
```

#### 4.2 — Detect discrepancies

The agent must examine the `description` and the current spec content against the [spec content template](./docs/spec-content-template.md). For each section of the template, evaluate:

| Section | Check |
|---------|-------|
| **Goal** | Does the description introduce a goal that contradicts or significantly expands the current goal? |
| **Impact** | Are there new side effects mentioned in the description not captured in the spec? Are there impacts in the spec contradicted by the new description? |
| **Scope / Included** | Does the description add scope items not listed? Are existing scope items incompatible with the description? |
| **Scope / Excluded** | Should anything in the description be explicitly excluded instead? |
| **Acceptance** | Does the description suggest new acceptance criteria? Are existing criteria invalidated? |
| **RBAC / Authorized** | Are new actors mentioned? Do existing actor definitions conflict? |
| **RBAC / Unauthorized** | Should any actors be explicitly excluded based on the description? |
| **ADR** | Does the description prescribe or imply technical decisions not yet captured? |
| **Relevant Files** | Are new files mentioned? Should existing file references be updated? |

Additionally, examine the **codebase** at `base_branch` for:
- Files mentioned in the spec's `# Relevant Files` section
- Files mentioned in `description`
- Any observable behavior, API signatures, or data models relevant to the spec

For any **gap, contradiction, or ambiguity** between description ↔ spec, description ↔ codebase, or spec ↔ codebase, generate a `definition_item`.

#### 4.3 — Generate definition items

For each discrepancy found, call:

```
insert_definition_item(
    spec_id=spec_id,
    item_type=...,        # 'clarification', 'tension', 'impact', or 'example'
    source=...,           # 'description', 'spec', or 'base_branch'
    title=...,
    description=...,
    fingerprint=...,
    question=...,         # required for 'clarification'
    suggested_resolution=...,  # optional
    example_type=...,     # required for 'example': 'happy-path' or 'edge-case'
)
```

**Item type guidelines:**

| Type | Use when… |
|------|-----------|
| `clarification` | The description or spec is ambiguous and a concrete answer is needed. Always include a `question`. |
| `tension` | The new description contradicts the current spec or the codebase. Explain the contradiction in `description` and propose a resolution in `suggested_resolution`. |
| `impact` | The change affects the project beyond the spec's current scope (e.g., other modules, performance, dependencies). |
| `example` | A concrete scenario (happy-path or edge-case) needs confirmation. Include `example_type`. |

**Fingerprint generation:**

The fingerprint must be a stable, deterministic string derived from the item's essence. Use a format like:

```
{section}:{type}:{short-hash-of-title}
```

Check for collisions before inserting:

```
if not fingerprint_collides(spec_id, fingerprint):
    insert_definition_item(...)
```

#### 4.4 — Report generated items

After analysis, report to the user:

> Analysis complete. Generated {count} new definition items:
> - `#{id}` [{type}] {title} — {source}
>
> Review them at the dashboard (`task-repository dashboard`) and resolve them before re-running this command.

---

### Step 5 — Update spec with new description

1. Update the spec's description field:
   ```
   update_spec_description(spec_id, description)
   ```

2. Build a new revision content by merging the `description` into the current spec, following the [spec content template](./docs/spec-content-template.md). Sections that could not be resolved (because they depend on pending definition items) should be marked:
   ```markdown
   <!-- PENDING: Awaiting resolution of definition item #N -->
   ```

3. Create the new revision:
   ```
   revision_id = create_revision(spec_id, new_content)
   ```

4. Inform the user:
   > Spec `{slug}` updated to revision {revision_number}. {pending_count} definition items pending review.

---

### Step 6 — Final status report

Print a summary:

```
Spec: {slug} (id={spec_id})
Revision: {revision_number}
Definition status: {draft or defined}
Pending items: {count}
Accepted items pending incorporation: {count}
```

If there are pending items, remind:

> Run `task-repository dashboard` to review and resolve the pending definition items. Then re-run `/sc-add-to-spec` to continue refining the spec.

---

## Session Awareness

If the agent has a session context, it must track which specs have been mentioned. A spec is "mentioned" if:
- The user invoked this command with its slug in the current session, or
- The agent has previously referred to it in the same session

If the spec was already mentioned in the current session, **skip the existence confirmation prompt** in Step 1 Branch B.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Database file not found | Inform the user: `"No feature_workflow.sqlite3 found in the current directory. Create one with: python3 scripts/scaffold_db.py ."` |
| `--spec_alias` invalid (contains characters outside `[a-z0-9-]`, leading/trailing hyphens, consecutive hyphens) | Reject and ask for a valid slug. |
| `--spec_alias` missing | Ask the user to provide it. |
| `--description` missing | Ask the user to provide it. |
| `spec_id` not found after creation | Unexpected error — report and halt. |
| SQLite integrity error on insert | Report the specific constraint violation and halt. |