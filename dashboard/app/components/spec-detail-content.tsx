"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Select,
  SelectItem,
  Textarea,
  Button,
} from "@heroui/react";
import type {
  DefinitionItemWithResponses,
  DefinitionItemType,
  DefinitionItemSource,
  SpecDetail,
} from "@/lib/types";
import { MarkdownContent } from "./markdown-content";
import { resolveClarificationAction, decideImpactAction } from "@/app/specs/[id]/actions";

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

const TYPE_BADGE_COLOR: Record<string, "primary" | "secondary" | "danger" | "success"> = {
  clarification: "primary",
  tension: "secondary",
  impact: "danger",
  example: "success",
};

const STATUS_BADGE_COLOR: Record<string, "warning" | "success" | "danger" | "default"> = {
  pending: "warning",
  accepted: "success",
  rejected: "danger",
  incorporated: "default",
};

interface SpecDetailContentProps {
  spec: SpecDetail;
  definitionStatus: "defined" | "draft";
  items: DefinitionItemWithResponses[];
  currentFilters: {
    type: DefinitionItemType | "";
    source: DefinitionItemSource | "";
  };
  message: string | null;
}

function sortItems(items: DefinitionItemWithResponses[]): DefinitionItemWithResponses[] {
  const order: Record<string, number> = { pending: 0, accepted: 1, rejected: 2, incorporated: 3 };
  return [...items].sort((a, b) => (order[a.status] ?? 4) - (order[b.status] ?? 4));
}

export function SpecDetailContent({
  spec,
  definitionStatus,
  items,
  currentFilters,
  message,
}: SpecDetailContentProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("message");
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      router.push(`/specs/${spec.id}?${params.toString()}`);
    },
    [router, searchParams, spec.id]
  );

  const isResolvable = (item: DefinitionItemWithResponses) =>
    item.status !== "incorporated";

  const sortedItems = sortItems(items);

  return (
    <div style={{ padding: "24px", maxWidth: 960, margin: "0 auto" }}>
      <a
        href="/"
        style={{
          fontSize: "0.85rem",
          color: "#2563eb",
          textDecoration: "none",
          marginBottom: "16px",
          display: "inline-block",
        }}
      >
        ← Volver al listado
      </a>

      {message && (
        <div
          style={{
            padding: "10px 16px",
            borderRadius: "8px",
            marginBottom: "16px",
            fontSize: "0.9rem",
            fontWeight: 500,
            background: message.startsWith("success:") ? "#dcfce7" : "#fee2e2",
            color: message.startsWith("success:") ? "#166534" : "#991b1b",
          }}
        >
          {message.replace(/^(success|error):/, "")}
        </div>
      )}

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
          {spec.title}
        </h1>
        <Badge
          color={definitionStatus === "defined" ? "success" : "warning"}
          variant="flat"
        >
          {definitionStatus}
        </Badge>
      </div>

      <div style={{ fontSize: "0.85rem", color: "#71717a", marginBottom: "20px" }}>
        <span>/{spec.slug}</span>
        {spec.currentRevision && (
          <span style={{ marginLeft: "16px" }}>
            Revisión #{spec.currentRevision.revisionNumber}
          </span>
        )}
      </div>

      {spec.currentRevision ? (
        <section style={{ marginBottom: "32px" }}>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "12px" }}>
            Contenido
          </h2>
          <MarkdownContent content={spec.currentRevision.content} />
        </section>
      ) : (
        <p style={{ color: "#71717a", marginBottom: "24px" }}>
          Este spec no tiene revisiones aún.
        </p>
      )}

      <section>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 600, marginBottom: "12px" }}>
          Asuntos ({items.length})
        </h2>

        <div
          style={{
            display: "flex",
            gap: "12px",
            marginBottom: "20px",
            flexWrap: "wrap",
          }}
        >
          <Select
            aria-label="Filtrar items por tipo"
            label="Tipo"
            placeholder="Todos los tipos"
            selectedKeys={currentFilters.type ? [currentFilters.type] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] || "";
              updateFilter("type", selected as string);
            }}
            style={{ minWidth: 180 }}
            size="sm"
          >
            {TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.key}>{opt.label}</SelectItem>
            ))}
          </Select>

          <Select
            aria-label="Filtrar items por origen"
            label="Origen"
            placeholder="Todos los orígenes"
            selectedKeys={currentFilters.source ? [currentFilters.source] : []}
            onSelectionChange={(keys) => {
              const selected = Array.from(keys)[0] || "";
              updateFilter("source", selected as string);
            }}
            style={{ minWidth: 180 }}
            size="sm"
          >
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.key}>{opt.label}</SelectItem>
            ))}
          </Select>
        </div>

        {sortedItems.length === 0 ? (
          <p style={{ color: "#71717a", fontSize: "1rem" }}>
            No hay asuntos para estos filtros.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {sortedItems.map((item) => (
              <div
                key={item.id}
                style={{
                  border: "1px solid #e4e4e7",
                  borderRadius: "10px",
                  padding: "16px",
                  background: "#fafafa",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "space-between",
                    gap: "8px",
                    marginBottom: "8px",
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: "1rem",
                        marginBottom: "4px",
                      }}
                    >
                      {item.title}
                    </div>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                      <Badge
                        color={TYPE_BADGE_COLOR[item.type] || "default"}
                        variant="flat"
                        size="sm"
                      >
                        {item.type}
                      </Badge>
                      <Badge
                        color={STATUS_BADGE_COLOR[item.status] || "default"}
                        variant="flat"
                        size="sm"
                      >
                        {item.status}
                      </Badge>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "#a1a1aa",
                          alignSelf: "center",
                        }}
                      >
                        {item.source}
                      </span>
                    </div>
                  </div>
                </div>

                {item.description && (
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "#3f3f46",
                      marginBottom: "8px",
                      lineHeight: 1.5,
                    }}
                  >
                    {item.description}
                  </p>
                )}

                {item.question && (
                  <p
                    style={{
                      fontSize: "0.9rem",
                      color: "#52525b",
                      fontStyle: "italic",
                      marginBottom: "8px",
                    }}
                  >
                    Pregunta: {item.question}
                  </p>
                )}

                {item.suggestedResolution && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "#3b82f6",
                      marginBottom: "8px",
                    }}
                  >
                    Sugerencia: {item.suggestedResolution}
                  </p>
                )}

                {item.responses.length > 0 && (
                  <details style={{ marginTop: "8px" }}>
                    <summary
                      style={{
                        cursor: "pointer",
                        fontSize: "0.85rem",
                        color: "#52525b",
                      }}
                    >
                      Historial ({item.responses.length} respuesta
                      {item.responses.length !== 1 ? "s" : ""})
                    </summary>
                    <div
                      style={{
                        marginTop: "8px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "6px",
                      }}
                    >
                      {item.responses.map((r) => (
                        <div
                          key={r.id}
                          style={{
                            padding: "8px 12px",
                            background: "#f4f4f5",
                            borderRadius: "6px",
                            fontSize: "0.85rem",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#52525b",
                              marginBottom: "2px",
                            }}
                          >
                            {r.responseType} —{" "}
                            {new Date(r.createdAt).toLocaleString("es-ES")}
                          </div>
                          {r.content && (
                            <div style={{ color: "#3f3f46" }}>{r.content}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </details>
                )}

                {isResolvable(item) && item.type === "clarification" && (
                  <form
                    action={resolveClarificationAction}
                    style={{ marginTop: "12px" }}
                  >
                    <input type="hidden" name="specId" value={spec.id} />
                    <input type="hidden" name="itemId" value={item.id} />
                    <input
                      type="hidden"
                      name="currentType"
                      value={currentFilters.type}
                    />
                    <input
                      type="hidden"
                      name="currentSource"
                      value={currentFilters.source}
                    />
                    <Textarea
                      name="content"
                      aria-label="Tu respuesta"
                      placeholder="Escribe tu respuesta..."
                      minRows={2}
                      style={{ marginBottom: "8px" }}
                    />
                    <Button type="submit" color="primary" size="sm">
                      Responder
                    </Button>
                  </form>
                )}

                {isResolvable(item) &&
                  (item.type === "impact" || item.type === "example") && (
                    <form
                      action={decideImpactAction}
                      style={{ marginTop: "12px" }}
                    >
                      <input type="hidden" name="specId" value={spec.id} />
                      <input type="hidden" name="itemId" value={item.id} />
                      <input
                        type="hidden"
                        name="currentType"
                        value={currentFilters.type}
                      />
                      <input
                        type="hidden"
                        name="currentSource"
                        value={currentFilters.source}
                      />
                      <Textarea
                        name="observation"
                        aria-label="Observación (opcional)"
                        placeholder="Observación (opcional)..."
                        minRows={2}
                        style={{ marginBottom: "8px" }}
                      />
                      <div style={{ display: "flex", gap: "8px" }}>
                        <Button
                          type="submit"
                          name="decision"
                          value="accept"
                          color="success"
                          size="sm"
                        >
                          Aceptar
                        </Button>
                        <Button
                          type="submit"
                          name="decision"
                          value="reject"
                          color="danger"
                          size="sm"
                        >
                          Rechazar
                        </Button>
                      </div>
                    </form>
                  )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}