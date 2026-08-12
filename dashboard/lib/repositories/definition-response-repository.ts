import type { PrismaClient } from "../../app/generated/prisma/client";

import type { DefinitionItemStatus } from "../types";

export interface CreateResponseInput {
  itemId: number;
  responseType: string;
  content: string;
}

export class DefinitionResponseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: CreateResponseInput): Promise<{
    response: { id: number; content: string; responseType: string; createdAt: string };
    newStatus: string;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.definition_items.findUniqueOrThrow({
        where: { id: input.itemId },
      });

      if (item.status === "incorporated") {
        throw new Error("Cannot add a response to an incorporated definition item");
      }

      const response = await tx.definition_responses.create({
        data: {
          definition_item_id: input.itemId,
          response_type: input.responseType,
          content: input.content,
        },
      });

      let newStatus: DefinitionItemStatus = item.status as DefinitionItemStatus;

      if (input.responseType === "answer" || input.responseType === "accept") {
        newStatus = "accepted";
      } else if (input.responseType === "reject") {
        newStatus = "rejected";
      }

      await tx.definition_items.update({
        where: { id: input.itemId },
        data: { status: newStatus },
      });

      return {
        response: {
          id: response.id,
          content: response.content,
          responseType: response.response_type,
          createdAt: response.created_at,
        },
        newStatus,
      };
    });
  }

  async findByItemId(
    itemId: number
  ): Promise<
    Array<{
      id: number;
      definitionItemId: number;
      responseType: string;
      content: string;
      createdAt: string;
    }>
  > {
    const responses = await this.prisma.definition_responses.findMany({
      where: { definition_item_id: itemId },
      orderBy: { created_at: "asc" },
    });

    return responses.map((r) => ({
      id: r.id,
      definitionItemId: r.definition_item_id,
      responseType: r.response_type,
      content: r.content,
      createdAt: r.created_at,
    }));
  }

  async updateItemStatus(
    itemId: number,
    status: DefinitionItemStatus
  ): Promise<void> {
    await this.prisma.definition_items.update({
      where: { id: itemId },
      data: { status },
    });
  }
}