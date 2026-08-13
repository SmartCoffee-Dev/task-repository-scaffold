import { describe, it, expect, beforeAll } from "vitest";
import { PrismaClient } from "@/app/generated/prisma/client";
import { TaskRepository } from "@/lib/repositories/task-repository";

process.env.DATABASE_URL = "file:/workdir/feature_workflow.sqlite3";

describe("TaskRepository smoke", () => {
  let repo: TaskRepository;

  beforeAll(() => {
    const prisma = new PrismaClient();
    repo = new TaskRepository(prisma);
  });

  it("findRootTasksBySpecId returns only root tasks", async () => {
    const roots = await repo.findRootTasksBySpecId(2);
    expect(roots.map((t) => t.id)).toEqual([26, 30, 35]);
  });

  it("findChildrenByParentId returns direct children", async () => {
    const children = await repo.findChildrenByParentId(26);
    expect(children.map((t) => t.id)).toEqual([27, 28, 29]);
  });

  it("findDependenciesBySpecId returns dependency pairs", async () => {
    const deps = await repo.findDependenciesBySpecId(2);
    expect(deps).toEqual([
      { taskId: 30, requiredTaskId: 26 },
      { taskId: 35, requiredTaskId: 26 },
    ]);
  });

  it("findTasksBySpecId builds a two-level tree with progress", async () => {
    const tree = await repo.findTasksBySpecId(2);
    expect(tree.map((n) => n.id)).toEqual([26, 30, 35]);

    const us1 = tree.find((n) => n.id === 26)!;
    expect(us1.children.map((c) => c.id)).toEqual([27, 28, 29]);
    expect(us1.progress).toEqual({ done: 1, total: 3 });

    const us2 = tree.find((n) => n.id === 30)!;
    expect(us2.progress).toEqual({ done: 1, total: 4 });

    const us3 = tree.find((n) => n.id === 35)!;
    expect(us3.children).toEqual([]);
    expect(us3.progress).toEqual({ done: 0, total: 1 });
  });
});
