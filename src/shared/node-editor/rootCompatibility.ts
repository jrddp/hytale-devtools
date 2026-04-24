import {
  getComponentReferenceSlotOccupancy,
  isComponentReferenceNodeTemplate,
} from "./componentReferences";
import {
  SELF_OUTPUT_PIN_LOCAL_ID,
  templateHasCompatibleInput,
  templateHasCompatibleOutput,
} from "./pinUtils";
import { INPUT_HANDLE_ID } from "./sharedConstants";
import type {
  NodeEditorWorkspaceContext,
  NodeTemplate,
} from "./workspaceTypes";
import { getDefaultTemplateForTemplateOrVariantId, getVariantKind } from "./variantUtils";

export type RootCompatibilityWorkspaceContext = Pick<
  NodeEditorWorkspaceContext,
  "rootTemplateOrVariantId" | "nodeTemplatesById" | "variantKindsById" | "connectionTypesById"
>;

export function getValidTemplatesForTemplateOrVariantId(
  workspaceContext: Pick<
    NodeEditorWorkspaceContext,
    "nodeTemplatesById" | "variantKindsById"
  > | undefined,
  templateOrVariantId: string | undefined,
): NodeTemplate[] {
  if (!workspaceContext || !templateOrVariantId) {
    return [];
  }

  const directTemplate = workspaceContext.nodeTemplatesById[templateOrVariantId];
  if (directTemplate) {
    return [directTemplate];
  }

  const variantKind = getVariantKind(workspaceContext.variantKindsById, templateOrVariantId);
  if (!variantKind) {
    return [];
  }

  const templateIds = new Set<string>();
  if (variantKind.DefaultTemplateId) {
    templateIds.add(variantKind.DefaultTemplateId);
  }
  for (const templateId of Object.values(variantKind.Variants)) {
    templateIds.add(templateId);
  }

  return Array.from(templateIds)
    .map(templateId => workspaceContext.nodeTemplatesById[templateId])
    .filter((template): template is NodeTemplate => template !== undefined);
}

export function getRootTemplate(
  workspaceContext: RootCompatibilityWorkspaceContext,
): NodeTemplate | undefined {
  return getDefaultTemplateForTemplateOrVariantId(
    workspaceContext,
    workspaceContext.rootTemplateOrVariantId,
  );
}

export function getRootSelfConnectionType(
  workspaceContext: RootCompatibilityWorkspaceContext,
): string | undefined {
  const rootTemplate = getRootTemplate(workspaceContext);
  if (!rootTemplate) {
    return undefined;
  }

  return (
    rootTemplate.inputPins.find(pin => pin.localId === "Input" || pin.schemaKey === INPUT_HANDLE_ID)?.connectionType ??
    rootTemplate.outputPins.find(
      pin => pin.localId === SELF_OUTPUT_PIN_LOCAL_ID || pin.schemaKey === SELF_OUTPUT_PIN_LOCAL_ID,
    )?.connectionType
  );
}

export function findCompatibleRootComponentReferenceTemplate(
  workspaceContext: RootCompatibilityWorkspaceContext,
): NodeTemplate | undefined {
  const rootConnectionType = getRootSelfConnectionType(workspaceContext);
  if (!rootConnectionType) {
    return undefined;
  }

  const compatibleTemplates = Object.values(workspaceContext.nodeTemplatesById).filter(template =>
    isRootCompatibleComponentReferenceTemplate(template, workspaceContext, rootConnectionType),
  );

  return compatibleTemplates.length === 1 ? compatibleTemplates[0] : undefined;
}

export function isRootCompatibleComponentReferenceTemplate(
  template: NodeTemplate,
  workspaceContext: RootCompatibilityWorkspaceContext,
  rootConnectionType: string | undefined = getRootSelfConnectionType(workspaceContext),
): boolean {
  if (!rootConnectionType) {
    return false;
  }

  if (!isComponentReferenceNodeTemplate(template)) {
    return false;
  }

  if (getComponentReferenceSlotOccupancy(template) !== "normal-item") {
    return false;
  }

  return (
    templateHasCompatibleInput(template, rootConnectionType, workspaceContext.connectionTypesById) ||
    templateHasCompatibleOutput(template, rootConnectionType, workspaceContext.connectionTypesById)
  );
}

export function isTemplateCompatibleWithWorkspaceRoot(
  template: NodeTemplate | undefined,
  workspaceContext: RootCompatibilityWorkspaceContext | undefined,
): boolean {
  if (!template || !workspaceContext) {
    return false;
  }

  const rootTemplateIds = new Set(
    getValidTemplatesForTemplateOrVariantId(
      workspaceContext,
      workspaceContext.rootTemplateOrVariantId,
    ).map(rootTemplate => rootTemplate.templateId),
  );

  return (
    rootTemplateIds.has(template.templateId) ||
    isRootCompatibleComponentReferenceTemplate(template, workspaceContext)
  );
}

export function canNodeBeSetAsWorkspaceRoot({
  nodeId,
  currentRootNodeId,
  nodeType,
  template,
  workspaceContext,
}: {
  nodeId: string;
  currentRootNodeId?: string;
  nodeType: string | undefined;
  template: NodeTemplate | undefined;
  workspaceContext: RootCompatibilityWorkspaceContext | undefined;
}): boolean {
  if (nodeId === currentRootNodeId) {
    return false;
  }

  if (nodeType !== "datanode") {
    return false;
  }

  return isTemplateCompatibleWithWorkspaceRoot(template, workspaceContext);
}
