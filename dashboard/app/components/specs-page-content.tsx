"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Select,
  SelectItem,
  Badge,
  Link,
} from "@heroui/react";
import type {
  SpecWithCounts,
  DefinitionItemType,
  DefinitionItemSource,
} from "@/lib/types";

const TYPE_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Todos los tipos" },
  { key: "clarification", label: "Clarification" },
  { key: "tension", label: "Tension" },
  { key: "impact", label: "Impact" },
  { key: "example", label: "Example" },
];

const SOURCE_OPTIONS: { key: string; label: string }[] = [
  { key: "", label: "Todos los orígenes" },
  { key: "description", label: "Description" },
  { key: "spec", label: "Spec" },
  { key: "base_branch", label: "Base branch" },
];

interface SpecsPageContentProps {
  specs: SpecWithCounts[];
  currentFilters: {
    type: DefinitionItemType | "";
    source: DefinitionItemSource | "";
  };
}

function definitionStatus(spec: SpecWithCounts): "defined" | "draft" {
  return spec.pendingItems > 0 ? "draft" : "defined";
}

export function SpecsPageContent({
  specs,
  currentFilters,
}: SpecsPageContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div style={{ padding: "24px", maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "16px" }}>
        Feature Workflow Dashboard
      </h1>

      <div
        style={{
          display: "flex",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <Select
          aria-label="Filtrar por tipo"
          label="Tipo de asunto"
          placeholder="Todos los tipos"
          selectedKeys={currentFilters.type ? [currentFilters.type] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] || "";
            updateFilter("type", selected as string);
          }}
          style={{ minWidth: 200 }}
        >
          {TYPE_OPTIONS.map((opt) => (
            <SelectItem key={opt.key}>{opt.label}</SelectItem>
          ))}
        </Select>

        <Select
          aria-label="Filtrar por origen"
          label="Origen"
          placeholder="Todos los orígenes"
          selectedKeys={currentFilters.source ? [currentFilters.source] : []}
          onSelectionChange={(keys) => {
            const selected = Array.from(keys)[0] || "";
            updateFilter("source", selected as string);
          }}
          style={{ minWidth: 200 }}
        >
          {SOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.key}>{opt.label}</SelectItem>
          ))}
        </Select>
      </div>

      {specs.length === 0 ? (
        <p style={{ color: "var(--color-text-dim)", fontSize: "1.1rem" }}>
          No hay specs que coincidan con los filtros seleccionados.
        </p>
      ) : (
        <Table aria-label="Listado de specs" isStriped>
          <TableHeader>
            <TableColumn>Spec</TableColumn>
            <TableColumn>Estado</TableColumn>
            <TableColumn>Asuntos</TableColumn>
            <TableColumn>Progreso</TableColumn>
          </TableHeader>
          <TableBody>
            {specs.map((spec) => {
              const doneTasks = spec.totalTasks - spec.pendingTasks;
              return (
                <TableRow key={spec.id}>
                  <TableCell>
                    <div>
                      <Link
                        href={`/specs/${spec.id}`}
                        style={{ fontWeight: 600, fontSize: "0.95rem" }}
                      >
                        {spec.title}
                      </Link>
                      <div
                        style={{
                          fontSize: "0.8rem",
                          color: "var(--color-text-dim)",
                          marginTop: "2px",
                        }}
                      >
                        {spec.slug}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      color={
                        definitionStatus(spec) === "defined"
                          ? "success"
                          : "warning"
                      }
                      variant="flat"
                    >
                      {definitionStatus(spec)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: "0.9rem" }}>
                      {spec.pendingItems} pendientes / {spec.totalItems} asuntos
                    </span>
                  </TableCell>
                  <TableCell>
                    {spec.totalTasks > 0 ? (
                      <Link
                        href={`/specs/${spec.id}/tasks`}
                        style={{ fontSize: "0.9rem" }}
                      >
                        {doneTasks} / {spec.totalTasks} tareas
                      </Link>
                    ) : (
                      <span style={{ fontSize: "0.9rem" }}>
                        {doneTasks} / {spec.totalTasks} tareas
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}