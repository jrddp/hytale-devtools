import CommentNode from "src/nodes/CommentNode.svelte";
import DataNode from "src/nodes/DataNode.svelte";
import GroupNode from "src/nodes/GroupNode.svelte";
import LinkNode from "src/nodes/LinkNode.svelte";
import RawJsonNode from "src/nodes/RawJsonNode.svelte";
import { Component } from "svelte";

export const DEFAULT_COMMENT_WIDTH = 200;
export const DEFAULT_COMMENT_HEIGHT = 100;
export const DEFAULT_COMMENT_FONT_SIZE = 9;

export const DEFAULT_GROUP_WIDTH = 520;
export const DEFAULT_GROUP_HEIGHT = 320;
export const MIN_GROUP_WIDTH = 180;
export const MIN_GROUP_HEIGHT = 120;

export const COMMENT_NODE_COLOR = "var(--vscode-descriptionForeground)";
export const LINK_NODE_COLOR = "var(--vscode-descriptionForeground)";
export const RAW_JSON_NODE_COLOR = "var(--vscode-focusBorder)";

export const PIN_WIDTH_PX = 10;
export const CONNECTION_RADIUS = 20;

export const DATA_NODE_TYPE = "datanode";
export const RAW_JSON_NODE_TYPE = "rawjson";
export const LINK_NODE_TYPE = "link";
export const GROUP_NODE_TYPE = "groupnode";
export const COMMENT_NODE_TYPE = "comment";

export const nodeTypes = {
  [COMMENT_NODE_TYPE]: CommentNode,
  [DATA_NODE_TYPE]: DataNode,
  [GROUP_NODE_TYPE]: GroupNode,
  [LINK_NODE_TYPE]: LinkNode,
  [RAW_JSON_NODE_TYPE]: RawJsonNode,
} as Record<string, Component>;

export const LINK_OUTPUT_HANDLE_ID = "output";
export const LINK_DEFAULT_OUTPUT_LABEL = "Children";

export const GROUP_MUTATION_EVENT = "hytale-node-editor-group-mutation";
export const COMMENT_MUTATION_EVENT = "hytale-node-editor-comment-mutation";
export const RAW_JSON_MUTATION_EVENT = "hytale-node-editor-raw-json-mutation";
export const LINK_MUTATION_EVENT = "hytale-node-editor-link-mutation";

export const DEFAULT_RAW_JSON_TEXT = "{\n\n}";
export const DEFAULT_RAW_JSON_LABEL = "Raw JSON Node";
