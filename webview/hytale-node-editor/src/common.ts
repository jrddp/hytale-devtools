import type { WebviewToExtensionMessage } from "@shared/node-editor/messageTypes";
import type {
  CommentNodeData,
  DataNodeData,
  GroupNodeData,
  LinkNodeData,
  NodeBaseData,
  RawJsonNodeData,
} from "@shared/node-editor/graphTypes";
import type { Edge, Node } from "@xyflow/svelte";

export type VSCodeApi = {
  postMessage: (message: WebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
};

export type { NodeBaseData };

export type DataNodeType = Node<DataNodeData, "datanode"> & {
  type: "datanode";
};
export type RawJsonNodeType = Node<
  RawJsonNodeData,
  "rawjson"
> & {
  type: "rawjson";
};
export type LinkNodeType = Node<LinkNodeData, "link"> & {
  type: "link";
};
export type GroupNodeType = Node<GroupNodeData, "groupnode"> & {
  type: "groupnode";
  // require size to create
  width: number;
  height: number;
};
export type CommentNodeType = Node<
  CommentNodeData,
  "comment"
> & {
  type: "comment";
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
