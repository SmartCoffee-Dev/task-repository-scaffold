import type { PrismaClient } from "../../app/generated/prisma/client";

import type {
  Spec,
  SpecWithCounts,
  SpecDetail,
  SpecRevision,
  SpecListFilters,
  DefinitionItemWithResponses,
  DefinitionStatusRow,
} from "../types";

function toSpec(row: {
  id: number;
  title: string;
  slug: string;
  description: string;
  current_revision_id: number | null;
  created_at: string;
  updated_at: string;
}): Spec {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    description: row.description,
    currentRevisionId: row.current_revision_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSpecRevision(row: {
  id: number;
  spec_id: number;
  revision_number: number;
  content: string;
  created_at: string;
}): SpecRevision {
  return {
    id: row.id,
    specId: row.spec_id,
    revisionNumber: row.revision_number,
    content: row.content,
    createdAt: row.created_at,
  };
}

const DEFINITION_STATUS_QUERY = `
SELECT
  s.id AS spec_id,
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM definition_items di
      WHERE di.spec_id = s.id
        AND di.status = 'pending'
    ) THEN 'draft'
    ELSE 'defined'
  END AS definition_status
FROM specs s
`;

export class SpecRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(filters?: SpecListFilters): Promise<SpecWithCounts[]> {
    const specs = await this.prisma.specs.findMany({
      include: {
        _count: {
          select: {
            definitionItems: true,
            tasks: true,
          },
        },
      },
      orderBy: { updated_at: "desc" },
    });

    const statusRows = await this.prisma.$queryRawUnsafe<DefinitionStatusRow[]>(
      DEFINITION_STATUS_QUERY
    );

    const statusMap = new Map(
      statusRows.map((r) => [r.spec_id, r.definition_status])
    );

    let results = await Promise.all(
      specs.map(async (spec) => {
        const pendingItems = await this.prisma.definition_items.count({
          where: { spec_id: spec.id, status: "pending" },
        });

        const pendingTasks = await this.prisma.tasks.count({
          where: { spec_id: spec.id, status: { not: "done" } },
        });

        return {
          ...toSpec(spec),
          pendingItems,
          totalItems: spec._count.definitionItems,
          pendingTasks,
          totalTasks: spec._count.tasks,
        };
      })
    );

    if (filters?.type || filters?.source) {
      const specIdsWithFilteredItems = await this.prisma.definition_items.findMany({
        where: {
          ...(filters.type ? { type: filters.type } : {}),
          ...(filters.source ? { source: filters.source } : {}),
        },
        select: { spec_id: true },
        distinct: ["spec_id"],
      });

      const matchingIds = new Set(
        specIdsWithFilteredItems.map((item) => item.spec_id)
      );
      results = results.filter((spec) => matchingIds.has(spec.id));
    }

    return results;
  }

  async findById(id: number): Promise<SpecDetail | null> {
    const spec = await this.prisma.specs.findUnique({
      where: { id },
      include: {
        currentRevision: true,
        definitionItems: {
          include: {
            responses: {
              orderBy: { created_at: "asc" },
            },
          },
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!spec) return null;

    return {
      ...toSpec(spec),
      currentRevision: spec.currentRevision
        ? toSpecRevision(spec.currentRevision)
        : null,
      definitionItems: spec.definitionItems.map((item) => ({
        id: item.id,
        specId: item.spec_id,
        type: item.type as DefinitionItemWithResponses["type"],
        source: item.source as DefinitionItemWithResponses["source"],
        title: item.title,
        description: item.description,
        question: item.question,
        suggestedResolution: item.suggested_resolution,
        exampleType: item.example_type as DefinitionItemWithResponses["exampleType"],
        fingerprint: item.fingerprint,
        status: item.status as DefinitionItemWithResponses["status"],
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
      })),
    };
  }

  async findBySlug(slug: string): Promise<SpecDetail | null> {
    const spec = await this.prisma.specs.findUnique({
      where: { slug },
      include: {
        currentRevision: true,
        definitionItems: {
          include: {
            responses: {
              orderBy: { created_at: "asc" },
            },
          },
          orderBy: { created_at: "desc" },
        },
      },
    });

    if (!spec) return null;

    return this.findById(spec.id);
  }
}