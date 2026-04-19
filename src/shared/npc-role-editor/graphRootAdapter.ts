import { cloneJsonLike } from "../jsonClone";
import { resolveChildPin } from "../node-editor/childSlotUtils";
import { INPUT_HANDLE_ID } from "../node-editor/sharedConstants";
import type {
  GraphRootAdaptationResult,
  NodeChildSchema,
  NodeEditorWorkspaceContext,
  NodeTemplate,
} from "../node-editor/workspaceTypes";
import type { AssetDocumentShape } from "../node-editor/assetTypes";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getRootTemplate(workspaceContext: NodeEditorWorkspaceContext): NodeTemplate | undefined {
  return workspaceContext.nodeTemplatesById[workspaceContext.rootTemplateOrVariantId];
}

function getRootSerializationChildSchema(
  workspaceContext: NodeEditorWorkspaceContext,
): NodeChildSchema | undefined {
  const rootTemplate = getRootTemplate(workspaceContext);
  if (!rootTemplate) {
    return undefined;
  }

  const rootChildSchemas = Object.values(rootTemplate.childSchemas).filter(
    childSchema => childSchema.serializationType === "root",
  );
  if (rootChildSchemas.length <= 1) {
    return rootChildSchemas[0];
  }

  throw new Error(
    `Root template ${rootTemplate.templateId} defines multiple root-serialized schema entries.`,
  );
}

function getRootSerializationDefaultValue(workspaceContext: NodeEditorWorkspaceContext): unknown {
  const rootTemplate = getRootTemplate(workspaceContext);
  const rootChildSchema = getRootSerializationChildSchema(workspaceContext);
  if (!rootTemplate || !rootChildSchema) {
    return {};
  }

  const resolvedChildPin = resolveChildPin(rootTemplate, rootChildSchema.schemaKey);
  switch (resolvedChildPin?.pin.multiplicity) {
    case "multiple":
      return [];
    case "map":
      return {};
    default:
      return {};
  }
}

function cloneRootMetadata(
  preservedData: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!preservedData) {
    return undefined;
  }

  const clonedEntries = Object.entries(preservedData)
    .filter(([key]) => key.startsWith("$"))
    .map(([key, value]) => [key, cloneJsonLike(value)]);
  return clonedEntries.length > 0 ? Object.fromEntries(clonedEntries) : undefined;
}

export function adaptGraphHostValueToDocumentRoot(
  value: unknown,
  workspaceContext: NodeEditorWorkspaceContext,
  preservedData?: Record<string, unknown>,
): AssetDocumentShape {
  const rootChildSchema = getRootSerializationChildSchema(workspaceContext);
  if (!rootChildSchema) {
    if (!isObject(value)) {
      return {};
    }
    return cloneJsonLike(value) as AssetDocumentShape;
  }

  const rootValue = cloneJsonLike(
    value === undefined ? getRootSerializationDefaultValue(workspaceContext) : value,
  );
  return {
    ...(cloneRootMetadata(preservedData) ?? {}),
    [rootChildSchema.schemaKey]: rootValue,
  } as AssetDocumentShape;
}

export function adaptGraphDocumentRootToHostValue(
  documentRoot: AssetDocumentShape,
  workspaceContext: NodeEditorWorkspaceContext,
): GraphRootAdaptationResult {
  const rootChildSchema = getRootSerializationChildSchema(workspaceContext);
  if (!rootChildSchema) {
    return {
      value: cloneJsonLike(documentRoot),
    };
  }

  const preservedDataEntries = Object.entries(documentRoot)
    .filter(([key]) => key.startsWith("$"))
    .map(([key, value]) => [key, cloneJsonLike(value)]);

  return {
    value: cloneJsonLike(
      documentRoot[rootChildSchema.schemaKey] ?? getRootSerializationDefaultValue(workspaceContext),
    ),
    preservedData:
      preservedDataEntries.length > 0 ? Object.fromEntries(preservedDataEntries) : undefined,
  };
}
