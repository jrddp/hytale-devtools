import { NodePin, NodeTemplate } from "@shared/node-editor/workspaceTypes";
import type { Edge, Node, XYPosition } from "@xyflow/svelte";

export const DATA_NODE_TYPE = "datanode";
export const RAW_JSON_NODE_TYPE = "rawjson";
export const LINK_NODE_TYPE = "link";
export const GROUP_NODE_TYPE = "group";
export const COMMENT_NODE_TYPE = "comment";

export const RAW_JSON_INPUT_HANDLE_ID = "input";
export const LINK_INPUT_HANDLE_ID = "input";
export const LINK_OUTPUT_HANDLE_ID = "output";

export const INPUT_HANDLE_ID = "input";
export const GENERIC_ADD_CATEGORY = "Generic";
export const GENERIC_ACTION_CREATE_GROUP = "create-group";
export const GENERIC_ACTION_CREATE_COMMENT = "create-comment";
export const GENERIC_ACTION_CREATE_RAW_JSON = "create-raw-json";
export const GENERIC_ACTION_CREATE_LINK = "create-link";
export const GROUP_MUTATION_EVENT = "hytale-node-editor-group-mutation";
export const COMMENT_MUTATION_EVENT = "hytale-node-editor-comment-mutation";
export const CUSTOM_MUTATION_EVENT = "hytale-node-editor-custom-mutation";
export const RAW_JSON_MUTATION_EVENT = "hytale-node-editor-raw-json-mutation";
export const LINK_MUTATION_EVENT = "hytale-node-editor-link-mutation";
export const NODE_FIELD_VALUES_DATA_KEY = "values";
export const NODE_SCHEMA_INFO_DATA_KEY = "schemaInfo";
export const NODE_COMMENT_DATA_KEY = "comment";
export const PAYLOAD_TEMPLATE_ID_KEY = "$TemplateId";
export const PAYLOAD_EDITOR_FIELDS_KEY = "$EditorFields";

export interface NodeBase extends Record<string, unknown> {
  titleOverride?: string;
  comment?: string;
  inputConnectionIndex?: number;
  unparsedMetadata?: Record<string, unknown>;
}

export interface DataNodeData extends NodeBase, NodeTemplate {}

export interface RawJsonNodeData extends NodeBase {
  data: string;
}

export interface LinkNodeData extends NodeBase {}

export interface GroupNodeData extends Record<string, unknown> {
  name: string;
  unparsedMetadata?: Record<string, unknown>;
}

export interface CommentNodeData extends Record<string, unknown> {
  name: string;
  text: string;
  fontSize?: number;
  unparsedMetadata?: Record<string, unknown>;
}

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
