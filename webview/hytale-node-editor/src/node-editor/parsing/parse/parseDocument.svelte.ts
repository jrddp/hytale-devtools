import { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { createNodeId } from "../../utils/idUtils";
import { workspace, type WorkspaceState } from "../../../workspaceState.svelte";
import {
  type DataNodeType,
  INPUT_HANDLE_ID,
  type FlowEdge,
  type FlowNode,
  type RawJsonNodeType,
  DATA_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
  type DataNodeData,
} from "../../graph/graphTypes";
import { isObject } from "../../utils/valueUtils";

export interface Position {
  $x: number;
  $y: number;
}

export type NodeAssetJson = {
  $NodeID?: string | undefined;
  $Position?: Position | undefined;
  $Comment?: string;
  [key: string]: unknown;
};

export type NodeEditorMetadata = {
  $Nodes?: Record<
    string,
    {
      $Position: Position;
      $Title: string;
    }
  >;
  $FloatingNodes?: NodeAssetJson[];
  $Links?: Record<
    string,
    {
      $Position: Position;
      $Title: string;
      inputConnections: string[]; // connections in the format of {NodeId}:{LocalPinId}
      outputConnections: string[];
      sourceEndpoint: string;
      targetEndpoint: string;
    }
  >;
  $Groups?: {
    $Position: Position;
    $width: number;
    $height: number;
    $name: string;
  }[];
  $Comments?: {
    $Position: Position;
    $width: number;
    $height: number;
    $name: string;
    $text: string;
    $fontSize: number;
  }[];
  $WorkspaceID?: string;
};

export type AssetDocumentShape = {
  $NodeEditorMetadata?: NodeEditorMetadata;
} & NodeAssetJson;

export function parseDocumentText(text: string): WorkspaceState {
  console.log("Parsing document text.");

  if (!workspace.context) {
    throw new Error(
      "Workspace context was not set before parsing document text. This should not happen.",
    );
  }
  const { rootTemplateOrVariantId, variantKindsById, nodeTemplatesById } = workspace.context;

  const root = JSON.parse(text);
  if (!isObject(root)) {
    throw new Error("Document must be a JSON object.");
  }

  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  const addEdge = (sourceId: string, sourceHandleId: string, childId) => {
    return edges.push({
      id: `${sourceId}:${sourceHandleId}-${childId}`,
      source: sourceId,
      sourceHandle: sourceHandleId,
      target: childId,
      targetHandle: INPUT_HANDLE_ID,
    });
  };

  const recursiveParseNodes = (localRoot: unknown, variantOrTemplateID: string | null): string => {
    console.log("Attempting to parse", localRoot);
    let templateId: string;
    let rootNode = localRoot as NodeAssetJson;
    let nodeId = rootNode.$NodeID;
    let position = rootNode.$Position ?? { $x: 0, $y: 0 };
    const variantKind = variantKindsById[variantOrTemplateID];
    if (variantKind) {
      const nodeType = localRoot[variantKind.VariantFieldName];
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
    console.log("Parsing a node with template", template, root);
    if (template) {
      if (!nodeId) {
        nodeId = createNodeId(templateId);
      }

      console.log(Object.entries(rootNode));

      const nodeData: DataNodeData = {
        ...template,
      };
      const unprocessedData = new Set(Object.keys(rootNode).filter(key => !key.startsWith("$")));

      // recurse on children
      for (const pin of template.outputPins) {
        const schemaKey = pin.schemaKey;
        unprocessedData.delete(schemaKey);
        switch (pin.type) {
          case "single":
            if (rootNode[schemaKey] !== undefined) {
              let childId = recursiveParseNodes(
                rootNode[schemaKey],
                template.childTypes[schemaKey],
              );
              addEdge(nodeId, schemaKey, childId);
            }
            break;
          case "multiple":
            if (Array.isArray(rootNode[schemaKey])) {
              for (const child of rootNode[schemaKey] as unknown[]) {
                let childId = recursiveParseNodes(child, template.childTypes[schemaKey]);
                addEdge(nodeId, schemaKey, childId);
              }
            }
            break;
          case "map":
            if (typeof rootNode[schemaKey] === "object") {
              for (const [childKey, value] of Object.entries(
                rootNode[schemaKey] as Record<string, unknown>,
              )) {
                let childId = recursiveParseNodes(value, template.childTypes[schemaKey]);
                addEdge(nodeId, schemaKey, childId);
              }
            }
        }
      }

      for (const key of Object.keys(nodeData.fieldsBySchemaKey)) {
        unprocessedData.delete(key);
        const value = rootNode[key];
        if (value) {
          nodeData.fieldsBySchemaKey[key].value = value;
        }
      }

      nodeData.unparsedMetadata = {};
      for (const key of unprocessedData) {
        if (template.schemaConstants[key]) {
          if (rootNode[key] != template.schemaConstants[key]) {
            console.warn(
              `Constant value for ${key} in asset doesn't match expected from template.`,
              rootNode,
              template,
            );
          }
          continue;
        }
        nodeData.unparsedMetadata[key] = rootNode[key];
      }

      const dataNode: DataNodeType = {
        type: DATA_NODE_TYPE,
        id: nodeId,
        position: {
          x: position.$x,
          y: position.$y,
        },
        data: { ...template },
      };
      nodes.push(dataNode);
      console.log("Parsed a data node", dataNode);
    } else {
      if (!nodeId) {
        nodeId = createNodeId("Generic");
      }
      const jsonNode: RawJsonNodeType = {
        type: RAW_JSON_NODE_TYPE,
        id: nodeId,
        position: {
          x: position.$x,
          y: position.$y,
        },
        data: {
          data: JSON.stringify(localRoot, null, 2),
        },
      };
      nodes.push(jsonNode);
    }

    return nodeId;
  };

  const rootId = recursiveParseNodes(root, rootTemplateOrVariantId);

  console.log(rootId);

  return {
    nodes: nodes,
    edges: edges,
    rootNodeId: rootId,
  };
}
