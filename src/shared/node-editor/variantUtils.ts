import type { NodeEditorWorkspaceContext, NodeTemplate, VariantKindDefinition } from "./workspaceTypes";

export function getVariantKind(
  variantKindsById: Record<string, VariantKindDefinition>,
  templateOrVariantId: string | null | undefined,
): VariantKindDefinition | undefined {
  return templateOrVariantId ? variantKindsById[templateOrVariantId] : undefined;
}

export function getDefaultTemplateIdForTemplateOrVariantId(
  nodeTemplatesById: Record<string, NodeTemplate>,
  variantKindsById: Record<string, VariantKindDefinition>,
  templateOrVariantId: string | null | undefined,
): string | undefined {
  if (!templateOrVariantId) {
    return undefined;
  }

  if (nodeTemplatesById[templateOrVariantId]) {
    return templateOrVariantId;
  }

  return getVariantKind(variantKindsById, templateOrVariantId)?.DefaultTemplateId;
}

export function getDefaultTemplateForTemplateOrVariantId(
  workspaceContext: Pick<NodeEditorWorkspaceContext, "nodeTemplatesById" | "variantKindsById">,
  templateOrVariantId: string | null | undefined,
): NodeTemplate | undefined {
  const templateId = getDefaultTemplateIdForTemplateOrVariantId(
    workspaceContext.nodeTemplatesById,
    workspaceContext.variantKindsById,
    templateOrVariantId,
  );
  return templateId ? workspaceContext.nodeTemplatesById[templateId] : undefined;
}
