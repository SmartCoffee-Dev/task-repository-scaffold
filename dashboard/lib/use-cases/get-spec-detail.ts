import type { SpecRepository } from "../repositories/spec-repository";
import type { SpecDetail } from "../types";
import { NotFoundError } from "./errors";

export async function getSpecDetail(
  specRepo: SpecRepository,
  specId: number
): Promise<SpecDetail> {
  const spec = await specRepo.findById(specId);

  if (!spec) {
    throw new NotFoundError(`Spec with id ${specId} not found`);
  }

  return spec;
}