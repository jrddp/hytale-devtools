import {
  type AssetDocumentShape,
  type GroupJson,
  type NodeAssetJson,
  type NodeEditorMetadata,
} from "./assetTypes";
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
import { INPUT_HANDLE_ID } from "./sharedConstants";
import { type NodeEditorWorkspaceContext, type NodePin, type NodeTemplate } from "./workspaceTypes";

const DEFAULT_COMMENT_WIDTH = 200;
const DEFAULT_COMMENT_HEIGHT = 100;
const DEFAULT_COMMENT_FONT_SIZE = 9;
const DEFAULT_GROUP_WIDTH = 520;
const DEFAULT_GROUP_HEIGHT = 320;
const DEFAULT_RAW_JSON_TEXT = "{\n\n}";
const LINK_OUTPUT_HANDLE_ID = "output";
const LINK_DEFAULT_OUTPUT_LABEL = "Children";
const RAW_JSON_NODE_COLOR = "var(--vscode-focusBorder)";

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
    localId: "Input",
    label: "Input",
    multiplicity: "single",
  };
}

const GROUP_TEMPLATE: NodeTemplate = {
  templateId: GROUP_TEMPLATE_ID,
  defaultTitle: "Add Group",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

const COMMENT_TEMPLATE: NodeTemplate = {
  templateId: COMMENT_TEMPLATE_ID,
  defaultTitle: "Add Comment",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

const LINK_TEMPLATE: NodeTemplate = {
  templateId: LINK_TEMPLATE_ID,
  defaultTitle: "Add Link",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [getDefaultInputPin()],
  outputPins: [
    {
      schemaKey: LINK_OUTPUT_HANDLE_ID,
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
  childTypes: {},
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

function groupNodeFromJson(groupJson: GroupJson): GroupGraphNode {
  return createGraphNodeFromTemplate(
    GROUP_TEMPLATE,
    {
      x: groupJson.$Position.$x,
      y: groupJson.$Position.$y,
    },
    groupJson.$NodeId,
    {
      titleOverride: groupJson.$name,
      width: groupJson.$width,
      height: groupJson.$height,
    },
  ) as GroupGraphNode;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  const addEdge = (sourceId: string, sourceHandleId: string, childId: string) => {
    const edge: NodeEditorGraphEdge = {
      id: `${sourceId}:${sourceHandleId}-${childId}`,
      source: sourceId,
      sourceHandle: sourceHandleId,
      target: childId,
      targetHandle: INPUT_HANDLE_ID,
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
  ): string => {
    let templateId: string | undefined;
    const rawNodeId = localRoot.$NodeId;
    let nodeId: string;
    const position = localRoot.$Position ?? { $x: 0, $y: 0 };
    const variantKind = variantOrTemplateId ? variantKindsById[variantOrTemplateId] : undefined;

    if (variantKind) {
      const nodeType = localRoot[variantKind.VariantFieldName] as string | undefined;
      if (nodeType) {
        templateId = variantKind.Variants[nodeType];
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
      nodeId = normalizeParsedNodeId(rawNodeId, templateId!);

      const clonedTemplateData = cloneTemplate(template);
      const unprocessedData = new Set(Object.keys(localRoot).filter(key => !key.startsWith("$")));
      const unparsedMetadata: Record<string, unknown> = {};

      for (const pin of template.outputPins) {
        const schemaKey = pin.schemaKey;
        unprocessedData.delete(schemaKey);

        switch (pin.multiplicity) {
          case "single":
            if (localRoot[schemaKey] !== undefined) {
              const childId = recursiveParseNodes(
                localRoot[schemaKey] as NodeAssetJson,
                template.childTypes[schemaKey],
              );
              addEdge(nodeId, schemaKey, childId);
            }
            break;
          case "multiple":
            if (Array.isArray(localRoot[schemaKey])) {
              for (let index = 0; index < localRoot[schemaKey].length; index++) {
                const childId = recursiveParseNodes(
                  localRoot[schemaKey][index] as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                nodesById.get(childId)!.data.inputConnectionIndex = index;
                addEdge(nodeId, schemaKey, childId);
              }
            }
            break;
          case "map":
            if (typeof localRoot[schemaKey] === "object") {
              let index = 0;
              for (const value of Object.values(localRoot[schemaKey] as Record<string, unknown>)) {
                const childId = recursiveParseNodes(
                  value as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                nodesById.get(childId)!.data.inputConnectionIndex = index;
                addEdge(nodeId, schemaKey, childId);
                index += 1;
              }
            }
            break;
        }
      }

      for (const key of Object.keys(clonedTemplateData.fieldsBySchemaKey)) {
        unprocessedData.delete(key);
        const value = localRoot[key];
        if (value !== undefined) {
          clonedTemplateData.fieldsBySchemaKey[key].value = value;
        }
      }

      for (const key of unprocessedData) {
        if (template.schemaConstants[key]) {
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
    } else {
      nodeId = normalizeParsedNodeId(rawNodeId, "Generic");

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
    }

    return nodeId;
  };

  const rootNodeId = documentHasRootNode
    ? recursiveParseNodes(documentRoot, rootTemplateOrVariantId)
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
          const sourceNode = sourceNodeId ? (nodesById.get(sourceNodeId) as DataGraphNode | undefined) : undefined;
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
          for (const edge of outgoingConnections.get(sourceNodeId)?.get(sourceHandleId) ?? []) {
            if (edge.target === targetNodeId && edge.targetHandle === INPUT_HANDLE_ID) {
              edge.target = normalizedLinkId;
            }
          }
          addEdge(normalizedLinkId, LINK_OUTPUT_HANDLE_ID, targetNodeId);
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

function getGraphNodeAbsolutePosition(
  node: NodeEditorGraphNode,
  nodesById: Map<string, NodeEditorGraphNode>,
): { x: number; y: number } {
  let x = node.position.x;
  let y = node.position.y;
  let currentParentId = node.parentId;

  while (currentParentId) {
    const parent = nodesById.get(currentParentId);
    if (!parent) {
      break;
    }
    x += parent.position.x;
    y += parent.position.y;
    currentParentId = parent.parentId;
  }

  return { x, y };
}

function getOrderedConnectedNodeIds(
  connectedNodeIds: string[],
  nodesById: Map<string, NodeEditorGraphNode>,
): string[] {
  const absoluteYByNodeId = new Map<string, number>();
  const getAbsoluteY = (nodeId: string) => {
    const cached = absoluteYByNodeId.get(nodeId);
    if (cached !== undefined) {
      return cached;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return Number.POSITIVE_INFINITY;
    }

    const absoluteY = getGraphNodeAbsolutePosition(node, nodesById).y;
    absoluteYByNodeId.set(nodeId, absoluteY);
    return absoluteY;
  };

  return [...connectedNodeIds].sort((leftId, rightId) => {
    return getAbsoluteY(leftId) - getAbsoluteY(rightId);
  });
}

export function serializeGraphDocument(document: NodeEditorGraphDocument): AssetDocumentShape {
  const { rootNodeId, nodes, edges } = document;
  const nodeEditorMetadata: NodeEditorMetadata = {
    $Nodes: {},
    $FloatingNodes: [],
    $Links: {},
    $Groups: [],
    $Comments: [],
    $WorkspaceID: document.workspaceId,
  };

  const outgoingConnections = new Map<string, Map<string, string[]>>();
  const incomingConnections = new Map<string, string>();

  for (const edge of edges) {
    if (!outgoingConnections.has(edge.source)) {
      outgoingConnections.set(edge.source, new Map());
    }
    if (!outgoingConnections.get(edge.source)!.has(edge.sourceHandle)) {
      outgoingConnections.get(edge.source)!.set(edge.sourceHandle, []);
    }
    outgoingConnections.get(edge.source)!.get(edge.sourceHandle)!.push(edge.target);
    incomingConnections.set(edge.target, edge.source);
  }

  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const unprocessedNodeIds = new Set(nodes.map(node => node.id));

  const recursiveSerializeNode = (nodeId: string | undefined): NodeAssetJson | undefined => {
    if (!nodeId) {
      return undefined;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return undefined;
    }

    if (!unprocessedNodeIds.has(nodeId)) {
      throw new Error(`Circular reference detected for node ${nodeId}.`);
    }
    unprocessedNodeIds.delete(nodeId);

    const absolutePosition = getGraphNodeAbsolutePosition(node, nodesById);
    let json: NodeAssetJson | undefined = {};

    switch (node.type) {
      case "datanode":
        json.$NodeId = node.id;
        json.$Comment = node.data.comment ?? undefined;

        for (const pin of node.data.outputPins) {
          const connectedNodeIds = getOrderedConnectedNodeIds(
            outgoingConnections.get(node.id)?.get(pin.schemaKey) ?? [],
            nodesById,
          );
          if (connectedNodeIds.length === 0) {
            continue;
          }

          switch (pin.multiplicity) {
            case "single":
              json[pin.schemaKey] = recursiveSerializeNode(connectedNodeIds[0]);
              break;
            case "multiple":
              json[pin.schemaKey] = connectedNodeIds.map(connectedNodeId =>
                recursiveSerializeNode(connectedNodeId),
              );
              break;
            case "map":
              json[pin.schemaKey] = connectedNodeIds.reduce<Record<string, unknown>>(
                (map, connectedNodeId) => {
                  const childNode = nodesById.get(connectedNodeId);
                  const key = (childNode?.data.titleOverride as string | undefined) ?? connectedNodeId;
                  map[key] = recursiveSerializeNode(connectedNodeId);
                  return map;
                },
                {},
              );
              break;
          }
        }

        for (const field of Object.values(node.data.fieldsBySchemaKey)) {
          json[field.schemaKey as string] = field.value;
        }

        json = {
          ...json,
          ...(node.data.unparsedMetadata ?? {}),
          ...node.data.schemaConstants,
        };

        nodeEditorMetadata.$Nodes![node.id] = {
          $Position: {
            $x: absolutePosition.x,
            $y: absolutePosition.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;
      case "rawjson":
        json = {
          $NodeId: node.id,
          $Comment: node.data.comment,
          ...JSON.parse(node.data.jsonString),
        };
        nodeEditorMetadata.$Nodes![node.id] = {
          $Position: {
            $x: absolutePosition.x,
            $y: absolutePosition.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;
      case "comment":
        nodeEditorMetadata.$Comments!.push({
          $NodeId: node.id,
          $Position: {
            $x: absolutePosition.x,
            $y: absolutePosition.y,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.titleOverride ?? node.data.defaultTitle,
          $text: node.data.comment ?? "",
          $fontSize: node.data.fontSize ?? DEFAULT_COMMENT_FONT_SIZE,
        });
        json = undefined;
        break;
      case "groupnode":
        nodeEditorMetadata.$Groups!.push({
          $NodeId: node.id,
          $Position: {
            $x: absolutePosition.x,
            $y: absolutePosition.y,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.titleOverride ?? node.data.defaultTitle,
        });
        json = undefined;
        break;
      case "link":
        json = undefined;
        break;
    }

    return json;
  };

  const rootNodeSerialized = recursiveSerializeNode(rootNodeId);

  while (unprocessedNodeIds.size > 0) {
    const [nodeId] = unprocessedNodeIds;
    let newRootId = nodeId;

    while (incomingConnections.has(newRootId)) {
      newRootId = incomingConnections.get(newRootId)!;
    }

    const serializedRoot = recursiveSerializeNode(newRootId);
    if (serializedRoot) {
      nodeEditorMetadata.$FloatingNodes!.push(serializedRoot);
    }
  }

  if (!rootNodeSerialized) {
    return {
      $NodeEditorMetadata: nodeEditorMetadata,
    };
  }

  return {
    ...rootNodeSerialized,
    $NodeEditorMetadata: nodeEditorMetadata,
  };
}
