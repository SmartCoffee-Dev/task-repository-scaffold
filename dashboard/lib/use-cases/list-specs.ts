import type { SpecRepository } from "../repositories/spec-repository";
import type { SpecWithCounts, SpecListFilters } from "../types";

export async function listSpecs(
  specRepo: SpecRepository,
  filters?: SpecListFilters
): Promise<SpecWithCounts[]> {
  return specRepo.listAll(filters);
}