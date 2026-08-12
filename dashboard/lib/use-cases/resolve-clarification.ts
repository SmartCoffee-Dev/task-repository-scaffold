import type { DefinitionResponseRepository } from "../repositories/definition-response-repository";
import { InvalidStateError } from "./errors";

export interface ResolveClarificationInput {
  itemId: number;
  content: string;
}

export interface ResolveClarificationOutput {
  responseId: number;
  newStatus: string;
  responseCreatedAt: string;
}

export async function resolveClarification(
  responseRepo: DefinitionResponseRepository,
  input: ResolveClarificationInput
): Promise<ResolveClarificationOutput> {
  if (!input.content || input.content.trim().length === 0) {
    throw new InvalidStateError("Content is required for clarification resolution");
  }

  const result = await responseRepo.create({
    itemId: input.itemId,
    responseType: "answer",
    content: input.content.trim(),
  });

  return {
    responseId: result.response.id,
    newStatus: result.newStatus,
    responseCreatedAt: result.response.createdAt,
  };
}