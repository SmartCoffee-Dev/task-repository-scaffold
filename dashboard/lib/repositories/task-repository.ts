import type { PrismaClient } from "../../app/generated/prisma/client";

import type {
  Task,
  TaskDependencyEdge,
  TaskProgress,
  TaskTreeNode,
} from "../types";

type TaskRow = {
  id: number;
  spec_id: number;
  title: string;
  description: string;
  status: string;
  parent_id: number | null;
  branch: string | null;
  created_at: string;
  updated_at: string;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    specId: row.spec_id,
    title: row.title,
    description: row.description,
    status: row.status as Task["status"],
    parentId: row.parent_id,
    branch: row.branch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function selfProgress(task: Task): TaskProgress {
  return { done: task.status === "done" ? 1 : 0, total: 1 };
}

export class TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findTasksBySpecId(specId: number): Promise<TaskTreeNode[]> {
    const rows = await this.prisma.tasks.findMany({
      where: { spec_id: specId },
      orderBy: { id: "asc" },
    });

    const tasks = rows.map(toTask);

    const childrenByParent = new Map<number, Task[]>();
    const roots: Task[] = [];

    for (const task of tasks) {
      if (task.parentId === null) {
        roots.push(task);
        continue;
      }

      const siblings = childrenByParent.get(task.parentId) ?? [];
      siblings.push(task);
      childrenByParent.set(task.parentId, siblings);
    }

    const toTreeNode = (task: Task, withChildren: boolean): TaskTreeNode => {
      const children = withChildren
        ? (childrenByParent.get(task.id) ?? []).map((child) =>
            toTreeNode(child, false)
          )
        : [];

      const progress: TaskProgress =
        children.length > 0
          ? {
              done: children.filter((child) => child.status === "done").length,
              total: children.length,
            }
          : selfProgress(task);

      return { ...task, children, progress };
    };

    return roots.map((root) => toTreeNode(root, true));
  }

  async findRootTasksBySpecId(specId: number): Promise<Task[]> {
    const rows = await this.prisma.tasks.findMany({
      where: { spec_id: specId, parent_id: null },
      orderBy: { id: "asc" },
    });

    return rows.map(toTask);
  }

  async findChildrenByParentId(parentId: number): Promise<Task[]> {
    const rows = await this.prisma.tasks.findMany({
      where: { parent_id: parentId },
      orderBy: { id: "asc" },
    });

    return rows.map(toTask);
  }

  async findDependenciesBySpecId(
    specId: number
  ): Promise<TaskDependencyEdge[]> {
    const rows = await this.prisma.task_dependencies.findMany({
      where: { task: { spec_id: specId } },
      orderBy: { task_id: "asc" },
    });

    return rows.map((row) => ({
      taskId: row.task_id,
      requiredTaskId: row.required_task_id,
    }));
  }
}
