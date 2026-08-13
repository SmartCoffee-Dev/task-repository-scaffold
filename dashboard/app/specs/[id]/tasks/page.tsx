import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { TaskRepository } from "@/lib/repositories/task-repository";
import { ActivitiesContent } from "@/app/components/activities-content";

export default async function TasksPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const specId = Number(id);
  if (isNaN(specId)) {
    notFound();
  }

  const spec = await prisma.specs.findUnique({
    where: { id: specId },
    select: { id: true, title: true, slug: true },
  });

  if (!spec) {
    notFound();
  }

  const taskRepo = new TaskRepository(prisma);
  const taskTree = await taskRepo.findTasksBySpecId(specId);
  const dependencies = await taskRepo.findDependenciesBySpecId(specId);

  return (
    <ActivitiesContent
      spec={spec}
      taskTree={taskTree}
      dependencies={dependencies}
    />
  );
}