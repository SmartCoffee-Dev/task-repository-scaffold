import type { PrismaClient } from "../../app/generated/prisma/client";

import type {
  DefinitionItem,
  DefinitionItemFilters,
  DefinitionItemWithResponses,
} from "../types";

export class DefinitionItemRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySpecId(
    specId: number,
    filters?: DefinitionItemFilters
  ): Promise<DefinitionItemWithResponses[]> {
    const items = await this.prisma.definition_items.findMany({
      where: {
        spec_id: specId,
        ...(filters?.type ? { type: filters.type } : {}),
        ...(filters?.source ? { source: filters.source } : {}),
        ...(filters?.status ? { status: filters.status } : {}),
      },
      include: {
        responses: {
          orderBy: { created_at: "asc" },
        },
      },
      orderBy: { created_at: "desc" },
    });

    return items.map((item) => ({
      id: item.id,
      specId: item.spec_id,
      type: item.type as DefinitionItem["type"],
      source: item.source as DefinitionItem["source"],
      title: item.title,
      description: item.description,
      question: item.question,
      suggestedResolution: item.suggested_resolution,
      exampleType: item.example_type as DefinitionItem["exampleType"],
      fingerprint: item.fingerprint,
      status: item.status as DefinitionItem["status"],
      acceptedRevisionNumber: item.accepted_revision_number,
      incorporatedInRevisionId: item.incorporated_in_revision_id,
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      responses: item.responses.map((r) => ({
        id: r.id,
        definitionItemId: r.definition_item_id,
        responseType: r.response_type as DefinitionItemWithResponses["responses"][number]["responseType"],
        content: r.content,
        createdAt: r.created_at,
      })),
    }));
  }

  async countBySpecId(
    specId: number
  ): Promise<{ total: number; pending: number }> {
    const [total, pending] = await Promise.all([
      this.prisma.definition_items.count({
        where: { spec_id: specId },
      }),
      this.prisma.definition_items.count({
        where: { spec_id: specId, status: "pending" },
      }),
    ]);

    return { total, pending };
  }
}