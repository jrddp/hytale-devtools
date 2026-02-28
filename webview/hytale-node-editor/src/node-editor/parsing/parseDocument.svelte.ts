import {
  type AssetDocumentShape,
  type GroupJson,
  type NodeAssetJson,
} from "@shared/node-editor/assetTypes";
import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import { type NodeTemplate } from "@shared/node-editor/workspaceTypes";
import { type DataNodeType, type FlowEdge, type FlowNode, type GroupNodeType } from "src/common";
import { DEFAULT_RAW_JSON_TEXT, LINK_OUTPUT_HANDLE_ID } from "src/constants";
import {
  COMMENT_TEMPLATE,
  createNodeFromTemplate,
  GROUP_TEMPLATE,
  LINK_TEMPLATE,
  RAW_JSON_TEMPLATE,
} from "src/node-editor/utils/nodeFactory.svelte";
import { workspace } from "src/workspace.svelte";
import { type WorkspaceState } from "../../workspace.svelte";
import { createNodeId } from "../utils/idUtils";
import { isObject } from "../utils/valueUtils";

function groupNodeFromJson(groupJson: GroupJson): GroupNodeType {
  return createNodeFromTemplate(
    GROUP_TEMPLATE,
    {
      x: groupJson.$Position.$x,
      y: groupJson.$Position.$y,
    },
    null,
    {
      titleOverride: groupJson.$name,
    },
  ) as GroupNodeType;
}

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

      // deep copy to avoid mutating the template when parsing values (we're cloning twice, since we call it again in createDataNodeType, but it's a low priority optimization)
      const clonedTemplateData: NodeTemplate = structuredClone($state.snapshot(template));

      // filter metadata keys
      const unprocessedData = new Set(Object.keys(localRoot).filter(key => !key.startsWith("$")));
      const unparsedMetadata = {};

      // # process children
      for (const pin of template.outputPins) {
        const schemaKey = pin.schemaKey;
        unprocessedData.delete(schemaKey);
        switch (pin.multiplicity) {
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
              for (let i = 0; i < localRoot[schemaKey].length; i++) {
                const child = localRoot[schemaKey][i];
                let childId = recursiveParseNodes(
                  child as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                nodesById.get(childId).data.inputConnectionIndex = i;
                addEdge(nodeId, schemaKey, childId);
              }
            }
            break;
          case "map":
            if (typeof localRoot[schemaKey] === "object") {
              let i = 0;
              for (const [childKey, value] of Object.entries(
                localRoot[schemaKey] as Record<string, unknown>,
              )) {
                let childId = recursiveParseNodes(
                  value as NodeAssetJson,
                  template.childTypes[schemaKey],
                );
                nodesById.get(childId).data.inputConnectionIndex = i;
                addEdge(nodeId, schemaKey, childId);
                i++;
              }
            }
        }
      }

      // # process fields
      for (const key of Object.keys(clonedTemplateData.fieldsBySchemaKey)) {
        unprocessedData.delete(key);
        const value = localRoot[key];
        if (value !== undefined) {
          clonedTemplateData.fieldsBySchemaKey[key].value = value;
        }
      }

      // carry over any unprocessed metadata
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
        unparsedMetadata[key] = localRoot[key];
      }

      const dataNode = createNodeFromTemplate(
        clonedTemplateData,
        { x: position.$x, y: position.$y },
        nodeId,
        {
          unparsedMetadata,
          comment: localRoot.$Comment,
        },
      );
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
      const jsonNode = createNodeFromTemplate(
        RAW_JSON_TEMPLATE,
        { x: position.$x, y: position.$y },
        nodeId,
        { jsonString: data ? JSON.stringify(data, null, "\t") : DEFAULT_RAW_JSON_TEXT },
      );
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
      const linkNode = createNodeFromTemplate(
        LINK_TEMPLATE,
        { x: linkData.$Position.$x, y: linkData.$Position.$y },
        linkId,
      );
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
      addNode(groupNodeFromJson(groupJson));
    }
    // # $Comments
    for (const commentJson of nodeEditorMetadata.$Comments ?? []) {
      const commentNode = createNodeFromTemplate(
        COMMENT_TEMPLATE,
        { x: commentJson.$Position.$x, y: commentJson.$Position.$y },
        commentJson.$NodeId ?? createNodeId("Comment"),
        {
          titleOverride: commentJson.$name,
          comment: commentJson.$text,
          fontSize: commentJson.$fontSize,
        },
      );
      addNode(commentNode);
    }
  }

  for (const groupJson of documentRoot.$Groups ?? []) {
    addNode(groupNodeFromJson(groupJson));
  }

  return {
    nodes: nodes,
    edges: edges,
    rootNodeId: rootId,
    // easiest to just assume all positions being 0 -> we should do autolayout
    arePositionsSet: !nodes.every(node => node.position.x === 0 && node.position.y === 0),
  };
}
