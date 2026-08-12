import { prisma } from "@/lib/prisma";
import { SpecRepository } from "@/lib/repositories/spec-repository";
import { listSpecs } from "@/lib/use-cases/list-specs";
import { SpecsPageContent } from "@/app/components/specs-page-content";
import type { DefinitionItemType, DefinitionItemSource } from "@/lib/types";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; source?: string }>;
}) {
  const params = await searchParams;

  const type =
    params.type &&
    ["clarification", "tension", "impact", "example"].includes(params.type)
      ? (params.type as DefinitionItemType)
      : undefined;

  const source =
    params.source &&
    ["description", "spec", "base_branch"].includes(params.source)
      ? (params.source as DefinitionItemSource)
      : undefined;

  const specRepo = new SpecRepository(prisma);
  const specs = await listSpecs(specRepo, { type, source });

  return (
    <SpecsPageContent
      specs={specs}
      currentFilters={{
        type: type || "",
        source: source || "",
      }}
    />
  );
}