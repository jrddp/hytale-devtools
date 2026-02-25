import { FlowEdge, FlowNode } from "src/node-editor/graph/graphTypes";
import {
  AssetDocumentShape,
  NodeAssetJson,
  NodeEditorMetadata,
} from "src/node-editor/parsing/parse/parseDocument.svelte";

export function serializeDocument(
  rootNodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): AssetDocumentShape {
  const nodeEditorMetadata: NodeEditorMetadata = {
    $Nodes: {},
    $FloatingNodes: [],
    $Links: {},
    $Groups: [],
    $Comments: [],
  };

  // nodeId -> handle -> connectedNodeId
  const handleConnections: Map<string, Map<string, string>> = edges.reduce(
    (map: Map<string, Map<string, string>>, edge) => {
      if (!map.has(edge.source)) {
        map.set(edge.source, new Map());
      }
      map.get(edge.source).set(edge.sourceHandle, edge.target);
      return map;
    },
    new Map(),
  );
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
    const json: NodeAssetJson = {};
    switch (node.type) {
      case "datanode":
        node.data.outputPins.forEach(pin => {
          const connectedNodeId = handleConnections.get(node.id)?.get(pin.schemaKey);
          if (connectedNodeId) {
            json[pin.schemaKey] = recursiveSerializeNode(connectedNodeId);
          }
        });
        Object.values(node.data.fieldsBySchemaKey).forEach(field => {
          json[field.schemaKey] = field.value;
        });
        json.$NodeID = node.id;
        json.$Comment = node.data.comment ?? undefined;
        nodeEditorMetadata.$Nodes[node.id] = {
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case "comment":
        nodeEditorMetadata.$Comments.push({
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.name,
          $text: node.data.text,
          $fontSize: node.data.fontSize,
        });
        break;

      case "rawjson":
        Object.assign(json, JSON.parse(node.data.data));
        json.$NodeID = node.id;
        json.$Comment = node.data.comment;
        nodeEditorMetadata.$Nodes[node.id] = {
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case "link":
        // todo
        break;

      case "group":
        nodeEditorMetadata.$Groups.push({
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
          },
          $width: node.width,
          $height: node.height,
          $name: node.data.name,
        });
        break;
    }
    return json;
  }

  const rootNodeSerialized = recursiveSerializeNode(rootNodeId);

  while (unprocessedNodeIds.size > 0) {
    const [nodeId] = unprocessedNodeIds;
    nodeEditorMetadata.$FloatingNodes.push(recursiveSerializeNode(nodeId));
  }

  return {
    ...rootNodeSerialized,
    $NodeEditorMetadata: nodeEditorMetadata,
  };
}
