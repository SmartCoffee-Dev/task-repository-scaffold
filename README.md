# Feature workflow SQLite scaffold

Este repositorio crea una base SQLite para concentrar la especificación de features, su plan de implementación y la trazabilidad de las sesiones de trabajo, tanto humanas como agénticas.

## Estructura generada

| Tabla | Campos principales y propósito |
| --- | --- |
| `specs` | `id`, `title`, `slug`, `description`, `current_revision_id` y marcas de tiempo para cada especificación Markdown. |
| `spec_revisions` | `id`, `spec_id`, `revision_number`, `content` (Markdown completo), `created_at`. Snapshots inmutables y autosuficientes. |
| `definition_items` | `id`, `spec_id`, `type`, `source`, `title`, `description`, `question`, `suggested_resolution`, `example_type`, `fingerprint`, `status`, `accepted_revision_number`, `incorporated_in_revision_id`, marcas de tiempo. Asuntos que requieren intervención humana: aclaraciones, tensiones, impactos y ejemplos. |
| `definition_responses` | `id`, `definition_item_id`, `response_type`, `content`, `created_at`. Historial append-only de interacciones humanas con un asunto. |
| `tasks` | `id`, `spec_id`, `parent_id`, título, descripción, estado, rama y marcas de tiempo; modela actividades y subtareas. |
| `task_dependencies` | `task_id` y `required_task_id` para expresar los prerrequisitos entre tareas. |
| `session_logs` | `task_id`, `session_id`, resumen, decisiones JSON, archivos cambiados JSON y fecha de cierre. |

Las tareas no pueden cruzar de spec al formar jerarquías o dependencias, ni formar ciclos. Para preservar el orden del plan, una tarea solo puede pasar a `wip`, `in_review` o `done` cuando todos sus prerrequisitos están en `done`. Los campos `taken_decisions` y `files_changed` se guardan como JSON validado.

## Flujo de definición de specs

```text
description
    ↓
agent analysis
    ↓
definition_items
    ↓
dashboard
    ↓
human decisions
    ↓
agent
    ↓
new spec revision
    ↓
re-analysis
```

1. El agente analiza la `description` y el código en `HEAD`, generando `definition_items` cuando detecta ambigüedades, tensiones, impactos o ejemplos.
2. El dashboard presenta los asuntos pendientes para que una persona responda, acepte o rechace cada uno.
3. Un agente consume las decisiones aceptadas, crea una nueva `spec_revision` con el Markdown completo y marca los items como `incorporated`.
4. El agente vuelve a analizar la spec tras incorporar las decisiones.

Una spec está `defined` (definida) cuando no tiene `definition_items` con `status = 'pending'`.

## Dashboard

El dashboard es una aplicación web local incluida en el repositorio. No requiere dependencias externas — solo Python 3.9+ y SQLite con funciones JSON.

```bash
task-repository dashboard
```

El dashboard opera exclusivamente sobre la base `feature_workflow.sqlite3` del directorio actual. Para indicar otra base:

```bash
task-repository dashboard --db /ruta/proyecto/feature_workflow.sqlite3
```

El puerto por defecto es `8000`. Para cambiarlo:

```bash
task-repository dashboard --port 4321
```

Cada instancia del dashboard queda asociada a una sola base SQLite y no permite cambiarla desde la interfaz web. La resolución de la base por defecto es determinista: siempre busca `feature_workflow.sqlite3` en el directorio de trabajo actual.

### Alcance del dashboard

El dashboard puede:
- Listar specs y su estado de definición.
- Consultar y filtrar asuntos pendientes, aceptados, incorporados y rechazados.
- Responder aclaraciones mediante input de texto.
- Aceptar o rechazar impactos y ejemplos.
- Registrar observaciones adicionales.
- Mostrar el historial de respuestas de cada asunto.

El dashboard **no modifica** el contenido Markdown de las specs ni genera nuevas revisiones. La incorporación de decisiones a la spec corresponde al agente de generación de specs.

## Crear la base

Requiere Python 3.9 o posterior y una biblioteca SQLite con las funciones JSON habilitadas (incluidas en las distribuciones actuales de Python).

Desde la raíz del repositorio clonado, indica el directorio donde debe crearse la base:

```bash
python3 scripts/scaffold_db.py /ruta/al/directorio
```

El comando creará `/ruta/al/directorio/feature_workflow.sqlite3`; también puedes indicar el archivo directamente:

```bash
python3 scripts/scaffold_db.py /ruta/al/directorio/mi-plan.sqlite3
```

El comando no sobrescribe una base existente. Si realmente deseas reemplazarla, usa `--force`:

```bash
python3 scripts/scaffold_db.py /ruta/al/directorio --force
```

SQLite activa las claves foráneas por conexión. Los consumidores que escriban en la base deben ejecutar `PRAGMA foreign_keys = ON;` al abrir cada conexión para que las referencias se verifiquen.

## Pruebas

```bash
python3 -m unittest discover -s tests -v
```
