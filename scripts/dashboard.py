#!/usr/bin/env python3
"""A dependency-free local web dashboard for feature definition workflow."""

from __future__ import annotations

import argparse
from contextlib import closing
from dataclasses import dataclass
from html import escape
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, urlencode, urlparse
import sqlite3
import sys

from scaffold_db import DATABASE_FILENAME, is_spec_defined


VALID_ITEM_TYPES = ("clarification", "tension", "impact", "example")
VALID_SOURCES = ("description", "spec", "base_branch")


class DashboardError(Exception):
    """An error that can be shown to dashboard users."""


def resolve_database_path(value: str | None, working_directory: Path | None = None) -> Path:
    """Resolve a dashboard database path without guessing between locations.

    An explicit ``--db`` always wins.  Otherwise the dashboard reads exactly
    ``feature_workflow.sqlite3`` in the current working directory.  The
    one-location default is intentionally deterministic and makes it clear
    which database a local server will mutate.
    """
    if value:
        return Path(value).expanduser().resolve()
    directory = (working_directory or Path.cwd()).resolve()
    return directory / DATABASE_FILENAME


def open_database(path: Path) -> sqlite3.Connection:
    if not path.is_file():
        raise DashboardError(
            f"Database not found: {path}. Create one with scripts/scaffold_db.py or pass --db."
        )
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def markdown_to_html(markdown: str) -> str:
    """Render a small, safe Markdown subset without an external dependency."""
    lines = markdown.splitlines()
    output: list[str] = []
    paragraph: list[str] = []
    in_code = False
    code: list[str] = []
    in_list = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            output.append(f"<p>{escape(' '.join(part.strip() for part in paragraph))}</p>")
            paragraph = []

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            output.append("</ul>")
            in_list = False

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("```"):
            flush_paragraph()
            close_list()
            if in_code:
                code_lines = "\n".join(code)
                output.append(f"<pre><code>{escape(code_lines)}</code></pre>")
                code = []
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        if not stripped:
            flush_paragraph()
            close_list()
        elif stripped.startswith("### "):
            flush_paragraph()
            close_list()
            output.append(f"<h3>{escape(stripped[4:])}</h3>")
        elif stripped.startswith("## "):
            flush_paragraph()
            close_list()
            output.append(f"<h2>{escape(stripped[3:])}</h2>")
        elif stripped.startswith("# "):
            flush_paragraph()
            close_list()
            output.append(f"<h1>{escape(stripped[2:])}</h1>")
        elif stripped.startswith("- ") or stripped.startswith("* "):
            flush_paragraph()
            if not in_list:
                output.append("<ul>")
                in_list = True
            output.append(f"<li>{escape(stripped[2:])}</li>")
        else:
            close_list()
            paragraph.append(line)
    if in_code:
        code_lines = "\n".join(code)
        output.append(f"<pre><code>{escape(code_lines)}</code></pre>")
    flush_paragraph()
    close_list()
    return "\n".join(output) or "<p><em>Sin contenido.</em></p>"


def page(title: str, body: str, notice: str = "", error: str = "") -> str:
    messages = ""
    if notice:
        messages += f'<p class="notice">{escape(notice)}</p>'
    if error:
        messages += f'<p class="error">{escape(error)}</p>'
    return f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)} · Task Repository</title>
<style>
body {{ font: 16px/1.45 system-ui, sans-serif; max-width: 1100px; margin: 2rem auto; padding: 0 1rem; color: #202124; }}
a {{ color: #1259c3; }} table {{ border-collapse: collapse; width: 100%; margin: 1rem 0; }} th,td {{ border-bottom: 1px solid #ddd; text-align: left; padding: .55rem; vertical-align: top; }}
fieldset {{ border: 1px solid #ccd; margin: 1rem 0; padding: 1rem; }} textarea {{ width: 100%; min-height: 5rem; box-sizing: border-box; }} button {{ margin: .25rem .25rem .25rem 0; padding: .45rem .75rem; }}
.notice {{ background: #e4f5e6; padding: .7rem; }} .error {{ background: #fde8e6; padding: .7rem; }} .muted {{ color: #666; }} .badge {{ background: #e8edf5; border-radius: .35rem; padding: .1rem .4rem; white-space: nowrap; }}
pre {{ overflow-x: auto; background: #f4f4f4; padding: .75rem; }} .item {{ border-left: 4px solid #7b93b8; padding-left: 1rem; }}
</style></head><body><header><a href="/">← Specs</a></header>{messages}{body}</body></html>"""


def form_value(values: dict[str, list[str]], name: str) -> str:
    return values.get(name, [""])[0].strip()


@dataclass(frozen=True)
class DatabaseInfo:
    path: Path


class DashboardApplication:
    def __init__(self, database: Path):
        self.database = DatabaseInfo(database)

    def _connection(self) -> sqlite3.Connection:
        return open_database(self.database.path)

    def list_specs(self, item_type: str | None, source: str | None) -> list[sqlite3.Row]:
        filters: list[str] = []
        parameters: list[str] = []
        if item_type:
            filters.append("definition_items.type = ?")
            parameters.append(item_type)
        if source:
            filters.append("definition_items.source = ?")
            parameters.append(source)
        item_filter = ""
        if filters:
            item_filter = "AND EXISTS (SELECT 1 FROM definition_items WHERE definition_items.spec_id = specs.id AND " + " AND ".join(filters) + ")"
        query = f"""
            SELECT specs.*, states.definition_status,
                   (SELECT count(*) FROM definition_items WHERE spec_id = specs.id AND status = 'pending') AS pending_items,
                   (SELECT count(*) FROM definition_items WHERE spec_id = specs.id) AS item_count,
                   (SELECT count(*) FROM tasks WHERE spec_id = specs.id) AS task_count,
                   (SELECT count(*) FROM tasks WHERE spec_id = specs.id AND status = 'done') AS done_tasks
            FROM specs JOIN spec_definition_states AS states ON states.spec_id = specs.id
            WHERE 1 = 1 {item_filter}
            ORDER BY specs.updated_at DESC, specs.id DESC
        """
        with closing(self._connection()) as connection:
            return list(connection.execute(query, parameters))

    def spec_detail(self, spec_id: int) -> tuple[sqlite3.Row, list[sqlite3.Row], list[sqlite3.Row]]:
        with closing(self._connection()) as connection:
            spec = connection.execute(
                """SELECT specs.*, spec_revisions.content AS revision_content,
                          spec_revisions.revision_number, spec_revisions.created_at AS revision_created_at
                   FROM specs LEFT JOIN spec_revisions ON spec_revisions.id = specs.current_revision_id
                   WHERE specs.id = ?""",
                (spec_id,),
            ).fetchone()
            if spec is None:
                raise DashboardError(f"Unknown spec id: {spec_id}")
            # Deliberately use the schema-owned domain predicate rather than
            # reimplementing the pending-item condition in the dashboard.
            defined = is_spec_defined(connection, spec_id)
            spec = dict(spec)
            spec["definition_status"] = "defined" if defined else "draft"
            item_columns = {
                column["name"] for column in connection.execute("PRAGMA table_info(definition_items)")
            }
            if "incorporated_in_revision_id" in item_columns:
                items_query = """SELECT definition_items.*, spec_revisions.revision_number AS incorporated_revision_number
                    FROM definition_items LEFT JOIN spec_revisions
                      ON spec_revisions.id = definition_items.incorporated_in_revision_id
                    WHERE definition_items.spec_id = ?"""
            else:
                # The dashboard also supports databases created by the first
                # version of this schema, before incorporation provenance.
                items_query = """SELECT definition_items.*, NULL AS incorporated_revision_number
                    FROM definition_items WHERE definition_items.spec_id = ?"""
            items = list(connection.execute(
                items_query + """ ORDER BY CASE definition_items.status WHEN 'pending' THEN 0 WHEN 'accepted' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END,
                                          definition_items.created_at, definition_items.id""",
                (spec_id,),
            ))
            responses = list(connection.execute(
                """SELECT definition_responses.*, definition_items.spec_id
                   FROM definition_responses JOIN definition_items ON definition_items.id = definition_responses.definition_item_id
                   WHERE definition_items.spec_id = ? ORDER BY definition_responses.created_at, definition_responses.id""",
                (spec_id,),
            ))
        return spec, items, responses

    def record_answer(self, item_id: int, content: str) -> int:
        if not content:
            raise DashboardError("La respuesta no puede estar vacía.")
        with closing(self._connection()) as connection:
            try:
                item = connection.execute("SELECT * FROM definition_items WHERE id = ?", (item_id,)).fetchone()
                if item is None:
                    raise DashboardError(f"Unknown definition item id: {item_id}")
                if item["type"] != "clarification":
                    raise DashboardError("Solo una aclaración admite una respuesta textual.")
                if item["status"] == "incorporated":
                    raise DashboardError("Este asunto ya fue incorporado y está cerrado.")
                connection.execute("INSERT INTO definition_responses (definition_item_id, response_type, content) VALUES (?, 'answer', ?)", (item_id, content))
                connection.execute("UPDATE definition_items SET status = 'accepted' WHERE id = ?", (item_id,))
                connection.commit()
                return int(item["spec_id"])
            except sqlite3.Error as error:
                connection.rollback()
                raise DashboardError(str(error)) from error

    def record_decision(self, item_id: int, decision: str, observation: str) -> int:
        if decision not in ("accept", "reject"):
            raise DashboardError("La decisión debe ser aceptar o rechazar.")
        with closing(self._connection()) as connection:
            try:
                item = connection.execute("SELECT * FROM definition_items WHERE id = ?", (item_id,)).fetchone()
                if item is None:
                    raise DashboardError(f"Unknown definition item id: {item_id}")
                if item["type"] not in ("impact", "example"):
                    raise DashboardError("Solo impactos y ejemplos se resuelven con esta acción.")
                if item["status"] == "incorporated":
                    raise DashboardError("Este asunto ya fue incorporado y está cerrado.")
                connection.execute("INSERT INTO definition_responses (definition_item_id, response_type, content) VALUES (?, ?, '')", (item_id, decision))
                if observation:
                    connection.execute("INSERT INTO definition_responses (definition_item_id, response_type, content) VALUES (?, 'observation', ?)", (item_id, observation))
                target_status = "accepted" if decision == "accept" else "rejected"
                connection.execute("UPDATE definition_items SET status = ? WHERE id = ?", (target_status, item_id))
                connection.commit()
                return int(item["spec_id"])
            except sqlite3.Error as error:
                connection.rollback()
                raise DashboardError(str(error)) from error


def option_tags(values: tuple[str, ...], selected: str | None, labels: dict[str, str] | None = None) -> str:
    tags = ['<option value="">Todos</option>']
    for value in values:
        chosen = " selected" if value == selected else ""
        tags.append(f'<option value="{value}"{chosen}>{escape((labels or {}).get(value, value))}</option>')
    return "".join(tags)


def render_index(application: DashboardApplication, query: dict[str, list[str]]) -> str:
    item_type = form_value(query, "type") or None
    source = form_value(query, "source") or None
    if item_type and item_type not in VALID_ITEM_TYPES:
        raise DashboardError("Filtro de tipo no válido.")
    if source and source not in VALID_SOURCES:
        raise DashboardError("Filtro de origen no válido.")
    specs = application.list_specs(item_type, source)
    rows = "".join(
        f"<tr><td><a href=\"/specs/{spec['id']}\">{escape(spec['title'])}</a><br><span class=\"muted\">{escape(spec['slug'])}</span></td>"
        f"<td><span class=\"badge\">{escape(spec['definition_status'])}</span></td>"
        f"<td>{spec['pending_items']} pendientes / {spec['item_count']} asuntos</td><td>{spec['done_tasks']} / {spec['task_count']} tareas</td></tr>"
        for spec in specs
    ) or "<tr><td colspan=\"4\">No hay specs que coincidan.</td></tr>"
    filters = f"""<form method="get"><label>Tipo <select name="type">{option_tags(VALID_ITEM_TYPES, item_type, {'clarification': 'Aclaraciones', 'tension': 'Tensiones', 'impact': 'Impactos', 'example': 'Ejemplos'})}</select></label>
<label>Origen <select name="source">{option_tags(VALID_SOURCES, source, {'description': 'Descripción', 'spec': 'Spec', 'base_branch': 'Código'})}</select></label> <button>Filtrar</button></form>"""
    return page("Dashboard", f"<h1>Specs</h1><p class=\"muted\">Base: {escape(str(application.database.path))}</p>{filters}<table><thead><tr><th>Spec</th><th>Definición</th><th>Asuntos</th><th>Progreso</th></tr></thead><tbody>{rows}</tbody></table>")


def render_item(item: sqlite3.Row, responses: list[sqlite3.Row]) -> str:
    history = [response for response in responses if response["definition_item_id"] == item["id"]]
    historical = "".join(f"<li><strong>{escape(response['response_type'])}</strong> · {escape(response['created_at'])}{(': ' + escape(response['content'])) if response['content'] else ''}</li>" for response in history) or "<li>Sin interacciones.</li>"
    extra = ""
    if item["question"]:
        extra += f"<p><strong>Pregunta:</strong> {escape(item['question'])}</p>"
    if item["suggested_resolution"]:
        extra += f"<p><strong>Propuesta:</strong> {escape(item['suggested_resolution'])}</p>"
    if item["example_type"]:
        extra += f"<p><span class=\"badge\">{escape(item['example_type'])}</span></p>"
    if item["incorporated_revision_number"] is not None:
        extra += f"<p class=\"muted\">Incorporado en revisión {item['incorporated_revision_number']}.</p>"
    actions = ""
    if item["status"] != "incorporated" and item["type"] == "clarification":
        actions = f"""<form method="post" action="/items/{item['id']}/answer"><label>Respuesta<textarea name="content" required></textarea></label><button>Responder</button></form>"""
    elif item["status"] != "incorporated" and item["type"] in ("impact", "example"):
        actions = f"""<form method="post" action="/items/{item['id']}/decision"><label>Observación opcional<textarea name="observation"></textarea></label><button name="decision" value="accept">Aceptar</button><button name="decision" value="reject">Rechazar</button></form>"""
    return f"""<article class="item"><h3>{escape(item['title'])} <span class="badge">{escape(item['type'])}</span> <span class="badge">{escape(item['status'])}</span></h3>
<p class="muted">Origen: {escape(item['source'])}</p><p>{escape(item['description'])}</p>{extra}{actions}<details><summary>Historial ({len(history)})</summary><ul>{historical}</ul></details></article>"""


def render_spec(application: DashboardApplication, spec_id: int, query: dict[str, list[str]]) -> str:
    spec, items, responses = application.spec_detail(spec_id)
    item_type = form_value(query, "type") or None
    source = form_value(query, "source") or None
    if item_type:
        items = [item for item in items if item["type"] == item_type]
    if source:
        items = [item for item in items if item["source"] == source]
    rendered_spec = markdown_to_html(spec["revision_content"] or spec["description"])
    current = f"Revisión {spec['revision_number']} · {spec['revision_created_at']}" if spec["revision_number"] else "Aún no hay revisión; se muestra el request actual."
    filters = f"""<form method="get"><label>Tipo <select name="type">{option_tags(VALID_ITEM_TYPES, item_type)}</select></label><label>Origen <select name="source">{option_tags(VALID_SOURCES, source)}</select></label><button>Filtrar asuntos</button></form>"""
    item_markup = "\n".join(render_item(item, responses) for item in items) or "<p>No hay asuntos para estos filtros.</p>"
    body = f"""<h1>{escape(spec['title'])}</h1><p><span class="badge">{escape(spec['definition_status'])}</span> <span class="muted">{escape(spec['slug'])}</span></p>
<h2>Definición actual</h2><p class="muted">{escape(current)}</p><section>{rendered_spec}</section><details><summary>Markdown original</summary><pre>{escape(spec['revision_content'] or spec['description'])}</pre></details>
<h2>Asuntos de definición</h2>{filters}{item_markup}"""
    return page(spec["title"], body, form_value(query, "notice"), form_value(query, "error"))


def make_handler(application: DashboardApplication):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, format: str, *args: object) -> None:
            return

        def send_html(self, status: HTTPStatus, content: str) -> None:
            body = content.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def redirect(self, location: str) -> None:
            self.send_response(HTTPStatus.SEE_OTHER)
            self.send_header("Location", location)
            self.end_headers()

        def do_GET(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            query = parse_qs(parsed.query)
            try:
                if parsed.path == "/":
                    self.send_html(HTTPStatus.OK, render_index(application, query))
                    return
                parts = parsed.path.strip("/").split("/")
                if len(parts) == 2 and parts[0] == "specs" and parts[1].isdigit():
                    self.send_html(HTTPStatus.OK, render_spec(application, int(parts[1]), query))
                    return
                self.send_html(HTTPStatus.NOT_FOUND, page("No encontrado", "<h1>No encontrado</h1>"))
            except DashboardError as error:
                self.send_html(HTTPStatus.BAD_REQUEST, page("Error", "<h1>Dashboard</h1>", error=str(error)))

        def do_POST(self) -> None:  # noqa: N802
            parsed = urlparse(self.path)
            length = int(self.headers.get("Content-Length", "0"))
            values = parse_qs(self.rfile.read(length).decode("utf-8"))
            parts = parsed.path.strip("/").split("/")
            try:
                if len(parts) == 3 and parts[0] == "items" and parts[1].isdigit() and parts[2] == "answer":
                    spec_id = application.record_answer(int(parts[1]), form_value(values, "content"))
                    self.redirect(f"/specs/{spec_id}?notice={quote('Respuesta registrada; la aclaración fue aceptada.')}" )
                    return
                if len(parts) == 3 and parts[0] == "items" and parts[1].isdigit() and parts[2] == "decision":
                    decision = form_value(values, "decision")
                    spec_id = application.record_decision(int(parts[1]), decision, form_value(values, "observation"))
                    notice = "Impacto o ejemplo aceptado." if decision == "accept" else "Impacto o ejemplo rechazado."
                    self.redirect(f"/specs/{spec_id}?notice={quote(notice)}")
                    return
                self.send_html(HTTPStatus.NOT_FOUND, page("No encontrado", "<h1>No encontrado</h1>"))
            except DashboardError as error:
                self.send_html(HTTPStatus.BAD_REQUEST, page("Error", "<h1>No se pudo registrar la interacción</h1>", error=str(error)))

    return Handler


def parse_arguments(arguments: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Start the local feature-definition dashboard.")
    parser.add_argument("--db", help="SQLite database path. Defaults to ./feature_workflow.sqlite3.")
    parser.add_argument("--port", type=int, default=8000, help="Local TCP port (default: 8000).")
    return parser.parse_args(arguments)


def main(arguments: list[str] | None = None) -> int:
    parsed = parse_arguments(arguments if arguments is not None else sys.argv[1:])
    if not 1 <= parsed.port <= 65535:
        print("error: --port must be between 1 and 65535", file=sys.stderr)
        return 2
    database_path = resolve_database_path(parsed.db)
    try:
        with closing(open_database(database_path)):
            pass
    except DashboardError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    server = ThreadingHTTPServer(("127.0.0.1", parsed.port), make_handler(DashboardApplication(database_path)))
    print(f"Dashboard available at http://127.0.0.1:{parsed.port}/ (database: {database_path})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDashboard stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
