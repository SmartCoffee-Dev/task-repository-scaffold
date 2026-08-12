import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { SpecsPageContent } from "@/app/components/specs-page-content";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("SpecsPageContent", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  const specs = [
    {
      id: 1,
      title: "Create Budget",
      slug: "create-budget",
      description: "Budget creation feature",
      pendingItems: 3,
      totalItems: 5,
      pendingTasks: 2,
      totalTasks: 4,
      currentRevisionId: 1,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-02",
    },
    {
      id: 2,
      title: "Import Budget",
      slug: "import-budget",
      description: "Budget import feature",
      pendingItems: 0,
      totalItems: 2,
      pendingTasks: 0,
      totalTasks: 2,
      currentRevisionId: 2,
      createdAt: "2025-01-01",
      updatedAt: "2025-01-02",
    },
  ];

  const defaultFilters = { type: "" as const, source: "" as const };

  it("renders spec titles and slugs", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    expect(screen.getByText("Create Budget")).toBeInTheDocument();
    expect(screen.getByText("import-budget")).toBeInTheDocument();
    expect(screen.getByText("Import Budget")).toBeInTheDocument();
  });

  it("shows the page heading", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    expect(screen.getByText("Feature Workflow Dashboard")).toBeInTheDocument();
  });

  it("shows 'draft' badge when pending items exist", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    const badges = screen.getAllByText("draft");
    expect(badges.length).toBe(1);
    const successBadges = screen.getAllByText("defined");
    expect(successBadges.length).toBe(1);
  });

  it("shows pending items count", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    expect(
      screen.getByText("3 pendientes / 5 asuntos")
    ).toBeInTheDocument();
    expect(
      screen.getByText("0 pendientes / 2 asuntos")
    ).toBeInTheDocument();
  });

  it("shows task progress", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    expect(screen.getByText("2 / 4 tareas")).toBeInTheDocument();
    expect(screen.getByText("2 / 2 tareas")).toBeInTheDocument();
  });

  it("shows empty message when no specs", () => {
    render(
      <SpecsPageContent specs={[]} currentFilters={defaultFilters} />
    );

    expect(
      screen.getByText("No hay specs que coincidan con los filtros seleccionados.")
    ).toBeInTheDocument();
  });

  it("has filter selectors", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    expect(screen.getByLabelText("Filtrar por tipo")).toBeInTheDocument();
    expect(screen.getByLabelText("Filtrar por origen")).toBeInTheDocument();
  });

  it("renders links to spec detail pages", () => {
    render(<SpecsPageContent specs={specs} currentFilters={defaultFilters} />);

    const createBudgetLink = screen.getByText("Create Budget").closest("a");
    expect(createBudgetLink).toHaveAttribute("href", "/specs/1");
    const importBudgetLink = screen.getByText("Import Budget").closest("a");
    expect(importBudgetLink).toHaveAttribute("href", "/specs/2");
  });
});