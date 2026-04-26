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

function getTemplateSelfConnectionType(template: NodeTemplate): string | undefined {
  return (
    template.inputPins.find(pin => pin.localId === "Input" || pin.schemaKey === INPUT_HANDLE_ID)?.connectionType ??
    template.outputPins.find(
      pin =>
        pin.multiplicity !== "multiple" &&
        (pin.localId === SELF_OUTPUT_PIN_LOCAL_ID || pin.schemaKey === SELF_OUTPUT_PIN_LOCAL_ID),
    )?.connectionType
  );
}

export function getRootSelfConnectionTypes(
  workspaceContext: RootCompatibilityWorkspaceContext,
): string[] {
  const rootTemplates = getValidTemplatesForTemplateOrVariantId(
    workspaceContext,
    workspaceContext.rootTemplateOrVariantId,
  );

  return Array.from(
    new Set(
      rootTemplates
        .map(getTemplateSelfConnectionType)
        .filter((connectionType): connectionType is string => connectionType !== undefined),
    ),
  );
}

export function getRootSelfConnectionType(
  workspaceContext: RootCompatibilityWorkspaceContext,
): string | undefined {
  return getRootSelfConnectionTypes(workspaceContext)[0];
}

export function getCreatableRootTemplates(
  workspaceContext: RootCompatibilityWorkspaceContext,
): NodeTemplate[] {
  const rootTemplates = getValidTemplatesForTemplateOrVariantId(
    workspaceContext,
    workspaceContext.rootTemplateOrVariantId,
  );
  const rootTemplateIds = new Set(rootTemplates.map(template => template.templateId));
  const compatibleReferences = Object.values(workspaceContext.nodeTemplatesById).filter(
    template =>
      !rootTemplateIds.has(template.templateId) &&
      isRootCompatibleComponentReferenceTemplate(template, workspaceContext),
  );

  return [...rootTemplates, ...compatibleReferences];
}

export function findCompatibleRootComponentReferenceTemplate(
  workspaceContext: RootCompatibilityWorkspaceContext,
): NodeTemplate | undefined {
  const rootConnectionTypes = getRootSelfConnectionTypes(workspaceContext);
  if (rootConnectionTypes.length === 0) {
    return undefined;
  }

  const compatibleTemplates = Object.values(workspaceContext.nodeTemplatesById).filter(template =>
    rootConnectionTypes.some(rootConnectionType =>
      isRootCompatibleComponentReferenceTemplate(template, workspaceContext, rootConnectionType),
    ),
  );

  return compatibleTemplates.length === 1 ? compatibleTemplates[0] : undefined;
}

export function isRootCompatibleComponentReferenceTemplate(
  template: NodeTemplate,
  workspaceContext: RootCompatibilityWorkspaceContext,
  rootConnectionType?: string,
): boolean {
  if (!rootConnectionType) {
    return getRootSelfConnectionTypes(workspaceContext).some(connectionType =>
      isRootCompatibleComponentReferenceTemplate(template, workspaceContext, connectionType),
    );
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
