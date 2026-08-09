# Spec Content Template

Each `spec_revision.content` must be a self-contained Markdown document following the structure below. Every section is mandatory — if information is not yet available for a section, mark it explicitly as pending resolution.

## Sections

### Goal

A concise summary of the objective, taking into account everything described within the spec. This is the north star of the implementation: what problem is being solved and why.

### Impact

A list of collateral effects the implementation will have on the current state of the project. Each item should describe:
- What changes (behavior, API, data model, performance, dependencies)
- Who or what is affected (users, other systems, downstream consumers)
- Whether the change is breaking or additive

### Scope

#### Included

An explicit list of what is in scope for this implementation. Use concrete, verifiable items — avoid vague language. Each item should be falsifiable: it must be possible to determine whether it was delivered or not.

#### Excluded

An explicit list of what is **not** in scope. The purpose is to bound potential scope creep. Items here should be natural extensions or adjacent concerns that a reader might reasonably assume are included.

### Acceptance

A list of foreseeable cases that must be satisfied for the implementation to be considered accepted. Each case should be testable and phrased as a concrete scenario with expected behavior. Include:
- Happy-path scenarios
- Edge cases and error conditions
- Non-functional requirements (performance, security, accessibility) where applicable

### RBAC

#### Authorized

Actors (roles, personas, system components) that are entitled to benefit from or interact with the implementation. Describe what each actor can do.

#### Unauthorized

Actors that are explicitly **not** entitled to benefit from or interact with the implementation, even if they might appear to have a legitimate claim. This prevents ambiguity in multi-tenant or multi-role systems.

### ADR

A list of technical design decisions the implementation must follow. Unlike the Goal or Scope, ADRs describe **how** to build, not **what** to build. Each entry should include:
- The decision
- The rationale (why this approach over alternatives)
- Any constraints or tradeoffs acknowledged

### Relevant Files

A list of files important to consider during implementation — either because they are directly involved in the changes or because they may be indirectly affected. For each file, indicate:
- Whether it will be created, modified, or is included for awareness
- Why it matters to the implementation

---

## Example (abbreviated)

```markdown
# Goal
Allow users to export their dashboard data as CSV from the reports page.

# Impact
- New endpoint `GET /api/reports/export` — additive, no breaking changes
- CSV generation may increase memory usage for large datasets; paginated export is out of scope
- No changes to the database schema

# Scope
## Included
- CSV export button on the reports page
- Backend endpoint returning CSV with proper Content-Type headers
- Column selection dialog before export

## Excluded
- PDF or Excel export formats
- Scheduled/automated exports
- Export of data not visible to the current user

# Acceptance
- Clicking "Export CSV" downloads a valid CSV file
- CSV contains only columns the user selected
- Export respects the current report filters (date range, category)
- Empty report produces a CSV with headers only (no crash or 500)
- Export completes within 5 seconds for up to 10,000 rows

# RBAC
## Authorized
- Admin: can export all reports
- Standard user: can export only their own data

## Unauthorized
- Anonymous/unauthenticated users
- Users with suspended accounts

# ADR
- Use Python's built-in `csv` module — no external CSV libraries
- Stream the response with `StreamingHttpResponse` to avoid loading all rows into memory
- Column selection stored in `localStorage`, not on the server

# Relevant Files
- `src/views/reports.py` (modify — add export button and column dialog)
- `src/api/reports.py` (create — new export endpoint)
- `src/services/report_service.py` (modify — add CSV serialization method)
- `tests/api/test_reports.py` (create — export endpoint tests)
```