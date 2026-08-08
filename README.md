# Feature workflow SQLite scaffold

Este repositorio crea una base SQLite para concentrar la especificación de features, su plan de implementación y la trazabilidad de las sesiones de trabajo, tanto humanas como agénticas.

## Estructura generada

| Tabla | Campos principales y propósito |
| --- | --- |
| `specs` | `id`, `title`, `slug`, `description` y marcas de tiempo para cada especificación Markdown. |
| `tasks` | `id`, `spec_id`, `parent_id`, título, descripción, estado, rama y marcas de tiempo; modela actividades y subtareas. |
| `task_dependencies` | `task_id` y `required_task_id` para expresar los prerrequisitos entre tareas. |
| `session_logs` | `task_id`, `session_id`, resumen, decisiones JSON, archivos cambiados JSON y fecha de cierre. |

Las tareas no pueden cruzar de spec al formar jerarquías o dependencias, ni formar ciclos. Para preservar el orden del plan, una tarea solo puede pasar a `wip`, `in_review` o `done` cuando todos sus prerrequisitos están en `done`. Los campos `taken_decisions` y `files_changed` se guardan como JSON validado.

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
