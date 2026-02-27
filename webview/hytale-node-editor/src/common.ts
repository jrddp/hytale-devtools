import { WebviewToExtensionMessage } from "@shared/node-editor/messageTypes";
import { NodePin, NodeTemplate } from "@shared/node-editor/workspaceTypes";
import type { Edge, Node, XYPosition } from "@xyflow/svelte";

export const DATA_NODE_TYPE = "datanode";
export const RAW_JSON_NODE_TYPE = "rawjson";
export const LINK_NODE_TYPE = "link";
export const GROUP_NODE_TYPE = "groupnode";
export const COMMENT_NODE_TYPE = "comment";

export const INPUT_HANDLE_ID = "input";
export const LINK_OUTPUT_HANDLE_ID = "output";
export const LINK_DEFAULT_OUTPUT_LABEL = "Children";

export const GENERIC_CATEGORY = "Generic";
export const GROUP_TEMPLATE_ID = "$Group";
export const COMMENT_TEMPLATE_ID = "$Comment";
export const RAW_JSON_TEMPLATE_ID = "$RawJson";
export const LINK_TEMPLATE_ID = "$Link";

export const GROUP_MUTATION_EVENT = "hytale-node-editor-group-mutation";
export const COMMENT_MUTATION_EVENT = "hytale-node-editor-comment-mutation";
export const RAW_JSON_MUTATION_EVENT = "hytale-node-editor-raw-json-mutation";
export const LINK_MUTATION_EVENT = "hytale-node-editor-link-mutation";

export const DEFAULT_COMMENT_WIDTH = 200;
export const DEFAULT_COMMENT_HEIGHT = 100;
export const DEFAULT_COMMENT_FONT_SIZE = 9;

export const DEFAULT_GROUP_WIDTH = 520;
export const DEFAULT_GROUP_HEIGHT = 320;

export const DEFAULT_RAW_JSON_TEXT = "{\n\n}";
export const DEFAULT_RAW_JSON_LABEL = "Raw JSON Node";

export type VSCodeApi = {
  postMessage: (message: WebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
};

export type NodeBase = Record<string, unknown> &
  (
    | {
        hasOutputs: false;
        // if this is a child of a multiple/map type pin, this indicates the list order among its siblings
        inputConnectionIndex?: number;
      }
    | {
        hasOutputs: true;
        outputPins: NodePin[];
        inputConnectionIndex?: number;
      }
  );

// nodes with standard comment/title override abilities
export interface StandardNode {
  titleOverride?: string;
  comment?: string;
}

// non-metadata nodes
interface AssetDataNode {
  unparsedMetadata?: Record<string, unknown>;
}

export type DataNodeData = NodeBase &
  StandardNode &
  AssetDataNode &
  NodeTemplate & {
    hasOutputs: true;
  };

export type RawJsonNodeData = NodeBase &
  StandardNode &
  AssetDataNode & {
    hasOutputs: false;
    jsonString: string;
  };

export type LinkNodeData = NodeBase &
  StandardNode & {
    hasOutputs: true;
  };

export type GroupNodeData = NodeBase & {
  name: string;
  hasOutputs: false;
  unparsedMetadata?: Record<string, unknown>;
};

export type CommentNodeData = NodeBase & {
  hasOutputs: false;
  name: string;
  text: string;
  fontSize?: number;
  unparsedMetadata?: Record<string, unknown>;
};

export type DataNodeType = Node<DataNodeData, typeof DATA_NODE_TYPE> & {
  type: typeof DATA_NODE_TYPE;
};
export type RawJsonNodeType = Node<RawJsonNodeData, typeof RAW_JSON_NODE_TYPE> & {
  type: typeof RAW_JSON_NODE_TYPE;
};
export type LinkNodeType = Node<LinkNodeData, typeof LINK_NODE_TYPE> & {
  type: typeof LINK_NODE_TYPE;
};
export type GroupNodeType = Node<GroupNodeData, typeof GROUP_NODE_TYPE> & {
  type: typeof GROUP_NODE_TYPE;
};
export type CommentNodeType = Node<CommentNodeData, typeof COMMENT_NODE_TYPE> & {
  type: typeof COMMENT_NODE_TYPE;
};

export type NodeEditorFlowData =
  | DataNodeData
  | RawJsonNodeData
  | LinkNodeData
  | GroupNodeData
  | CommentNodeData;

export type FlowNode =
  | DataNodeType
  | RawJsonNodeType
  | LinkNodeType
  | GroupNodeType
  | CommentNodeType;

export type FlowEdge = Edge;

export interface ParsedDocumentState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId: string;
}

export interface ViewportState {
  x: number;
  y: number;
  zoom: number;
}

export interface NodeEditorSessionState {
  viewport?: ViewportState;
  selectedNodeIds?: string[];
  openPanels?: {
    search?: boolean;
    help?: boolean;
  };
  focusedNodeId?: string;
}

export interface NodeWithAbsolutePosition {
  id: string;
  position: XYPosition;
}
