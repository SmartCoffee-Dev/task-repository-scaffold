"use client";

import { useState } from "react";
import {
  Accordion,
  AccordionItem,
  Badge,
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Chip,
  Select,
  SelectItem,
} from "@heroui/react";
import type {
  TaskTreeNode,
  DetailLevel,
  TaskDependencyEdge,
} from "@/lib/types";
import { TaskDescriptionModal } from "./task-description-modal";
import { FlowDiagram } from "./flow-diagram";

const STATUS_COLOR: Record<
  string,
  "warning" | "default" | "primary" | "secondary" | "success"
> = {
  blocked: "warning",
  pending: "default",
  wip: "primary",
  in_review: "secondary",
  done: "success",
};

const STATUS_LABEL: Record<string, string> = {
  blocked: "Bloqueada",
  pending: "Pendiente",
  wip: "En progreso",
  in_review: "En revisión",
  done: "Completada",
};

const LEVEL_OPTIONS: { key: DetailLevel; label: string }[] = [
  { key: "user-stories", label: "Historias de usuario" },
  { key: "activities", label: "Actividades de segundo nivel" },
];

interface ActivitiesContentProps {
  spec: { id: number; title: string; slug: string };
  taskTree: TaskTreeNode[];
  dependencies: TaskDependencyEdge[];
}

export function ActivitiesContent({
  spec,
  taskTree,
  dependencies,
}: ActivitiesContentProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const [detailLevel, setDetailLevel] = useState<DetailLevel>("user-stories");

  const openDescription = (task: { title: string; description: string }) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  const closeDescription = () => {
    setModalOpen(false);
    setSelectedTask(null);
  };

  const totalActivities = taskTree.reduce(
    (sum, story) => sum + story.children.length,
    0
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <a
        href={`/specs/${spec.id}`}
        style={{
          fontSize: "0.85rem",
          color: "var(--color-link)",
          textDecoration: "none",
          marginBottom: "16px",
          display: "inline-block",
        }}
      >
        &larr; Volver al detalle
      </a>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          marginBottom: "8px",
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>
          Actividades de {spec.title}
        </h1>
      </div>

      <div
        style={{
          fontSize: "0.85rem",
          color: "var(--color-text-dim)",
          marginBottom: "20px",
        }}
      >
        <span>/{spec.slug}</span>
        <span style={{ marginLeft: "16px" }}>
          {taskTree.length} historia{taskTree.length !== 1 ? "s" : ""} de
          usuario, {totalActivities} actividad
          {totalActivities !== 1 ? "es" : ""}
        </span>
      </div>

      {taskTree.length === 0 ? (
        <p style={{ color: "var(--color-text-dim)", fontSize: "1rem" }}>
          No hay tareas planificadas para este spec.
        </p>
      ) : (
        <Accordion selectionMode="multiple" variant="splitted">
          {taskTree.map((story) => (
            <AccordionItem
              key={story.id}
              aria-label={story.title}
              title={
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "1rem" }}>
                    {story.title}
                  </span>
                  <Badge
                    color={STATUS_COLOR[story.status] || "default"}
                    variant="flat"
                    size="sm"
                  >
                    {STATUS_LABEL[story.status] || story.status}
                  </Badge>
                  <span
                    style={{
                      fontSize: "0.8rem",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {story.progress.done}/{story.progress.total} actividades
                  </span>
                </div>
              }
            >
              {story.children.length === 0 ? (
                <p
                  style={{
                    color: "var(--color-text-dim)",
                    fontSize: "0.9rem",
                    padding: "8px 0",
                  }}
                >
                  Sin actividades definidas.
                </p>
              ) : (
                <Table
                  aria-label={`Actividades de ${story.title}`}
                  isStriped
                  removeWrapper
                >
                  <TableHeader>
                    <TableColumn>Actividad</TableColumn>
                    <TableColumn width={140}>Estado</TableColumn>
                    <TableColumn width={180}>Rama</TableColumn>
                  </TableHeader>
                  <TableBody>
                    {story.children.map((activity) => (
                      <TableRow key={activity.id}>
                        <TableCell>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.9rem",
                                fontWeight: 500,
                              }}
                            >
                              {activity.title}
                            </span>
                            <Button
                              size="sm"
                              variant="light"
                              onPress={() =>
                                openDescription({
                                  title: activity.title,
                                  description: activity.description,
                                })
                              }
                              style={{
                                fontSize: "0.75rem",
                                padding: "2px 8px",
                                minWidth: "auto",
                                height: "auto",
                              }}
                            >
                              Ver descripción
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            color={
                              STATUS_COLOR[activity.status] || "default"
                            }
                            variant="flat"
                            size="sm"
                          >
                            {STATUS_LABEL[activity.status] ||
                              activity.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {activity.branch ? (
                            <Chip size="sm" variant="flat">
                              {activity.branch}
                            </Chip>
                          ) : (
                            <span
                              style={{
                                fontSize: "0.8rem",
                                color: "var(--color-text-dim)",
                              }}
                            >
                              &mdash;
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </AccordionItem>
          ))}
        </Accordion>
      )}

      {taskTree.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              marginTop: "28px",
              marginBottom: "8px",
            }}
          >
            <h2
              style={{ fontSize: "1.2rem", fontWeight: 600, margin: 0 }}
            >
              Diagrama de flujo
            </h2>
            <Select
              aria-label="Nivel de detalle del diagrama"
              label="Nivel de detalle"
              selectedKeys={[detailLevel]}
              onSelectionChange={(keys) => {
                const selected = Array.from(keys)[0] as
                  | DetailLevel
                  | undefined;
                if (
                  selected === "user-stories" ||
                  selected === "activities"
                ) {
                  setDetailLevel(selected);
                }
              }}
              style={{ minWidth: 240 }}
            >
              {LEVEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.key}>{opt.label}</SelectItem>
              ))}
            </Select>
          </div>
          <FlowDiagram
            tasks={taskTree}
            dependencies={dependencies}
            detailLevel={detailLevel}
          />
        </>
      )}

      {selectedTask && (
        <TaskDescriptionModal
          isOpen={modalOpen}
          onClose={closeDescription}
          title={selectedTask.title}
          description={selectedTask.description}
        />
      )}
    </div>
  );
}