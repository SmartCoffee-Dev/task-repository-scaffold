"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CircularProgress, Button } from "@heroui/react";
import type {
  TaskTreeNode,
  TaskDependencyEdge,
  DetailLevel,
  TaskProgress,
} from "@/lib/types";
import { TaskDescriptionModal } from "./task-description-modal";

type FlowNodeData = {
  title: string;
  description: string;
  progress: TaskProgress;
  colorIndex: number;
  onOpenDescription: (task: { title: string; description: string }) => void;
};

type FlowNode = Node<FlowNodeData, "custom">;

function CustomNode({ data }: NodeProps<FlowNode>) {
  const progressValue =
    data.progress.total > 0
      ? Math.round((data.progress.done / data.progress.total) * 100)
      : 0;

  return (
    <div
      style={{
        width: 220,
        padding: "12px",
        borderRadius: "8px",
        background: `var(--flow-color-${data.colorIndex})`,
        border: "1px solid var(--color-border)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <CircularProgress
          aria-label={`Progreso de ${data.title}`}
          size="sm"
          value={progressValue}
          showValueLabel
          color="primary"
        />
        <span
          style={{
            fontWeight: 600,
            fontSize: "0.8rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            display: "-webkit-box",
          }}
        >
          {data.title}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button
          size="sm"
          variant="flat"
          onPress={() =>
            data.onOpenDescription({
              title: data.title,
              description: data.description,
            })
          }
        >
          Descripción
        </Button>
      </div>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

interface FlowDiagramProps {
  tasks: TaskTreeNode[];
  dependencies: TaskDependencyEdge[];
  detailLevel: DetailLevel;
}

export function FlowDiagram({
  tasks,
  dependencies,
  detailLevel,
}: FlowDiagramProps) {
  const [selectedTask, setSelectedTask] = useState<{
    title: string;
    description: string;
  } | null>(null);

  const openDescription = useCallback(
    (task: { title: string; description: string }) => {
      setSelectedTask(task);
    },
    []
  );

  const closeDescription = useCallback(() => setSelectedTask(null), []);

  const { nodes, edges } = useMemo(() => {
    const buildNodes = (
      items: TaskTreeNode[],
      computeIndex: (t: TaskTreeNode) => number
    ): FlowNode[] =>
      items.map((item, index) => ({
        id: String(item.id),
        type: "custom" as const,
        position: { x: index * 280, y: 0 },
        data: {
          title: item.title,
          description: item.description,
          progress: item.progress,
          colorIndex: computeIndex(item) % 20,
          onOpenDescription: openDescription,
        },
      }));

    const buildEdges = (
      visibleIds: Set<number>
    ): Edge[] =>
      dependencies
        .filter(
          (d) =>
            visibleIds.has(d.taskId) && visibleIds.has(d.requiredTaskId)
        )
        .map((d) => ({
          id: `e-${d.requiredTaskId}-${d.taskId}`,
          source: String(d.requiredTaskId),
          target: String(d.taskId),
          markerEnd: { type: MarkerType.ArrowClosed },
        }));

    if (detailLevel === "user-stories") {
      const rootIds = new Set(tasks.map((t) => t.id));
      return {
        nodes: buildNodes(tasks, (t) => t.id),
        edges: buildEdges(rootIds),
      };
    }

    const activities = tasks.flatMap((t) => t.children);

    const byParent = new Map<number, TaskTreeNode[]>();
    for (const activity of activities) {
      const parentId = activity.parentId ?? activity.id;
      const group = byParent.get(parentId) ?? [];
      group.push(activity);
      byParent.set(parentId, group);
    }

    const nodesList: FlowNode[] = [];
    let column = 0;
    for (const [, group] of byParent) {
      group.forEach((activity, row) => {
        nodesList.push({
          id: String(activity.id),
          type: "custom",
          position: { x: column * 300, y: row * 160 },
          data: {
            title: activity.title,
            description: activity.description,
            progress: activity.progress,
            colorIndex: (activity.parentId ?? activity.id) % 20,
            onOpenDescription: openDescription,
          },
        });
      });
      column += 1;
    }

    const activityIds = new Set(activities.map((a) => a.id));

    return {
      nodes: nodesList,
      edges: buildEdges(activityIds),
    };
  }, [tasks, dependencies, detailLevel, openDescription]);

  if (nodes.length === 0) {
    return (
      <p
        style={{
          color: "var(--color-text-dim)",
          fontSize: "0.9rem",
          marginTop: "16px",
        }}
      >
        No hay tareas para el nivel seleccionado.
      </p>
    );
  }

  return (
    <>
      <div
        style={{
          width: "100%",
          height: 500,
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          marginTop: "16px",
        }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls />
        </ReactFlow>
      </div>
      {selectedTask && (
        <TaskDescriptionModal
          isOpen={!!selectedTask}
          onClose={closeDescription}
          title={selectedTask.title}
          description={selectedTask.description}
        />
      )}
    </>
  );
}