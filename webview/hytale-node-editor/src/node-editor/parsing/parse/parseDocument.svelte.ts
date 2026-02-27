import {
  type AssetDocumentShape,
  type GroupJson,
  type NodeAssetJson,
} from "@shared/node-editor/assetTypes";
import { workspace } from "src/workspace.svelte";
import {
  COMMENT_NODE_TYPE,
  type CommentNodeType,
  DATA_NODE_TYPE,
  type DataNodeData,
  type DataNodeType,
  DEFAULT_RAW_JSON_TEXT,
  type FlowEdge,
  type FlowNode,
  GROUP_NODE_TYPE,
  type GroupNodeType,
  INPUT_HANDLE_ID,
  LINK_NODE_TYPE,
  LINK_OUTPUT_HANDLE_ID,
  type LinkNodeType,
  RAW_JSON_NODE_TYPE,
  type RawJsonNodeType,
} from "../../../common";
import { type WorkspaceState } from "../../../workspace.svelte";
import { createNodeId } from "../../utils/idUtils";
import { isObject } from "../../utils/valueUtils";

export function parseDocumentText(text: string): WorkspaceState {
  if (!workspace.context) {
    throw new Error(
      "Workspace context was not set before parsing document text. This should not happen.",
    );
  }
  const { rootTemplateOrVariantId, variantKindsById, nodeTemplatesById } = workspace.context;

  const documentRoot: AssetDocumentShape = JSON.parse(text);
  if (!isObject(documentRoot)) {
    throw new Error("Document must be a JSON object.");
  }

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];
  const nodesById: Map<string, FlowNode> = new Map();
  // nodeId -> handle -> edge
  const outgoingConnections: Map<string, Map<string, FlowEdge[]>> = new Map();
  // incomingConnections: targetId -> edge
  const incomingConnections: Map<string, FlowEdge[]> = new Map();

  const addEdge = (sourceId: string, sourceHandleId: string, childId: string) => {
    const edge = {
      id: `${sourceId}:${sourceHandleId}-${childId}`,
      source: sourceId,
      sourceHandle: sourceHandleId,
      target: childId,
      targetHandle: INPUT_HANDLE_ID,
    };
    edges.push(edge);

    // index edge for easier $Links lookup
    if (!outgoingConnections.has(sourceId)) {
      outgoingConnections.set(sourceId, new Map());
    }
    if (!outgoingConnections.get(sourceId).has(sourceHandleId)) {
      outgoingConnections.get(sourceId).set(sourceHandleId, []);
    }
    outgoingConnections.get(sourceId).get(sourceHandleId).push(edge);
    if (!incomingConnections.has(childId)) {
      incomingConnections.set(childId, []);
    }
    incomingConnections.get(childId).push(edge);
  };

  const addNode = (node: FlowNode) => {
    nodes.push(node);
    nodesById.set(node.id, node);
  };

  const recursiveParseNodes = (
    localRoot: NodeAssetJson,
    variantOrTemplateID: string | null,
  ): string => {
    let templateId: string;
    let nodeId = localRoot.$NodeId;
    let position = localRoot.$Position ?? { $x: 0, $y: 0 };
    const variantKind = variantKindsById[variantOrTemplateID];
    if (variantKind) {
      const nodeType = localRoot[variantKind.VariantFieldName] as string;
      if (nodeType) {
        templateId = variantKind.Variants[nodeType];
      }
    }
    if (!templateId && variantOrTemplateID) {
      templateId = variantOrTemplateID;
    }
    if (!templateId && nodeId) {
      // parse template from node id (e.g. Biome-123456-1234-1234-123589)
      templateId = nodeId.substring(0, nodeId.indexOf("-"));
    }

    const template = nodeTemplatesById[templateId];
    if (template) {
      // # Template found -> Data Node
      if (!nodeId) {
        nodeId = createNodeId(templateId);
      }

      // deep copy to avoid mutating the template
      const nodeData: DataNodeData = structuredClone($state.snapshot(template));

      // filter metadata keys
      const unprocessedData = new Set(Object.keys(localRoot).filter(key => !key.startsWith("$")));

      // # process children
      for (const pin of template.outputPins) {
        const schemaKey = pin.schemaKey;
        unprocessedData.delete(schemaKey);
        switch (pin.type) {
          case "single":
            if (localRoot[schemaKey] !== undefined) {
              let childId = recursiveParseNodes(
                localRoot[schemaKey] as NodeAssetJson,
                template.childTypes[schemaKey],
              );
              addEdge(nodeId, schemaKey, childId);
            }
            break;
          case "multiple":
            if (Array.isArray(localRoot[schemaKey])) {
              for (const child of localRoot[schemaKey] as unknown[]) {
                let childId = recursiveParseNodes(
                  child as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                addEdge(nodeId, schemaKey, childId);
              }
            }
            break;
          case "map":
            if (typeof localRoot[schemaKey] === "object") {
              for (const [childKey, value] of Object.entries(
                localRoot[schemaKey] as Record<string, unknown>,
              )) {
                let childId = recursiveParseNodes(
                  value as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                addEdge(nodeId, schemaKey, childId);
              }
            }
        }
      }

      // # process fields
      for (const key of Object.keys(nodeData.fieldsBySchemaKey)) {
        unprocessedData.delete(key);
        const value = localRoot[key];
        if (value !== undefined) {
          nodeData.fieldsBySchemaKey[key].value = value;
        }
      }

      // carry over any unprocessed metadata
      nodeData.unparsedMetadata = {};
      for (const key of unprocessedData) {
        if (template.schemaConstants[key]) {
          if (localRoot[key] != template.schemaConstants[key]) {
            console.warn(
              `Constant value for ${key} in asset doesn't match expected from template.`,
              localRoot,
              template,
            );
          }
          continue;
        }
        nodeData.unparsedMetadata[key] = localRoot[key];
      }

      const dataNode: DataNodeType = {
        type: DATA_NODE_TYPE,
        id: nodeId,
        position: {
          x: position.$x,
          y: position.$y,
        },
        data: { ...nodeData, comment: localRoot.$Comment },
      };
      addNode(dataNode);
    } else {
      // # Template not found -> Raw Json Node
      if (!nodeId) {
        nodeId = createNodeId("Generic");
      }
      const data = {};
      Object.entries(localRoot).forEach(([key, value]) => {
        if (!key.startsWith("$")) data[key] = value;
      });
      const jsonNode: RawJsonNodeType = {
        type: RAW_JSON_NODE_TYPE,
        id: nodeId,
        position: {
          x: position.$x,
          y: position.$y,
        },
        data: {
          data: data ? JSON.stringify(data, null, "\t") : DEFAULT_RAW_JSON_TEXT,
          comment: localRoot.$Comment,
        },
      };
      addNode(jsonNode);
    }

    return nodeId;
  };

  const rootId = recursiveParseNodes(documentRoot, rootTemplateOrVariantId);

  // process nodeEditorMetadata
  const nodeEditorMetadata = documentRoot.$NodeEditorMetadata;
  if (nodeEditorMetadata) {
    // # $FloatingNodes
    for (const nodeJson of nodeEditorMetadata.$FloatingNodes ?? []) {
      recursiveParseNodes(nodeJson, null);
    }
    // # $Nodes - positions and title overrides
    for (const [nodeId, info] of Object.entries(nodeEditorMetadata.$Nodes ?? {})) {
      const node = nodesById.get(nodeId);
      if (!node) {
        console.warn(`Metadata info saved for node ${nodeId} but node was not found.`);
        continue;
      }
      node.position.x = info.$Position.$x;
      node.position.y = info.$Position.$y;
      node.data.titleOverride = info.$Title;
    }
    // # $Links
    for (const [linkId, linkData] of Object.entries(nodeEditorMetadata.$Links ?? {})) {
      const linkNode: LinkNodeType = {
        type: LINK_NODE_TYPE,
        id: linkId,
        position: {
          x: linkData.$Position.$x,
          y: linkData.$Position.$y,
        },
        data: {},
      };
      addNode(linkNode);

      // reorganize edges for link
      // ! FIXME: If links are chained and saved in JSON out of dependency order, they may not be properly parsed.
      const sourcePin = linkData.sourceEndpoint; // in format "nodeId:LocalPinId"
      const targetPins = linkData.outputConnections;
      if (sourcePin && targetPins) {
        const sourceNodeId = sourcePin.split(":")[0];
        const sourcePinId = sourcePin.split(":")[1];
        const sourceNode = nodesById.get(sourceNodeId) as DataNodeType;
        if (!sourceNode) {
          console.warn(`Link source node ${sourceNodeId} not found.`);
          continue;
        }
        const sourceHandleId =
          sourceNode.data.outputPins?.find(pin => pin.localId === sourcePinId)?.schemaKey ??
          LINK_OUTPUT_HANDLE_ID;
        for (const targetPin of targetPins) {
          // target pin ID doesn't really matter since we assume its their primary input pin
          const targetNodeId = targetPin.split(":")[0];
          for (const edge of outgoingConnections.get(sourceNodeId)?.get(sourceHandleId) ?? []) {
            // change original edge to point to link, make new edge from link to target
            if (edge.target === targetNodeId && edge.targetHandle === INPUT_HANDLE_ID) {
              edge.target = linkId;
            }
            addEdge(linkId, LINK_OUTPUT_HANDLE_ID, targetNodeId);
          }
        }
      }
    }
    // # $Groups
    for (const groupJson of nodeEditorMetadata.$Groups ?? []) {
      addNode(createGroupnode(groupJson));
    }
    // # $Comments
    for (const commentJson of nodeEditorMetadata.$Comments ?? []) {
      const commentNode: CommentNodeType = {
        type: COMMENT_NODE_TYPE,
        id: commentJson.$NodeId ?? createNodeId("Comment"),
        position: {
          x: commentJson.$Position.$x,
          y: commentJson.$Position.$y,
        },
        width: commentJson.$width,
        height: commentJson.$height,
        data: {
          name: commentJson.$name,
          text: commentJson.$text,
          fontSize: commentJson.$fontSize,
        },
      };
      addNode(commentNode);
    }
  }

  for (const groupJson of documentRoot.$Groups ?? []) {
    addNode(createGroupnode(groupJson));
  }

  return {
    nodes: nodes,
    edges: edges,
    rootNodeId: rootId,
  };
}

function createGroupnode(groupJson: GroupJson): GroupNodeType {
  return {
    type: GROUP_NODE_TYPE,
    id: groupJson.$NodeId ?? createNodeId("Group"),
    position: {
      x: groupJson.$Position.$x,
      y: groupJson.$Position.$y,
    },
    width: groupJson.$width,
    height: groupJson.$height,
    data: {
      name: groupJson.$name,
    },
  };
}
