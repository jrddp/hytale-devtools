import { FlowEdge, FlowNode } from "src/common";
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

  // nodeId -> handle -> targetNodeId
  const outgoingConnections: Map<string, Map<string, string[]>> = edges.reduce(
    (map: Map<string, Map<string, string[]>>, edge) => {
      if (!map.has(edge.source)) {
        map.set(edge.source, new Map());
      }
      if (!map.get(edge.source).has(edge.sourceHandle)) {
        map.get(edge.source).set(edge.sourceHandle, []);
      }
      map.get(edge.source).get(edge.sourceHandle).push(edge.target);
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
    let json: NodeAssetJson = {};
    switch (node.type) {
      case "datanode":
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
            $x: node.position.x,
            $y: node.position.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case "comment":
        // metadata only (full-node comments)
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
        json = undefined;
        break;

      case "rawjson":
        json = {
          $NodeId: node.id,
          $Comment: node.data.comment,
          ...JSON.parse(node.data.data),
        };
        nodeEditorMetadata.$Nodes[node.id] = {
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
          },
          $Title: node.data.titleOverride ?? undefined,
        };
        break;

      case "link":
        // metadata only
        // todo
        json = undefined;
        break;

      case "group":
        // metadata only
        nodeEditorMetadata.$Groups.push({
          $Position: {
            $x: node.position.x,
            $y: node.position.y,
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
    const newRoot = recursiveSerializeNode(nodeId);
    if (newRoot) {
      nodeEditorMetadata.$FloatingNodes.push(newRoot);
    }
  }

  return {
    ...rootNodeSerialized,
    $NodeEditorMetadata: nodeEditorMetadata,
  };
}
