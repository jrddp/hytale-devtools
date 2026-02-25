import {
  COMMENT_NODE_TYPE,
  DATA_NODE_TYPE,
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
  type CommentNodeType,
  type DataNodeType,
  type GroupNodeType,
  type LinkNodeType,
  type FlowNode,
  type RawJsonNodeType,
} from "./graphTypes.js";

export function isDataNode(node: FlowNode | undefined): node is DataNodeType {
  return node?.type === DATA_NODE_TYPE;
}

export function isRawJsonNode(node: FlowNode | undefined): node is RawJsonNodeType {
  return node?.type === RAW_JSON_NODE_TYPE;
}

export function isLinkNode(node: FlowNode | undefined): node is LinkNodeType {
  return node?.type === LINK_NODE_TYPE;
}

export function isGroupNode(node: FlowNode | undefined): node is GroupNodeType {
  return node?.type === GROUP_NODE_TYPE;
}

export function isCommentNode(node: FlowNode | undefined): node is CommentNodeType {
  return node?.type === COMMENT_NODE_TYPE;
}

export function isRuntimeNode(
  node: FlowNode | undefined
): node is DataNodeType | RawJsonNodeType {
  return isDataNode(node) || isRawJsonNode(node);
}

export function isMetadataNode(
  node: FlowNode | undefined
): node is LinkNodeType | GroupNodeType | CommentNodeType {
  return isLinkNode(node) || isGroupNode(node) || isCommentNode(node);
}
