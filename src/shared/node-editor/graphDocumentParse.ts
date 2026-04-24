import type { AssetDocumentShape, NodeAssetJson } from "./assetTypes";
import type {
  CommentGraphNode,
  DataGraphNode,
  GroupGraphNode,
  LinkGraphNode,
  NodeEditorGraphDocument,
  NodeEditorGraphEdge,
  NodeEditorGraphNode,
  NodeEditorGraphNodeData,
  RawJsonGraphNode,
} from "./graphTypes";
import { getResolvedChildSlots } from "./childSlotUtils";
import { getSiblingSerializedChildSlot } from "./siblingSerialization";
import {
  allowsComponentReferences,
  getComponentReferenceSlotOccupancy,
  isComponentReferenceNodeTemplate,
} from "./componentReferences";
import {
  findCompatibleRootComponentReferenceTemplate,
} from "./rootCompatibility";
import {
  GENERIC_CONNECTION_TYPE,
  getCompatibleInputHandleId,
  getCompatibleOutputHandleId,
  templateHasCompatibleInput,
  templateHasCompatibleOutput,
} from "./pinUtils";
import { INPUT_HANDLE_ID } from "./sharedConstants";
import type { NodeEditorWorkspaceContext, NodePin, NodeTemplate } from "./workspaceTypes";
import {
  getVariantKind,
} from "./variantUtils";

const DEFAULT_COMMENT_WIDTH = 200;
const DEFAULT_COMMENT_HEIGHT = 100;
const DEFAULT_GROUP_WIDTH = 520;
const DEFAULT_GROUP_HEIGHT = 320;
const DEFAULT_RAW_JSON_TEXT = "{\n\n}";
const LINK_OUTPUT_HANDLE_ID = "output";
const LINK_DEFAULT_OUTPUT_LABEL = "Children";
const RAW_JSON_NODE_COLOR = "var(--vscode-focusBorder)";
const NON_SEMANTIC_INLINE_METADATA_KEYS = new Set(["$Position", "$Title"]);

const GROUP_TEMPLATE_ID = "$Group";
const COMMENT_TEMPLATE_ID = "$Comment";
const RAW_JSON_TEMPLATE_ID = "$RawJson";
const LINK_TEMPLATE_ID = "$Link";
const GENERIC_CATEGORY = "Generic";
const UUID_SUFFIX_RE =
  /^(.*)-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function createNodeId(templateId: string): string {
  return `${templateId}-${crypto.randomUUID()}`;
}

function createSyntheticSiblingNodeId(templateId: string, parentNodeId: string, schemaKey: string): string {
  return `${templateId}__sibling__${parentNodeId}__${schemaKey}`;
}

function splitNodeIdSuffix(nodeId: string): { baseId: string; hasUuidSuffix: boolean } {
  const match = nodeId.match(UUID_SUFFIX_RE);
  if (!match) {
    return {
      baseId: nodeId,
      hasUuidSuffix: false,
    };
  }

  return {
    baseId: match[1],
    hasUuidSuffix: true,
  };
}

function getDefaultInputPin(data?: Partial<NodePin>): NodePin {
  return {
    ...data,
    schemaKey: INPUT_HANDLE_ID,
    connectionType: GENERIC_CONNECTION_TYPE,
    localId: "Input",
    label: "Input",
    multiplicity: "single",
  };
}

const GROUP_TEMPLATE: NodeTemplate = {
  templateId: GROUP_TEMPLATE_ID,
  defaultTitle: "Add Group",
  childSchemas: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

const COMMENT_TEMPLATE: NodeTemplate = {
  templateId: COMMENT_TEMPLATE_ID,
  defaultTitle: "Add Comment",
  childSchemas: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

const LINK_TEMPLATE: NodeTemplate = {
  templateId: LINK_TEMPLATE_ID,
  defaultTitle: "Add Link",
  childSchemas: {},
  fieldsBySchemaKey: {},
  inputPins: [getDefaultInputPin()],
  outputPins: [
    {
      schemaKey: LINK_OUTPUT_HANDLE_ID,
      connectionType: GENERIC_CONNECTION_TYPE,
      localId: LINK_OUTPUT_HANDLE_ID,
      label: LINK_DEFAULT_OUTPUT_LABEL,
      multiplicity: "single",
    },
  ],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

const RAW_JSON_TEMPLATE: NodeTemplate = {
  templateId: RAW_JSON_TEMPLATE_ID,
  defaultTitle: "Raw JSON Node",
  childSchemas: {},
  fieldsBySchemaKey: {},
  inputPins: [getDefaultInputPin({ color: RAW_JSON_NODE_COLOR })],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

function cloneTemplate(template: NodeTemplate): NodeTemplate {
  return structuredClone(template);
}

function createGraphNodeFromTemplate(
  template: NodeTemplate,
  position: { x: number; y: number },
  id?: string,
  data?: Partial<NodeEditorGraphNodeData>,
): NodeEditorGraphNode {
  const baseData = cloneTemplate(template);

  switch (template.templateId) {
    case GROUP_TEMPLATE_ID:
      return {
        id: id ?? createNodeId("Group"),
        type: "groupnode",
        position: { ...position },
        width: (data?.width as number) ?? DEFAULT_GROUP_WIDTH,
        height: (data?.height as number) ?? DEFAULT_GROUP_HEIGHT,
        data: { ...baseData, ...data },
      } as GroupGraphNode;
    case COMMENT_TEMPLATE_ID:
      return {
        id: id ?? createNodeId("Comment"),
        type: "comment",
        position: { ...position },
        width: (data?.width as number) ?? DEFAULT_COMMENT_WIDTH,
        height: (data?.height as number) ?? DEFAULT_COMMENT_HEIGHT,
        data: { ...baseData, ...data },
      } as CommentGraphNode;
    case LINK_TEMPLATE_ID:
      return {
        id: id ?? crypto.randomUUID(),
        type: "link",
        position: { ...position },
        data: { ...baseData, ...data },
      } as LinkGraphNode;
    case RAW_JSON_TEMPLATE_ID:
      return {
        id: id ?? createNodeId("Generic"),
        type: "rawjson",
        position: { ...position },
        data: {
          ...baseData,
          ...data,
          jsonString: (data?.jsonString as string) ?? DEFAULT_RAW_JSON_TEXT,
        },
      } as RawJsonGraphNode;
    default:
      return {
        id: id ?? createNodeId(template.templateId),
        type: "datanode",
        position: { ...position },
        data: { ...baseData, ...data },
      } as DataGraphNode;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isComputeReference(value: unknown): value is { Compute: string } {
  return (
    isObject(value) &&
    Object.keys(value).length === 1 &&
    typeof value.Compute === "string"
  );
}

function isComponentReferenceWrapper(
  value: unknown,
): value is NodeAssetJson & { Reference: string | { Compute: string } } {
  return (
    isObject(value) &&
    (typeof value.Reference === "string" || isComputeReference(value.Reference))
  );
}

function findCompatibleComponentReferenceTemplate(
  workspaceContext: NodeEditorWorkspaceContext,
  connectionType: string,
  occupancy: "normal-item" | "whole-slot",
  side: "input" | "output",
): NodeTemplate | undefined {
  const compatibleTemplates = Object.values(workspaceContext.nodeTemplatesById).filter(template => {
    if (!isComponentReferenceNodeTemplate(template)) {
      return false;
    }

    if (getComponentReferenceSlotOccupancy(template) !== occupancy) {
      return false;
    }

    return side === "output"
      ? templateHasCompatibleInput(
          template,
          connectionType,
          workspaceContext.connectionTypesById,
        )
      : templateHasCompatibleOutput(
          template,
          connectionType,
          workspaceContext.connectionTypesById,
        );
  });

  return compatibleTemplates.length === 1 ? compatibleTemplates[0] : undefined;
}

function normalizeNodeDefinitionForReuse(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeNodeDefinitionForReuse);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !NON_SEMANTIC_INLINE_METADATA_KEYS.has(key))
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([key, nestedValue]) => [key, normalizeNodeDefinitionForReuse(nestedValue)]),
    );
  }

  return value;
}

export function parseAssetDocumentToGraphDocument(
  documentRoot: AssetDocumentShape,
  workspaceContext: NodeEditorWorkspaceContext,
): NodeEditorGraphDocument {
  const { rootTemplateOrVariantId, variantKindsById, nodeTemplatesById } = workspaceContext;

  if (!isObject(documentRoot)) {
    throw new Error("Document must be a JSON object.");
  }

  const nodes: NodeEditorGraphNode[] = [];
  const edges: NodeEditorGraphEdge[] = [];
  const nodesById = new Map<string, NodeEditorGraphNode>();
  const usedNodeIds = new Set<string>();
  const canonicalNodeIdsByRawId = new Map<string, string[]>();
  const normalizedDefinitionsByCanonicalNodeId = new Map<string, string>();
  const outgoingConnections = new Map<string, Map<string, NodeEditorGraphEdge[]>>();

  const addNode = (node: NodeEditorGraphNode) => {
    nodes.push(node);
    nodesById.set(node.id, node);
    usedNodeIds.add(node.id);
  };

  const registerRawNodeId = (rawNodeId: string | undefined, canonicalNodeId: string) => {
    if (!rawNodeId) {
      return;
    }
    if (!canonicalNodeIdsByRawId.has(rawNodeId)) {
      canonicalNodeIdsByRawId.set(rawNodeId, []);
    }
    canonicalNodeIdsByRawId.get(rawNodeId)!.push(canonicalNodeId);
  };

  const createUniqueParsedNodeId = (baseId: string): string => {
    let parsedNodeId = createNodeId(baseId);
    while (usedNodeIds.has(parsedNodeId)) {
      parsedNodeId = createNodeId(baseId);
    }
    return parsedNodeId;
  };

  const normalizeParsedNodeId = (rawNodeId: string | undefined, baseId: string): string => {
    if (!rawNodeId) {
      return createUniqueParsedNodeId(baseId);
    }

    const { baseId: rawBaseId, hasUuidSuffix } = splitNodeIdSuffix(rawNodeId);
    if (hasUuidSuffix && !usedNodeIds.has(rawNodeId)) {
      registerRawNodeId(rawNodeId, rawNodeId);
      return rawNodeId;
    }

    const normalizedNodeId = createUniqueParsedNodeId(rawBaseId || baseId);
    registerRawNodeId(rawNodeId, normalizedNodeId);
    return normalizedNodeId;
  };

  const resolveCanonicalNodeId = (nodeId: string): string | undefined => {
    if (nodesById.has(nodeId)) {
      return nodeId;
    }

    const canonicalNodeIds = canonicalNodeIdsByRawId.get(nodeId);
    if (!canonicalNodeIds || canonicalNodeIds.length !== 1) {
      return undefined;
    }

    return canonicalNodeIds[0];
  };

  const addEdge = (
    sourceId: string,
    sourceHandleId: string,
    childId: string,
    targetHandleId: string = INPUT_HANDLE_ID,
  ) => {
    const edge: NodeEditorGraphEdge = {
      id: `${sourceId}:${sourceHandleId}-${childId}`,
      source: sourceId,
      sourceHandle: sourceHandleId,
      target: childId,
      targetHandle: targetHandleId,
    };
    edges.push(edge);

    if (!outgoingConnections.has(sourceId)) {
      outgoingConnections.set(sourceId, new Map());
    }
    if (!outgoingConnections.get(sourceId)!.has(sourceHandleId)) {
      outgoingConnections.get(sourceId)!.set(sourceHandleId, []);
    }
    outgoingConnections.get(sourceId)!.get(sourceHandleId)!.push(edge);
  };

  const documentHasRootNode = Object.keys(documentRoot).some(
    key => key !== "$NodeEditorMetadata" && key !== "$Groups",
  );

  const recursiveParseNodes = (
    localRoot: NodeAssetJson,
    variantOrTemplateId: string | null,
    options?: {
      syntheticSiblingParentNodeId?: string;
      syntheticSiblingSchemaKey?: string;
    },
  ): string => {
    let templateId: string | undefined;
    const rawNodeId = localRoot.$NodeId;
    const rawNodeIdInfo = rawNodeId
      ? splitNodeIdSuffix(rawNodeId)
      : { baseId: "", hasUuidSuffix: false };
    let nodeId: string;
    const position = localRoot.$Position ?? { $x: 0, $y: 0 };
    const variantKind = getVariantKind(variantKindsById, variantOrTemplateId);

    if (rawNodeId && rawNodeIdInfo.hasUuidSuffix && nodesById.has(rawNodeId)) {
      const normalizedDefinition = JSON.stringify(normalizeNodeDefinitionForReuse(localRoot));
      const previousDefinition = normalizedDefinitionsByCanonicalNodeId.get(rawNodeId);
      if (previousDefinition && previousDefinition !== normalizedDefinition) {
        throw new Error(`Conflicting serialized payloads found for reused node id ${rawNodeId}.`);
      }
      return rawNodeId;
    }

    if (variantKind) {
      const hasVariantField = Object.hasOwn(localRoot, variantKind.VariantFieldName);
      const nodeType = localRoot[variantKind.VariantFieldName];
      if (typeof nodeType === "string") {
        templateId = variantKind.Variants[nodeType];
      } else if (!hasVariantField) {
        templateId = variantKind.DefaultTemplateId;
      }
    }

    if (!templateId && variantOrTemplateId && !variantKind) {
      templateId = variantOrTemplateId;
    }
    if (!templateId && rawNodeId) {
      templateId = splitNodeIdSuffix(rawNodeId).baseId;
    }

    const template = templateId ? nodeTemplatesById[templateId] : undefined;
    if (template) {
      if (
        !rawNodeId &&
        options?.syntheticSiblingParentNodeId &&
        options.syntheticSiblingSchemaKey
      ) {
        nodeId = createSyntheticSiblingNodeId(
          template.templateId,
          options.syntheticSiblingParentNodeId,
          options.syntheticSiblingSchemaKey,
        );
      } else {
        nodeId = normalizeParsedNodeId(rawNodeId, template.templateId);
      }

      const clonedTemplateData = cloneTemplate(template);
      const siblingSlot = getSiblingSerializedChildSlot(template);
      const unprocessedData = new Set(
        Object.keys(localRoot).filter(key => {
          if (key.startsWith("$")) {
            return false;
          }

          if (!siblingSlot) {
            return true;
          }

          return (
            Object.hasOwn(clonedTemplateData.fieldsBySchemaKey, key) ||
            Object.hasOwn(template.schemaConstants, key) ||
            (Object.hasOwn(template.childSchemas, key) &&
              key !== siblingSlot.childSchema.schemaKey)
          );
        }),
      );
      const unparsedMetadata: Record<string, unknown> = {};
      const siblingChildValue =
        siblingSlot === undefined
          ? undefined
          : Object.fromEntries(
              Object.entries(localRoot).filter(([key]) => {
                if (key.startsWith("$")) {
                  return false;
                }

                if (Object.hasOwn(clonedTemplateData.fieldsBySchemaKey, key)) {
                  return false;
                }

                if (Object.hasOwn(template.schemaConstants, key)) {
                  return false;
                }

                return true;
              }),
            );

      for (const slot of getResolvedChildSlots(template)) {
        const schemaKey = slot.childSchema.schemaKey;
        if (slot.childSchema.serializationType !== "sibling") {
          unprocessedData.delete(schemaKey);
        }

        const parseChildNode = (
          childValue: unknown,
          occupancy: "normal-item" | "whole-slot" = "normal-item",
        ) => {
          const referenceTemplate =
            allowsComponentReferences(slot.childSchema) && isComponentReferenceWrapper(childValue)
              ? findCompatibleComponentReferenceTemplate(
                  workspaceContext,
                  slot.pin.connectionType,
                  occupancy,
                  slot.side,
                )
              : undefined;

          return recursiveParseNodes(
            childValue as NodeAssetJson,
            referenceTemplate?.templateId ?? slot.childSchema.targetTemplateOrVariantId,
            slot.childSchema.serializationType === "sibling"
              ? {
                  syntheticSiblingParentNodeId: nodeId,
                  syntheticSiblingSchemaKey: slot.childSchema.schemaKey,
                }
              : undefined,
          );
        };

        const connectParsedChild = (childId: string) => {
          const childNode = nodesById.get(childId);
          if (slot.side === "output") {
            addEdge(
              nodeId,
              slot.pin.schemaKey,
              childId,
              childNode?.type === "datanode"
                ? (getCompatibleInputHandleId(
                    childNode.data,
                    slot.pin.connectionType,
                    workspaceContext.connectionTypesById,
                  ) ?? INPUT_HANDLE_ID)
                : INPUT_HANDLE_ID,
            );
            return;
          }

          addEdge(
            childId,
            childNode?.type === "datanode"
              ? (getCompatibleOutputHandleId(
                  childNode.data,
                  slot.pin.connectionType,
                  workspaceContext.connectionTypesById,
                ) ?? INPUT_HANDLE_ID)
              : INPUT_HANDLE_ID,
            nodeId,
            slot.pin.schemaKey,
          );
        };

        switch (slot.pin.multiplicity) {
          case "single":
            if (slot.childSchema.serializationType === "sibling") {
              if (siblingChildValue && Object.keys(siblingChildValue).length > 0) {
                const childId = parseChildNode(siblingChildValue);
                connectParsedChild(childId);
              }
            } else if (localRoot[schemaKey] !== undefined) {
              const childId = parseChildNode(localRoot[schemaKey]);
              connectParsedChild(childId);
            }
            break;
          case "multiple":
            if (Array.isArray(localRoot[schemaKey])) {
              for (let index = 0; index < localRoot[schemaKey].length; index++) {
                const childId = parseChildNode(localRoot[schemaKey][index]);
                const childNode = nodesById.get(childId)!;
                childNode.data.inputConnectionIndex = index;
                connectParsedChild(childId);
              }
            } else if (
              allowsComponentReferences(slot.childSchema) &&
              isComponentReferenceWrapper(localRoot[schemaKey])
            ) {
              const wholeSlotTemplate = findCompatibleComponentReferenceTemplate(
                workspaceContext,
                slot.pin.connectionType,
                "whole-slot",
                slot.side,
              );
              if (wholeSlotTemplate) {
                const childId = recursiveParseNodes(
                  localRoot[schemaKey] as NodeAssetJson,
                  wholeSlotTemplate.templateId,
                );
                connectParsedChild(childId);
              }
            }
            break;
          case "map":
            if (typeof localRoot[schemaKey] === "object") {
              let index = 0;
              for (const value of Object.values(localRoot[schemaKey] as Record<string, unknown>)) {
                const childId = recursiveParseNodes(
                  value as NodeAssetJson,
                  slot.childSchema.targetTemplateOrVariantId,
                );
                const childNode = nodesById.get(childId)!;
                childNode.data.inputConnectionIndex = index;
                connectParsedChild(childId);
                index += 1;
              }
            }
            break;
        }
      }

      for (const key of Object.keys(clonedTemplateData.fieldsBySchemaKey)) {
        unprocessedData.delete(key);
        const hasExplicitField = Object.hasOwn(localRoot, key);
        const value = localRoot[key];
        if (hasExplicitField) {
          clonedTemplateData.fieldsBySchemaKey[key].value = value;
          clonedTemplateData.fieldsBySchemaKey[key].isImplicit = false;
          clonedTemplateData.fieldsBySchemaKey[key].isSet = true;
        }
      }

      for (const key of unprocessedData) {
        if (Object.hasOwn(template.schemaConstants, key)) {
          continue;
        }
        unparsedMetadata[key] = localRoot[key];
      }

      addNode(
        createGraphNodeFromTemplate(
          clonedTemplateData,
          { x: position.$x, y: position.$y },
          nodeId,
          {
            unparsedMetadata,
            comment: localRoot.$Comment,
            titleOverride: typeof localRoot.$Title === "string" ? localRoot.$Title : undefined,
          },
        ),
      );
      if (rawNodeId && rawNodeIdInfo.hasUuidSuffix) {
        normalizedDefinitionsByCanonicalNodeId.set(
          nodeId,
          JSON.stringify(normalizeNodeDefinitionForReuse(localRoot)),
        );
      }
    } else {
      if (
        !rawNodeId &&
        options?.syntheticSiblingParentNodeId &&
        options.syntheticSiblingSchemaKey
      ) {
        nodeId = createSyntheticSiblingNodeId(
          "Generic",
          options.syntheticSiblingParentNodeId,
          options.syntheticSiblingSchemaKey,
        );
      } else {
        nodeId = normalizeParsedNodeId(rawNodeId, "Generic");
      }

      const data: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(localRoot)) {
        if (!key.startsWith("$")) {
          data[key] = value;
        }
      }

      addNode(
        createGraphNodeFromTemplate(
          RAW_JSON_TEMPLATE,
          { x: position.$x, y: position.$y },
          nodeId,
          {
            jsonString: Object.keys(data).length > 0 ? JSON.stringify(data, null, "\t") : DEFAULT_RAW_JSON_TEXT,
            titleOverride: typeof localRoot.$Title === "string" ? localRoot.$Title : undefined,
          },
        ),
      );
      if (rawNodeId && rawNodeIdInfo.hasUuidSuffix) {
        normalizedDefinitionsByCanonicalNodeId.set(
          nodeId,
          JSON.stringify(normalizeNodeDefinitionForReuse(localRoot)),
        );
      }
    }

    return nodeId;
  };

  const rootNodeId = documentHasRootNode
    ? recursiveParseNodes(
        documentRoot,
        isComponentReferenceWrapper(documentRoot)
          ? (findCompatibleRootComponentReferenceTemplate(workspaceContext)?.templateId ?? rootTemplateOrVariantId)
          : rootTemplateOrVariantId,
      )
    : undefined;

  const nodeEditorMetadata = documentRoot.$NodeEditorMetadata;
  if (nodeEditorMetadata) {
    for (const nodeJson of nodeEditorMetadata.$FloatingNodes ?? []) {
      recursiveParseNodes(nodeJson, null);
    }

    for (const [nodeId, info] of Object.entries(nodeEditorMetadata.$Nodes ?? {})) {
      const resolvedNodeId = resolveCanonicalNodeId(nodeId);
      const node = resolvedNodeId ? nodesById.get(resolvedNodeId) : undefined;
      if (!node) {
        continue;
      }
      node.position.x = info.$Position.$x;
      node.position.y = info.$Position.$y;
      node.data.titleOverride = info.$Title;
    }

    for (const [linkId, linkData] of Object.entries(nodeEditorMetadata.$Links ?? {})) {
      const normalizedLinkId = normalizeParsedNodeId(linkId, LINK_TEMPLATE_ID);
      addNode(
        createGraphNodeFromTemplate(
          LINK_TEMPLATE,
          { x: linkData.$Position.$x, y: linkData.$Position.$y },
          normalizedLinkId,
        ),
      );

      const sourcePin = linkData.sourceEndpoint;
      const targetPins = linkData.outputConnections;
      if (sourcePin && targetPins) {
        const [rawSourceNodeId, sourcePinId] = sourcePin.split(":");
        const sourceNodeId = resolveCanonicalNodeId(rawSourceNodeId);
        if (!sourceNodeId) {
          continue;
        }
        const sourceNode = nodesById.get(sourceNodeId) as DataGraphNode | undefined;
        if (!sourceNode) {
          continue;
        }
        const sourceHandleId =
          sourceNode.data.outputPins.find(pin => pin.localId === sourcePinId)?.schemaKey ??
          LINK_OUTPUT_HANDLE_ID;

        for (const targetPin of targetPins) {
          const [rawTargetNodeId] = targetPin.split(":");
          const targetNodeId = resolveCanonicalNodeId(rawTargetNodeId);
          if (!targetNodeId) {
            continue;
          }
          const targetNode = nodesById.get(targetNodeId);
          const linkTargetHandleId =
            targetNode?.type === "datanode"
              ? (getCompatibleInputHandleId(
                  targetNode.data,
                  LINK_TEMPLATE.outputPins[0].connectionType,
                  workspaceContext.connectionTypesById,
                ) ?? INPUT_HANDLE_ID)
              : INPUT_HANDLE_ID;
          for (const edge of outgoingConnections.get(sourceNodeId)?.get(sourceHandleId) ?? []) {
            if (edge.target === targetNodeId && edge.targetHandle === linkTargetHandleId) {
              edge.target = normalizedLinkId;
            }
          }
          addEdge(normalizedLinkId, LINK_OUTPUT_HANDLE_ID, targetNodeId, linkTargetHandleId);
        }
      }
    }

    for (const groupJson of nodeEditorMetadata.$Groups ?? []) {
      const normalizedGroupId = normalizeParsedNodeId(groupJson.$NodeId, "Group");
      addNode(
        createGraphNodeFromTemplate(
          GROUP_TEMPLATE,
          { x: groupJson.$Position.$x, y: groupJson.$Position.$y },
          normalizedGroupId,
          {
            titleOverride: groupJson.$name,
            width: groupJson.$width,
            height: groupJson.$height,
          },
        ) as GroupGraphNode,
      );
    }

    for (const commentJson of nodeEditorMetadata.$Comments ?? []) {
      const normalizedCommentId = normalizeParsedNodeId(commentJson.$NodeId, "Comment");
      addNode(
        createGraphNodeFromTemplate(
          COMMENT_TEMPLATE,
          { x: commentJson.$Position.$x, y: commentJson.$Position.$y },
          normalizedCommentId,
          {
            width: commentJson.$width,
            height: commentJson.$height,
            titleOverride: commentJson.$name,
            comment: commentJson.$text,
            fontSize: commentJson.$fontSize,
          },
        ),
      );
    }
  }

  for (const groupJson of documentRoot.$Groups ?? []) {
    const normalizedGroupId = normalizeParsedNodeId(groupJson.$NodeId, "Group");
    addNode(
      createGraphNodeFromTemplate(
        GROUP_TEMPLATE,
        { x: groupJson.$Position.$x, y: groupJson.$Position.$y },
        normalizedGroupId,
        {
          titleOverride: groupJson.$name,
          width: groupJson.$width,
          height: groupJson.$height,
        },
      ) as GroupGraphNode,
    );
  }

  return {
    workspaceId:
      nodeEditorMetadata?.$WorkspaceID ??
      (typeof documentRoot.$WorkspaceID === "string" ? documentRoot.$WorkspaceID : undefined) ??
      workspaceContext.rootMenuName,
    rootNodeId,
    nodes,
    edges,
  };
}
