PRAGMA foreign_keys = ON;

INSERT INTO specs (id, title, slug, description) VALUES
  (2, 'Vista de actividades y progreso de una spec', 'firt-tasks-view', 'Vista de actividades y progreso de una spec.');

INSERT INTO tasks (id, spec_id, title, description, status, parent_id, branch) VALUES
  (26, 2, '[US-1] Establecer infraestructura de datos', 'Desc US-1', 'pending', NULL, NULL),
  (27, 2, 'Instalar @xyflow/react', 'Desc 27', 'done', 26, NULL),
  (28, 2, 'Extender lib/types.ts', 'Desc 28', 'pending', 26, NULL),
  (29, 2, 'Crear task-repository.ts', 'Desc 29', 'wip', 26, NULL),
  (30, 2, '[US-2] Construir la página de actividades', 'Desc US-2', 'pending', NULL, NULL),
  (31, 2, 'Crear TaskDescriptionModal', 'Desc 31', 'pending', 30, NULL),
  (32, 2, 'Crear page.tsx', 'Desc 32', 'done', 30, NULL),
  (33, 2, 'Crear ActivitiesContent', 'Desc 33', 'pending', 30, NULL),
  (34, 2, 'Modificar specs-page-content', 'Desc 34', 'pending', 30, NULL),
  (35, 2, '[US-3] Implementar diagrama de flujo', 'Desc US-3', 'pending', NULL, NULL);

INSERT INTO task_dependencies (task_id, required_task_id) VALUES
  (30, 26),
  (35, 26);
