import {
  COMMENT_NODE_TYPE,
  DATA_NODE_TYPE,
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
  type FlowNode,
} from "src/common";
import {
  type AssetDocumentShape,
  type NodeAssetJson,
  type NodeEditorMetadata,
} from "@shared/node-editor/assetTypes";
import { getAbsolutePosition } from "src/node-editor/utils/nodeUtils.svelte";
import { workspace } from "src/workspace.svelte";

export function serializeDocument(): AssetDocumentShape {
  const { rootNodeId, nodes, edges } = workspace;

  const nodeEditorMetadata: NodeEditorMetadata = {
    $Nodes: {},
    $FloatingNodes: [],
    $Links: {},
    $Groups: [],
    $Comments: [],
  };

  // parentId -> handleId -> childId
  const outgoingConnections: Map<string, Map<string, string[]>> = new Map();
  // childId -> parentId
  const incomingConnections: Map<string, string> = new Map();

  edges.forEach(edge => {
    if (!outgoingConnections.has(edge.source)) {
      outgoingConnections.set(edge.source, new Map());
    }
    if (!outgoingConnections.get(edge.source)!.has(edge.sourceHandle)) {
      outgoingConnections.get(edge.source)!.set(edge.sourceHandle, []);
    }
    outgoingConnections.get(edge.source)!.get(edge.sourceHandle)!.push(edge.target);
    incomingConnections.set(edge.target, edge.source);
  });

  const nodesById: Map<string, FlowNode> = nodes.reduce((map, node) => {
    map.set(node.id, node);
    return map;
  }, new Map());
  const unprocessedNodeIds = nodes.reduce((set, node) => set.add(node.id), new Set<string>());

  function recursiveSerializeNode(nodeId: string): NodeAssetJson {
    if (!unprocessedNodeIds.has(nodeId)) {
      throw new Error(`Circular reference detected for node ${nodeId}. This should not happen.`);
    }
    unprocessedNodeIds.delete(nodeId);
    const node = nodesById.get(nodeId);
    let json: NodeAssetJson = {};
    const { x: absoluteX, y: absoluteY } = getAbsolutePosition(node);
    switch (node.type) {
      case DATA_NODE_TYPE:
        json.$NodeId = node.id;
        json.$Comment = node.data.comment ?? undefined;
        // # Recursive serialize children
        node.data.outputPins.forEach(pin => {
          const connectedNodeIds = outgoingConnections.get(node.id)?.get(pin.schemaKey) ?? [];
          if (connectedNodeIds.length > 0) {
            switch (pin.type) {
              case "single":
                json[pin.schemaKey] = recursiveSerializeNode(connectedNodeIds[0]);
                break;
              case "multiple":
                json[pin.schemaKey] = connectedNodeIds.map(id => recursiveSerializeNode(id));
                break;
              case "map":
                json[pin.schemaKey] = connectedNodeIds.reduce((map, id) => {
                  const node = nodesById.get(id);
                  const key = (node.data.titleOverride as string | undefined) ?? id;
                  map[key] = recursiveSerializeNode(id);
                  return map;
                }, {});
            }
          }
        });
        // # Serialize fields
        Object.values(node.data.fieldsBySchemaKey).forEach(field => {
          json[field.schemaKey] = field.value;
        });
        // # Serialize retained unparsed metadata and schema constants
        json = {
          ...json,
          ...node.data.unparsedMetadata,
          ...node.data.schemaConstants,
        };
        // # Process editor metadata
        nodeEditorMetadata.$Nodes[node.id] = {
          $Position: {
            $x: absoluteX,
            $y: absoluteY,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case COMMENT_NODE_TYPE:
        // metadata only (full-node comments)
        nodeEditorMetadata.$Comments.push({
          $NodeId: node.id,
          $Position: {
            $x: absoluteX,
            $y: absoluteY,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.name,
          $text: node.data.text,
          $fontSize: node.data.fontSize,
        });
        json = undefined;
        break;

      case RAW_JSON_NODE_TYPE:
        json = {
          $NodeId: node.id,
          $Comment: node.data.comment,
          ...JSON.parse(node.data.data),
        };
        nodeEditorMetadata.$Nodes[node.id] = {
          $Position: {
            $x: absoluteX,
            $y: absoluteY,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case LINK_NODE_TYPE:
        // metadata only
        // todo
        json = undefined;
        break;

      case GROUP_NODE_TYPE:
        // metadata only
        nodeEditorMetadata.$Groups.push({
          $NodeId: node.id,
          $Position: {
            $x: absoluteX,
            $y: absoluteY,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.name,
        });
        json = undefined;
        break;
    }
    return json;
  }

  const rootNodeSerialized = recursiveSerializeNode(rootNodeId);

  while (unprocessedNodeIds.size > 0) {
    const [nodeId] = unprocessedNodeIds;
    let newRootId = nodeId;
    // only add parents of any subgraphs to floating nodes
    while (incomingConnections.has(newRootId)) {
      newRootId = incomingConnections.get(newRootId)!;
    }

    const serializedNewRoot = recursiveSerializeNode(newRootId);
    if (serializedNewRoot) {
      nodeEditorMetadata.$FloatingNodes.push(serializedNewRoot);
    }
  }

  nodeEditorMetadata.$WorkspaceID = workspace.context.rootMenuName;

  return {
    ...rootNodeSerialized,
    $NodeEditorMetadata: nodeEditorMetadata,
  };
}
