import type { AssetDocumentShape, NodeAssetJson, NodeEditorMetadata } from "./assetTypes";
import type {
  DataGraphNode,
  NodeEditorGraphDocument,
  NodeEditorGraphNode,
} from "./graphTypes";
import { getResolvedChildSlots } from "./childSlotUtils";
import {
  getComponentReferenceSlotOccupancy,
  isComponentReferenceNodeTemplate,
  isComponentReferenceSyntheticFieldSchemaKey,
  parseComponentReferenceSyntheticFieldSchemaKey,
} from "./componentReferences";
import { cloneJsonLike } from "../jsonClone";

const DEFAULT_COMMENT_FONT_SIZE = 9;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

  return [...connectedNodeIds].sort((leftId, rightId) => getAbsoluteY(leftId) - getAbsoluteY(rightId));
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
  const incomingConnections = new Map<string, Map<string, string[]>>();

  for (const edge of edges) {
    if (!outgoingConnections.has(edge.source)) {
      outgoingConnections.set(edge.source, new Map());
    }
    if (!outgoingConnections.get(edge.source)!.has(edge.sourceHandle)) {
      outgoingConnections.get(edge.source)!.set(edge.sourceHandle, []);
    }
    outgoingConnections.get(edge.source)!.get(edge.sourceHandle)!.push(edge.target);

    if (!incomingConnections.has(edge.target)) {
      incomingConnections.set(edge.target, new Map());
    }
    if (!incomingConnections.get(edge.target)!.has(edge.targetHandle)) {
      incomingConnections.get(edge.target)!.set(edge.targetHandle, []);
    }
    incomingConnections.get(edge.target)!.get(edge.targetHandle)!.push(edge.source);
  }

  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const serializedNodesById = new Map<string, NodeAssetJson | undefined>();
  const serializationStack = new Set<string>();

  const getSerializedChildNodeIds = (
    node: DataGraphNode,
    schemaKey: string,
  ): string[] => {
    const slot = getResolvedChildSlots(node.data).find(
      resolvedSlot => resolvedSlot.childSchema.schemaKey === schemaKey,
    );
    if (!slot) {
      return [];
    }

    const connectedNodeIds =
      slot.side === "output"
        ? outgoingConnections.get(node.id)?.get(slot.pin.schemaKey) ?? []
        : incomingConnections.get(node.id)?.get(slot.pin.schemaKey) ?? [];

    return getOrderedConnectedNodeIds(connectedNodeIds, nodesById);
  };

  const serializedParentCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.type !== "datanode") {
      continue;
    }

    for (const slot of getResolvedChildSlots(node.data)) {
      const childNodeIds = getSerializedChildNodeIds(node, slot.childSchema.schemaKey);
      childNodeIds.forEach(childNodeId => {
        serializedParentCounts.set(childNodeId, (serializedParentCounts.get(childNodeId) ?? 0) + 1);
      });
    }
  }

  const recursiveSerializeNode = (nodeId: string | undefined): NodeAssetJson | undefined => {
    if (!nodeId) {
      return undefined;
    }

    const node = nodesById.get(nodeId);
    if (!node) {
      return undefined;
    }

    if (serializationStack.has(nodeId)) {
      throw new Error(`Circular reference detected for node ${nodeId}.`);
    }
    if (serializedNodesById.has(nodeId)) {
      const cached = serializedNodesById.get(nodeId);
      return cached ? structuredClone(cached) : undefined;
    }

    serializationStack.add(nodeId);

    const absolutePosition = getGraphNodeAbsolutePosition(node, nodesById);
    let json: NodeAssetJson | undefined = {};

    switch (node.type) {
      case "datanode":
        json.$NodeId = node.id;
        json.$Comment = node.data.comment ?? undefined;

        const originalUnparsedMetadata = node.data.unparsedMetadata ?? {};
        const hadOriginalComponentModify = Object.hasOwn(originalUnparsedMetadata, "Modify");
        const originalComponentModify = originalUnparsedMetadata.Modify;
        const preservedUnparsedMetadata =
          isComponentReferenceNodeTemplate(node.data) && hadOriginalComponentModify
            ? Object.fromEntries(
                Object.entries(originalUnparsedMetadata).filter(([key]) => key !== "Modify"),
              )
            : originalUnparsedMetadata;
        let componentModify =
          isComponentReferenceNodeTemplate(node.data) && isObject(originalUnparsedMetadata.Modify)
            ? (cloneJsonLike(originalUnparsedMetadata.Modify) as Record<string, unknown>)
            : undefined;

        for (const slot of getResolvedChildSlots(node.data)) {
          const connectedNodeIds = getSerializedChildNodeIds(node, slot.childSchema.schemaKey);
          if (connectedNodeIds.length === 0) {
            continue;
          }

          const wholeSlotConnectedNodeId = connectedNodeIds.find(connectedNodeId => {
            const childNode = nodesById.get(connectedNodeId);
            return (
              childNode?.type === "datanode" &&
              getComponentReferenceSlotOccupancy(childNode.data) === "whole-slot"
            );
          });

          switch (slot.pin.multiplicity) {
            case "single":
              json[slot.childSchema.schemaKey] = recursiveSerializeNode(connectedNodeIds[0]);
              break;
            case "multiple":
              json[slot.childSchema.schemaKey] = wholeSlotConnectedNodeId
                ? recursiveSerializeNode(wholeSlotConnectedNodeId)
                : connectedNodeIds.map(connectedNodeId =>
                    recursiveSerializeNode(connectedNodeId),
                  );
              break;
            case "map":
              json[slot.childSchema.schemaKey] = connectedNodeIds.reduce<Record<string, unknown>>(
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
          if (!field.isSet) {
            continue;
          }
          if (field.value === undefined) {
            continue;
          }
          if (field.value === "" && field.isImplicit) {
            continue;
          }
          const schemaKey = field.schemaKey as string;
          if (
            isComponentReferenceNodeTemplate(node.data) &&
            isComponentReferenceSyntheticFieldSchemaKey(schemaKey)
          ) {
            const syntheticField = parseComponentReferenceSyntheticFieldSchemaKey(schemaKey);
            if (!syntheticField) {
              continue;
            }
            componentModify ??= {};

            switch (syntheticField.kind) {
              case "modify":
                componentModify[syntheticField.key] = cloneJsonLike(field.value);
                break;
              case "export-state": {
                const exportStates = Array.isArray(componentModify._ExportStates)
                  ? [...componentModify._ExportStates]
                  : [];
                exportStates[syntheticField.index] = cloneJsonLike(field.value);
                componentModify._ExportStates = exportStates;
                break;
              }
            }
            continue;
          }

          json[schemaKey] = field.value;
        }

        if (isComponentReferenceNodeTemplate(node.data) && (hadOriginalComponentModify || componentModify)) {
          json.Modify =
            componentModify ??
            (hadOriginalComponentModify ? cloneJsonLike(originalComponentModify) : {});
        }

        json = {
          ...json,
          ...preservedUnparsedMetadata,
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

    serializationStack.delete(nodeId);
    serializedNodesById.set(nodeId, json ? structuredClone(json) : undefined);
    return json ? structuredClone(json) : undefined;
  };

  const rootNodeSerialized = recursiveSerializeNode(rootNodeId);

  for (const node of nodes) {
    if (node.id === rootNodeId || (serializedParentCounts.get(node.id) ?? 0) > 0) {
      continue;
    }

    const serializedRoot = recursiveSerializeNode(node.id);
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
