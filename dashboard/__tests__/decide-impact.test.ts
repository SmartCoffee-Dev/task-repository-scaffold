import { describe, it, expect, vi } from "vitest";
import { decideImpact } from "@/lib/use-cases/decide-impact";
import type { DefinitionResponseRepository } from "@/lib/repositories/definition-response-repository";

function makeMockRepo(overrides: Partial<DefinitionResponseRepository> = {}) {
  return {
    create: vi.fn(),
    findByItemId: vi.fn(),
    updateItemStatus: vi.fn(),
    ...overrides,
  } as unknown as DefinitionResponseRepository;
}

describe("decideImpact", () => {
  it("accept sends an accept response and transitions to accepted", async () => {
    const repo = makeMockRepo({
      create: vi.fn().mockResolvedValue({
        response: { id: 1, content: "Noted.", responseType: "accept", createdAt: "2025-01-01T00:00:00Z" },
        newStatus: "accepted",
      }),
    });

    const result = await decideImpact(repo, {
      itemId: 10,
      decision: "accept",
      observation: "Noted.",
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: 10,
      responseType: "accept",
      content: "Noted.",
    });

    expect(result).toEqual({
      responseId: 1,
      newStatus: "accepted",
      responseCreatedAt: "2025-01-01T00:00:00Z",
    });
  });

  it("reject sends a reject response and transitions to rejected", async () => {
    const repo = makeMockRepo({
      create: vi.fn().mockResolvedValue({
        response: { id: 2, content: "", responseType: "reject", createdAt: "2025-01-01T00:00:00Z" },
        newStatus: "rejected",
      }),
    });

    const result = await decideImpact(repo, {
      itemId: 10,
      decision: "reject",
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: 10,
      responseType: "reject",
      content: "",
    });

    expect(result.newStatus).toBe("rejected");
  });

  it("rejects an invalid decision value", async () => {
    const repo = makeMockRepo();
    await expect(
      decideImpact(repo, {
        itemId: 10,
        decision: "maybe" as "accept",
      })
    ).rejects.toThrow("must be \"accept\" or \"reject\"");
  });

  it("accept without observation sends empty content", async () => {
    const repo = makeMockRepo({
      create: vi.fn().mockResolvedValue({
        response: { id: 3, content: "", responseType: "accept", createdAt: "2025-01-01T00:00:00Z" },
        newStatus: "accepted",
      }),
    });

    await decideImpact(repo, { itemId: 10, decision: "accept" });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: 10,
      responseType: "accept",
      content: "",
    });
  });
});