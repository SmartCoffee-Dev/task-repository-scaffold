import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpecDetailContent } from "@/app/components/spec-detail-content";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

const revision = {
  id: 1,
  specId: 1,
  revisionNumber: 1,
  content: "# Create Budget\n\nFull spec for budget creation.",
  createdAt: "2025-01-01",
};

const spec = {
  id: 1,
  title: "Create Budget",
  slug: "create-budget",
  description: "Budget creation",
  currentRevisionId: 1,
  createdAt: "2025-01-01",
  updatedAt: "2025-01-02",
  currentRevision: revision,
  definitionItems: [],
};

const items = [
  {
    id: 10,
    specId: 1,
    type: "clarification" as const,
    source: "description" as const,
    title: "Budget behavior needs a decision",
    description: "The request does not state how a missing budget is handled.",
    question: "What should happen when the budget does not exist?",
    suggestedResolution: "Create the budget automatically.",
    exampleType: null,
    fingerprint: "budget-missing-behavior",
    status: "pending" as const,
    acceptedRevisionNumber: 0,
    incorporatedInRevisionId: null,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    responses: [],
  },
  {
    id: 11,
    specId: 1,
    type: "impact" as const,
    source: "spec" as const,
    title: "Authorization impact",
    description: "The change may affect existing permissions.",
    question: null,
    suggestedResolution: null,
    exampleType: null,
    fingerprint: "budget-impact-auth",
    status: "accepted" as const,
    acceptedRevisionNumber: 1,
    incorporatedInRevisionId: null,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-02",
    responses: [
      {
        id: 1,
        definitionItemId: 11,
        responseType: "accept",
        content: "Noted.",
        createdAt: "2025-01-02",
      },
    ],
  },
  {
    id: 12,
    specId: 1,
    type: "example" as const,
    source: "base_branch" as const,
    title: "Edge case: zero budget",
    description: "What happens when the amount is zero?",
    question: null,
    suggestedResolution: null,
    exampleType: "edge-case" as const,
    fingerprint: "budget-edge-case",
    status: "rejected" as const,
    acceptedRevisionNumber: 0,
    incorporatedInRevisionId: null,
    createdAt: "2025-01-01",
    updatedAt: "2025-01-02",
    responses: [
      {
        id: 2,
        definitionItemId: 12,
        responseType: "reject",
        content: "",
        createdAt: "2025-01-02",
      },
    ],
  },
];

const defaultFilters = { type: "" as const, source: "" as const };

describe("SpecDetailContent", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders spec title", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    const titles = screen.getAllByText("Create Budget");
    expect(titles.length).toBeGreaterThanOrEqual(1);
  });

  it("renders spec slug", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("/create-budget")).toBeInTheDocument();
  });

  it("shows definition status badge", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("draft")).toBeInTheDocument();
  });

  it("shows 'defined' badge when no pending items", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="defined"
        items={[items[1]]}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("defined")).toBeInTheDocument();
  });

  it("shows revision content markdown", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("Full spec for budget creation.")).toBeInTheDocument();
  });

  it("shows revision number", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("Revisión #1")).toBeInTheDocument();
  });

  it("shows pending items with badge", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    const pendingBadges = screen.getAllByText("pending");
    expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows clarification item title and question", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(
      screen.getByText("Budget behavior needs a decision")
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Pregunta: What should happen when the budget does not exist?"
      )
    ).toBeInTheDocument();
  });

  it("shows suggested resolution", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(
      screen.getByText("Sugerencia: Create the budget automatically.")
    ).toBeInTheDocument();
  });

  it("shows response history for resolved items", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("Authorization impact")).toBeInTheDocument();
    expect(screen.getByText("Noted.")).toBeInTheDocument();
  });

  it("shows accept and reject buttons for impact/example items", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    // Only shows form for the pending clarification (clarifications have "Responder",
    // accepted items don't have forms since they still have isResolvable)
    // The accepted impact at index 1 still has accept/reject buttons because status !== "incorporated"
    const acceptButtons = screen.getAllByText("Aceptar");
    const rejectButtons = screen.getAllByText("Rechazar");
    expect(acceptButtons.length).toBeGreaterThanOrEqual(1);
    expect(rejectButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("shows answer form for clarification items", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("Responder")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Escribe tu respuesta...")).toBeInTheDocument();
  });

  it("shows empty message when filtered items are empty", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={[]}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(
      screen.getByText("No hay asuntos para estos filtros.")
    ).toBeInTheDocument();
  });

  it("shows item count in the heading", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("Asuntos (3)")).toBeInTheDocument();
  });

  it("shows success message when present", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message="success:Respuesta registrada correctamente"
      />
    );

    expect(
      screen.getByText("Respuesta registrada correctamente")
    ).toBeInTheDocument();
  });

  it("shows error message when present", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message="error:No se pudo registrar la respuesta"
      />
    );

    expect(
      screen.getByText("No se pudo registrar la respuesta")
    ).toBeInTheDocument();
  });

  it("shows message when spec has no revision", () => {
    render(
      <SpecDetailContent
        spec={{ ...spec, currentRevision: null }}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(
      screen.getByText("Este spec no tiene revisiones aún.")
    ).toBeInTheDocument();
  });

  it("has back link to listing", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    const backLink = screen.getByText("← Volver al listado");
    expect(backLink).toHaveAttribute("href", "/");
  });

  it("shows all item types correctly", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("clarification")).toBeInTheDocument();
    expect(screen.getByText("impact")).toBeInTheDocument();
    expect(screen.getByText("example")).toBeInTheDocument();
  });

  it("shows all item statuses correctly", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByText("pending")).toBeInTheDocument();
    expect(screen.getByText("accepted")).toBeInTheDocument();
    expect(screen.getByText("rejected")).toBeInTheDocument();
  });

  it("has filter selectors for items", () => {
    render(
      <SpecDetailContent
        spec={spec}
        definitionStatus="draft"
        items={items}
        currentFilters={defaultFilters}
        message={null}
      />
    );

    expect(screen.getByLabelText("Filtrar items por tipo")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Filtrar items por origen")
    ).toBeInTheDocument();
  });
});