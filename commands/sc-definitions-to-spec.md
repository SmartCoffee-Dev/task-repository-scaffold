# /sc-definitions-to-spec

## Purpose

Evaluate closed definitions (items with status `accepted` or `rejected` that have complementary human responses) to determine whether the human's answers correctly resolve the original discrepancies or ambiguities. Resolved items are incorporated into a new spec revision, while unresolved items — or those whose answers generate new discrepancies — are incorporated but spawn new `pending` definition items for the next round of review. Rejected items with complementary observations or answers are reevaluated and may generate new `pending` items. States of all attended definitions are updated.

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `--spec_alias` | Yes | — | Slug of the spec to process (lowercase letters, digits, hyphens only). |
| `--base_branch` | No | `main` (or session-reused value) | Branch for codebase analysis when evaluating coherence of human responses against actual implementation. |

### Parameter Extraction

The agent must parse the user's invocation string. Parameters are identified by their `--` prefix, followed by a space-separated value.

```
/sc-definitions-to-spec --spec_alias user-export --base_branch develop
```

If `--spec_alias` is missing, halt and ask the user to provide it. If `--base_branch` was specified earlier in the same session (e.g., via `/sc-add-to-spec`), reuse that value unless the user overrides it.

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

### L1.6 — definition_responses_for_item

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

### L1.8 — rejected_with_responses

Returns rejected definition items that have at least one complementary human response — an `answer` or `observation` — that provides substantive input beyond the rejection itself. Items with only an empty `reject` response are excluded.

```python
def rejected_with_responses(spec_id: int) -> list[dict]:
    import sqlite3
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        rows = conn.execute(
            "SELECT di.id, di.type, di.source, di.title, di.description, di.question, "
            "di.suggested_resolution, di.example_type, di.fingerprint, di.status, "
            "di.accepted_revision_number, di.incorporated_in_revision_id, di.created_at "
            "FROM definition_items di "
            "WHERE di.spec_id = ? "
            "AND di.status = 'rejected' "
            "AND EXISTS ("
            "  SELECT 1 FROM definition_responses dr "
            "  WHERE dr.definition_item_id = di.id "
            "  AND dr.response_type IN ('answer', 'observation') "
            "  AND dr.content IS NOT NULL AND TRIM(dr.content) != ''"
            ") "
            "ORDER BY di.created_at, di.id",
            (spec_id,),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
```

### L1.9 — create_revision

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

### L1.10 — incorporate_item

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

### L1.11 — insert_definition_item

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

### L1.12 — update_spec_description

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

### L2.6 — has_rejected_with_responses

```python
def has_rejected_with_responses(spec_id: int) -> bool:
    """True if there are rejected items with complementary human responses."""
    return len(rejected_with_responses(spec_id)) > 0
```

### L2.7 — has_closed_definitions

```python
def has_closed_definitions(spec_id: int) -> bool:
    """True if there are any closed definitions to evaluate (accepted or rejected-with-responses)."""
    return has_unincorporated(spec_id) or has_rejected_with_responses(spec_id)
```

---

## Workflow

The agent must execute these steps in strict order. At each decision point, respond to the user with the required action or question before proceeding.

### Constraint: No revision while pending items exist

A new spec revision must **never** be created if there are `pending` definition items from a prior round. The command must first ensure the spec is in a clean state where all prior ambiguities have been addressed by the human. This enforces the rule: *do not generate new spec revisions if there are still pending definitions to attend to*.

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

### Step 2 — Block if pending items exist

```
if has_pending(spec_id):
```

**Branch A — pending items found:**

1. List the pending items to the user:

   > The spec `{slug}` has {count} open definition items that must be resolved before evaluating closed definitions:
   > - `#{id}` [{type}] {title}

2. **Halt.** Tell the user:

   > Please resolve these items via the dashboard (`task-repository dashboard`) before continuing. Once all items are resolved, re-run this command.

3. Do not proceed further.

**Branch B — no pending items:**

Proceed to Step 3.

---

### Step 3 — Load closed definitions

A definition is "closed" if its status is `accepted` (unincorporated) or `rejected` with complementary human responses (answers or observations with non-empty content beyond the rejection itself). These are the items the command must evaluate.

```
accepted_items = accepted_unincorporated(spec_id)
rejected_items = rejected_with_responses(spec_id)
```

If both lists are empty:

> No closed definitions to evaluate for spec `{slug}`. The spec has no accepted items pending incorporation and no rejected items with complementary responses.

Halt — nothing to do.

Otherwise, for each item in both lists, load its full response history:

```
for item in accepted_items + rejected_items:
    item["_responses"] = definition_responses_for_item(item["id"])
```

Additionally, load the current revision content and the active fingerprints for collision checking during Step 5:

```
current_content = current_revision_content(spec_id) or ""
active_fps = active_fingerprints(spec_id)
```

Report what was found:

> Evaluating closed definitions for spec `{slug}`:
> - {len(accepted_items)} accepted items pending incorporation
> - {len(rejected_items)} rejected items with complementary responses
>
> Analyzing responses…

Proceed to Step 4.

---

### Step 4 — Evaluate each definition

This is the core evaluation step. For each closed definition, the agent must analyze the human's responses (answers, accepts, observations) and determine whether they **correctly resolve** the original discrepancy or ambiguity. Observations provided by the human carry special weight: they refine understanding and should shape both how resolved content is incorporated and how new pending items are articulated.

---

#### 4.1 — Evaluate accepted items

For each item in `accepted_items`:

1. **Understand the original issue.** Read the item's `description`, `question` (if present), `suggested_resolution`, and `type`. What was the ambiguity, tension, impact, or example that needed resolution?

2. **Read the human's responses.** Examine `item["_responses"]`, paying attention to:
   - `answer` responses — the human's direct resolution to the question
   - `accept` responses — confirmation without additional text (the human agreed with `suggested_resolution`)
   - `observation` responses — refinements, caveats, or additional context the human provided

3. **Evaluate resolution quality.** Determine if the human's input satisfactorily resolves the original issue. A resolution is considered **adequate** when:
   - For `clarification`: the answer directly addresses the question with a concrete, unambiguous decision. There are no gaps, contradictions, or "we'll figure it out later" statements.
   - For `tension`: the resolution declares a clear preference between the conflicting options and justifies why. Both sides of the tension are acknowledged.
   - For `impact`: the impact description is specific about what changes, who is affected, and whether the change is breaking or additive. Vague impacts are not resolved.
   - For `example`: the acceptance criteria is concrete, testable, and covers the scenario type (`happy-path` or `edge-case`) with expected behavior.

   A resolution is **inadequate** when:
   - The answer is vague, defers the decision, or introduces new unstated assumptions
   - The answer contradicts the spec's current content or the codebase (at `base_branch`) without acknowledging the contradiction
   - The answer introduces new ambiguities, tensions, or impacts that are not captured anywhere
   - Observations reveal concerns that were not addressed in the answer

4. **Categorize and act:**

   **Resolved (adequate):**
   - Record the item for incorporation along with the resolved content derived from the human's answers + observations.
   - The resolved content will be merged into the new spec revision in Step 5.

   **Not resolved (inadequate):**
   - Record the item for incorporation anyway (the human accepted it, so it must enter the spec history).
   - **Additionally**, generate one or more new `pending` definition items capturing the gaps. For each gap:
     - `type`: same as the original, or `clarification` if the gap is an unanswered question
     - `source`: `'spec'`
     - `title`: a short description of the remaining gap
     - `description`: explain what was not resolved in the human's answer, referencing the original item for context
     - `question` (for `clarification`): a concrete question addressing the gap
     - `suggested_resolution`: a proposed path forward, using observations as guidance
     - `fingerprint`: use the format `{section}:{type}:{short-hash-of-title}`; check against `active_fps` before inserting

   In both cases, the resolved content that enters the spec should be refined using any observations the human provided. Observations may add nuance, caveats, or implementation notes that improve the articulation.

---

#### 4.2 — Evaluate rejected items with complementary responses

For each item in `rejected_items`:

1. **Understand the original issue and why it was rejected.** Read the item's description, the reject response, and any complementary responses (answers, observations).

2. **Extract insights from complementary responses.** The human rejected the item but provided additional input. Analyze:
   - Did the observation explain *why* the item was rejected and what should happen instead?
   - Did an answer provide alternative direction that wasn't captured in a new accepted item?
   - Does the complementary input reveal new ambiguities, impacts, or tensions?

3. **Generate new pending items.** For each substantive insight found in the complementary responses:
   - `type`: `clarification`, `tension`, `impact`, or `example` as appropriate
   - `source`: `'spec'`
   - `title`: a short description of the new issue
   - `description`: explain the gap, referencing the original rejected item and the complementary responses
   - `question` (for `clarification`): a concrete question
   - `suggested_resolution`: a proposed path forward
   - `fingerprint`: `{section}:{type}:{short-hash-of-title}`; check against `active_fps`

4. **Do not change the rejected item's status.** Rejected items remain `rejected` — they are part of the spec's decision history. Only new pending items are created.

---

#### 4.3 — Report evaluation results

After evaluating all items, report to the user:

> Evaluation complete for spec `{slug}`:
> - {resolved_count} items resolved — will be incorporated into the new revision
> - {unresolved_count} accepted items with gaps — will be incorporated, {new_pending_from_gaps} new pending items generated
> - {new_pending_from_rejected} new pending items from rejected items with complementary responses
>
> Proceeding to build revision…

Proceed to Step 5.

---

### Step 5 — Build the new spec revision

Take the current revision content and merge the resolved decisions into it. Use the [spec content template](./docs/spec-content-template.md) as the structure guide.

#### 5.1 — Merge resolved items by type

For each **resolved** item (those categorized as adequate in Step 4.1):

| Item type | Merge action |
|-----------|-------------|
| `impact` | Add a new entry to the `# Impact` section. Format: `- {description}` followed by sub-bullets for what changes, who is affected, and whether breaking/additive. This is the **only** way `# Impact` receives new entries. |
| `example` | Add a new entry to the `# Acceptance` section. Format: `- {description}` with expected behavior. Include sub-bullets for the specific testable scenario. This is the **only** way `# Acceptance` receives new entries. |
| `clarification` | Update the section the question pertains to (Goal, Scope, RBAC, ADR, etc.) with the resolved answer. If the clarification spans multiple sections, update all affected sections. |
| `tension` | Resolve the tension in the relevant section. Remove contradictory or outdated statements. Add the chosen path with the justification from the human's answer. |

**Refinement via observations:** Human observations attached to each item should be used to refine how the resolved content is articulated. Observations may:
- Add implementation notes or caveats
- Clarify scope boundaries
- Suggest more precise language
- Indicate dependencies on other decisions

Incorporate these refinements into the section content, not as separate observation entries.

For items categorized as **not resolved** (inadequate): their accepted content should still be reflected in the revision, but marked conservatively. Prefer language that acknowledges uncertainty (e.g., "Tentative: …", "Subject to further clarification: …") rather than presenting incomplete answers as settled decisions.

#### 5.2 — Build the revision content

Starting from `current_content`, apply all merges from Step 5.1 to produce `new_content`. The result must be a complete, self-contained Markdown document following the spec content template. Every section from the template must be present:

- `# Goal`
- `# Impact`
- `# Scope` (## Included, ## Excluded)
- `# Acceptance`
- `# RBAC` (## Authorized, ## Unauthorized)
- `# ADR`
- `# Relevant Files`

If a section has no content after merging (neither from the previous revision nor from newly incorporated items), mark it explicitly:

```markdown
<!-- PENDING: awaiting resolution of definition items -->
```

Sections that have partial content from incorporated items but still have unresolved aspects should carry a note:

```markdown
<!-- PENDING: some aspects remain unresolved — see definition items #N, #M -->
```

#### 5.3 — Persist the new revision

```
revision_id = create_revision(spec_id, new_content)
```

Proceed to Step 6.

---

### Step 6 — Update states and create new pending items

#### 6.1 — Mark accepted items as incorporated

For every item in `accepted_items` (whether resolved or not resolved), mark it as incorporated into the new revision:

```
for item in accepted_items:
    incorporate_item(item["id"], revision_id)
```

This updates each item's status to `incorporated` and sets `incorporated_in_revision_id` to the new revision. Once incorporated, items cannot receive further responses — their interaction is closed as part of the spec's history.

#### 6.2 — Insert new pending definition items

For each new pending item generated in Step 4 (from unresolved accepted items and from rejected items with complementary responses), call:

```
insert_definition_item(
    spec_id=spec_id,
    item_type=item_type,
    source='spec',
    title=title,
    description=description,
    fingerprint=fingerprint,
    question=question,             # required for 'clarification'
    suggested_resolution=suggested_resolution,
    example_type=example_type,     # required for 'example'
)
```

**Fingerprint collision check:** Before inserting, verify `not fingerprint_collides(spec_id, fingerprint)`. If a collision is detected, append a counter suffix to the fingerprint to make it unique (e.g., `scope:clarification:a1b2c3-2`).

After each successful insert, add the fingerprint to `active_fps` to prevent further collisions within the same batch.

#### 6.3 — Update spec description

If the evaluation produced new insights that refine the spec's overall direction, update the description:

```
update_spec_description(spec_id, refined_description)
```

The refined description should summarize the current state of the spec after this round of incorporation, including any new pending items that remain.

#### 6.4 — Report final status

Print a comprehensive summary:

```
Spec: {slug} (id={spec_id})
Revision: {revision_number}
Incorporated items: {incorporated_count}
  - Resolved: {resolved_count}
  - Incorporated with gaps: {unresolved_count}
New pending items: {new_pending_count}
  - From unresolved accepted items: {pending_from_gaps}
  - From rejected items with complementary responses: {pending_from_rejected}
Definition status: {draft or defined}
```

If there are new pending items:

> New pending items have been created. Run `task-repository dashboard` to review and resolve them, then re-run `/sc-definitions-to-spec` to incorporate the next round.

If the spec is now `defined` (no pending items):

> All definitions resolved and incorporated. The spec `{slug}` is now **defined** at revision {revision_number}. Ready for implementation tasks.

---

## Session Awareness

If the agent has a session context, it must track:

- **`--base_branch` reuse:** If `--base_branch` was specified in a previous invocation of `/sc-add-to-spec` or this command within the same session, reuse that value unless the user provides a different one.
- **Spec context:** The spec being worked on should be remembered for the session duration, so subsequent mentions do not require re-validation of existence.

---

## Error Handling

| Condition | Action |
|-----------|--------|
| Database file not found | Inform the user: `"No feature_workflow.sqlite3 found in the current directory. Create one with: python3 scripts/scaffold_db.py ."` |
| `--spec_alias` missing | Ask the user to provide it. |
| `--spec_alias` invalid (characters outside `[a-z0-9-]`, leading/trailing hyphens, consecutive hyphens) | Reject and ask for a valid slug. |
| Spec not found | Inform: `"Spec '{spec_alias}' not found. Create it first with /sc-add-to-spec."` |
| Pending items exist | List them and halt. Tell user to resolve via dashboard first. |
| No closed definitions to evaluate | Inform the user and halt. Nothing to do. |
| SQLite integrity error on insert | Report the specific constraint violation and halt. |
| `create_revision` fails | Roll back any state changes and report the error. Do not leave items in an inconsistent state. |
| `incorporate_item` fails for a specific item | Report which item failed and why. Continue with remaining items. |
| Fingerprint collision during batch insert | Append a counter suffix and retry. If all suffixes collide (max 5 attempts), report and skip that item. |