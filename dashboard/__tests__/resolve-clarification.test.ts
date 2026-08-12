import { describe, it, expect, vi } from "vitest";
import { resolveClarification } from "@/lib/use-cases/resolve-clarification";
import type { DefinitionResponseRepository } from "@/lib/repositories/definition-response-repository";

function makeMockRepo(overrides: Partial<DefinitionResponseRepository> = {}) {
  return {
    create: vi.fn(),
    findByItemId: vi.fn(),
    updateItemStatus: vi.fn(),
    ...overrides,
  } as unknown as DefinitionResponseRepository;
}

describe("resolveClarification", () => {
  it("creates an answer response and transitions to accepted", async () => {
    const repo = makeMockRepo({
      create: vi.fn().mockResolvedValue({
        response: {
          id: 1,
          content: "Do not create automatically.",
          responseType: "answer",
          createdAt: "2025-01-01T00:00:00Z",
        },
        newStatus: "accepted",
      }),
    });

    const result = await resolveClarification(repo, {
      itemId: 42,
      content: "Do not create automatically.",
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: 42,
      responseType: "answer",
      content: "Do not create automatically.",
    });

    expect(result).toEqual({
      responseId: 1,
      newStatus: "accepted",
      responseCreatedAt: "2025-01-01T00:00:00Z",
    });
  });

  it("rejects empty content", async () => {
    const repo = makeMockRepo();
    await expect(
      resolveClarification(repo, { itemId: 1, content: "" })
    ).rejects.toThrow("Content is required");
  });

  it("rejects whitespace-only content", async () => {
    const repo = makeMockRepo();
    await expect(
      resolveClarification(repo, { itemId: 1, content: "   " })
    ).rejects.toThrow("Content is required");
  });

  it("trims content before sending to repository", async () => {
    const repo = makeMockRepo({
      create: vi.fn().mockResolvedValue({
        response: { id: 2, content: "ok", responseType: "answer", createdAt: "2025-01-01T00:00:00Z" },
        newStatus: "accepted",
      }),
    });

    await resolveClarification(repo, {
      itemId: 1,
      content: "  hello world  ",
    });

    expect(repo.create).toHaveBeenCalledWith({
      itemId: 1,
      responseType: "answer",
      content: "hello world",
    });
  });
});