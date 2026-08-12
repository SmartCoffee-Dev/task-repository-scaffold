import type { DefinitionResponseRepository } from "../repositories/definition-response-repository";
import { InvalidStateError } from "./errors";

export interface DecideImpactInput {
  itemId: number;
  decision: "accept" | "reject";
  observation?: string;
}

export interface DecideImpactOutput {
  responseId: number;
  newStatus: string;
  responseCreatedAt: string;
}

export async function decideImpact(
  responseRepo: DefinitionResponseRepository,
  input: DecideImpactInput
): Promise<DecideImpactOutput> {
  if (!["accept", "reject"].includes(input.decision)) {
    throw new InvalidStateError(
      'Decision must be "accept" or "reject"'
    );
  }

  const responseType = input.decision === "accept" ? "accept" : "reject";
  const content = input.observation ?? "";

  const result = await responseRepo.create({
    itemId: input.itemId,
    responseType,
    content,
  });

  return {
    responseId: result.response.id,
    newStatus: result.newStatus,
    responseCreatedAt: result.response.createdAt,
  };
}