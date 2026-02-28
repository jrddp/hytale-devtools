import { WebviewToExtensionMessage } from "@shared/node-editor/messageTypes";
import { NodeTemplate } from "@shared/node-editor/workspaceTypes";
import type { Edge, Node } from "@xyflow/svelte";
import {
  COMMENT_NODE_TYPE,
  DATA_NODE_TYPE,
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
} from "src/constants";

export type VSCodeApi = {
  postMessage: (message: WebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
};

export type NodeBase = Record<string, unknown> &
  NodeTemplate & {
    // if this is a child of a multiple/map type pin, this indicates the list order among its siblings
    inputConnectionIndex?: number;
    titleOverride?: string;
    comment?: string;
  };

// non-metadata nodes

export type DataNodeData = NodeBase & {
  unparsedMetadata?: Record<string, unknown>;
};

export type RawJsonNodeData = NodeBase & {
  jsonString: string;
};

export type LinkNodeData = NodeBase & {};

export type GroupNodeData = NodeBase;

export type CommentNodeData = NodeBase & {
  fontSize?: number;
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
  // require size to create
  width: number;
  height: number;
};
export type CommentNodeType = Node<CommentNodeData, typeof COMMENT_NODE_TYPE> & {
  type: typeof COMMENT_NODE_TYPE;
};

export type FlowNodeData =
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
