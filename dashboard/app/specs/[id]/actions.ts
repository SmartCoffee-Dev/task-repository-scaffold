"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DefinitionResponseRepository } from "@/lib/repositories/definition-response-repository";
import { resolveClarification } from "@/lib/use-cases/resolve-clarification";
import { decideImpact } from "@/lib/use-cases/decide-impact";

function buildRedirectPath(specId: number, message: string, filters?: { type?: string; source?: string }) {
  const params = new URLSearchParams();
  params.set("message", message);
  if (filters?.type) params.set("type", filters.type);
  if (filters?.source) params.set("source", filters.source);
  return `/specs/${specId}?${params.toString()}`;
}

export async function resolveClarificationAction(formData: FormData) {
  const specId = Number(formData.get("specId"));
  const itemId = Number(formData.get("itemId"));
  const content = String(formData.get("content") || "");
  const currentType = String(formData.get("currentType") || "");
  const currentSource = String(formData.get("currentSource") || "");

  if (!content.trim()) {
    return redirect(
      buildRedirectPath(specId, "error:La respuesta no puede estar vacía", {
        type: currentType,
        source: currentSource,
      })
    );
  }

  try {
    const responseRepo = new DefinitionResponseRepository(prisma);
    await resolveClarification(responseRepo, { itemId, content });
    revalidatePath(`/specs/${specId}`);
  } catch {
    return redirect(
      buildRedirectPath(specId, "error:No se pudo registrar la respuesta", {
        type: currentType,
        source: currentSource,
      })
    );
  }

  return redirect(
    buildRedirectPath(specId, "success:Respuesta registrada correctamente", {
      type: currentType,
      source: currentSource,
    })
  );
}

export async function decideImpactAction(formData: FormData) {
  const specId = Number(formData.get("specId"));
  const itemId = Number(formData.get("itemId"));
  const decision = String(formData.get("decision") || "");
  const observation = String(formData.get("observation") || "");
  const currentType = String(formData.get("currentType") || "");
  const currentSource = String(formData.get("currentSource") || "");

  if (!["accept", "reject"].includes(decision)) {
    return redirect(
      buildRedirectPath(specId, "error:Decisión inválida", {
        type: currentType,
        source: currentSource,
      })
    );
  }

  try {
    const responseRepo = new DefinitionResponseRepository(prisma);
    await decideImpact(responseRepo, {
      itemId,
      decision: decision as "accept" | "reject",
      observation: observation || undefined,
    });
    revalidatePath(`/specs/${specId}`);
  } catch {
    return redirect(
      buildRedirectPath(specId, "error:No se pudo registrar la decisión", {
        type: currentType,
        source: currentSource,
      })
    );
  }

  const label = decision === "accept" ? "aceptado" : "rechazado";
  return redirect(
    buildRedirectPath(specId, `success:Ítem ${label} correctamente`, {
      type: currentType,
      source: currentSource,
    })
  );
}