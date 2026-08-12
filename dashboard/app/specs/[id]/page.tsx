import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SpecRepository } from "@/lib/repositories/spec-repository";
import { getSpecDetail } from "@/lib/use-cases/get-spec-detail";
import { NotFoundError } from "@/lib/use-cases/errors";
import { SpecDetailContent } from "@/app/components/spec-detail-content";
import type { DefinitionItemType, DefinitionItemSource } from "@/lib/types";

export default async function SpecDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ type?: string; source?: string; message?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const specId = Number(id);
  if (isNaN(specId)) {
    notFound();
  }

  const type =
    query.type &&
    ["clarification", "tension", "impact", "example"].includes(query.type)
      ? (query.type as DefinitionItemType)
      : undefined;

  const source =
    query.source &&
    ["description", "spec", "base_branch"].includes(query.source)
      ? (query.source as DefinitionItemSource)
      : undefined;

  let spec;
  try {
    const specRepo = new SpecRepository(prisma);
    spec = await getSpecDetail(specRepo, specId);
  } catch (err) {
    if (err instanceof NotFoundError) {
      notFound();
    }
    throw err;
  }

  const definitionStatus =
    spec.definitionItems.some((item) => item.status === "pending")
      ? "draft"
      : "defined";

  const filteredItems = spec.definitionItems.filter((item) => {
    if (type && item.type !== type) return false;
    if (source && item.source !== source) return false;
    return true;
  });

  return (
    <SpecDetailContent
      spec={spec}
      definitionStatus={definitionStatus}
      items={filteredItems}
      currentFilters={{
        type: type || "",
        source: source || "",
      }}
      message={query.message || null}
    />
  );
}