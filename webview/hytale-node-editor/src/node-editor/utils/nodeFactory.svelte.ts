import type { NodeTemplate } from "@shared/node-editor/workspaceTypes";

import type { XYPosition } from "@xyflow/svelte";
import type {
  CommentNodeType,
  DataNodeType,
  FlowNode,
  FlowNodeData,
  GroupNodeType,
  LinkNodeType,
  NodeBase,
  RawJsonNodeType,
} from "src/common";
import {
  COMMENT_NODE_TYPE,
  DATA_NODE_TYPE,
  DEFAULT_GROUP_HEIGHT,
  DEFAULT_GROUP_WIDTH,
  DEFAULT_RAW_JSON_TEXT,
  GROUP_NODE_TYPE,
  LINK_DEFAULT_OUTPUT_LABEL,
  LINK_NODE_TYPE,
  LINK_OUTPUT_HANDLE_ID,
  RAW_JSON_NODE_COLOR,
  RAW_JSON_NODE_TYPE,
} from "src/constants";
import { createNodeId, createUuidV4 } from "src/node-editor/utils/idUtils";
import { getDefaultInputPin } from "src/node-editor/utils/nodeUtils.svelte";

export const GENERIC_CATEGORY = "Generic";
export const GROUP_TEMPLATE_ID = "$Group";
export const COMMENT_TEMPLATE_ID = "$Comment";
export const RAW_JSON_TEMPLATE_ID = "$RawJson";
export const LINK_TEMPLATE_ID = "$Link";

export const GROUP_TEMPLATE: NodeTemplate = {
  templateId: GROUP_TEMPLATE_ID,
  defaultTitle: "Add Group",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

export const COMMENT_TEMPLATE: NodeTemplate = {
  templateId: COMMENT_TEMPLATE_ID,
  defaultTitle: "Add Comment",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

export const LINK_TEMPLATE: NodeTemplate = {
  templateId: LINK_TEMPLATE_ID,
  defaultTitle: "Add Link",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [getDefaultInputPin()],
  outputPins: [
    {
      schemaKey: LINK_OUTPUT_HANDLE_ID,
      localId: LINK_OUTPUT_HANDLE_ID,
      label: LINK_DEFAULT_OUTPUT_LABEL,
      multiplicity: "single",
    },
  ],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

export const RAW_JSON_TEMPLATE: NodeTemplate = {
  templateId: RAW_JSON_TEMPLATE_ID,
  defaultTitle: "Raw JSON Node",
  childTypes: {},
  fieldsBySchemaKey: {},
  inputPins: [getDefaultInputPin({ color: RAW_JSON_NODE_COLOR })],
  outputPins: [],
  schemaConstants: {},
  category: GENERIC_CATEGORY,
};

export const GENERIC_TEMPLATES: NodeTemplate[] = [
  GROUP_TEMPLATE,
  COMMENT_TEMPLATE,
  LINK_TEMPLATE,
  RAW_JSON_TEMPLATE,
];

export function createNodeFromTemplate(
  template: NodeTemplate,
  position: XYPosition,
  id?: string,
  data?: Partial<FlowNodeData>,
): FlowNode {
  let node: { position: XYPosition; data: NodeBase } = {
    position,
    // deep copy to avoid mutating the template
    data: { ...structuredClone($state.snapshot(template)) },
  };
  switch (template.templateId) {
    case GROUP_TEMPLATE_ID:
      const width = (data?.width as number) ?? DEFAULT_GROUP_WIDTH;
      const height = (data?.height as number) ?? DEFAULT_GROUP_HEIGHT;
      if (data) {
        data.width = undefined;
        data.height = undefined;
      }
      return {
        ...node,
        id: id ?? createNodeId("Group"),
        type: GROUP_NODE_TYPE,
        width,
        height,
        data: {
          ...node.data,
          ...data,
        },
      } as GroupNodeType;
    case COMMENT_TEMPLATE_ID:
      return {
        ...node,
        id: id ?? createNodeId("Comment"),
        type: COMMENT_NODE_TYPE,
        data: { ...node.data, ...data },
      } as CommentNodeType;
    case LINK_TEMPLATE_ID:
      return {
        ...node,
        id: id ?? createUuidV4(),
        type: LINK_NODE_TYPE,
        data: { ...node.data, ...data },
      } as LinkNodeType;
    case RAW_JSON_TEMPLATE_ID:
      return {
        position,
        id: id ?? createNodeId("Generic"),
        type: RAW_JSON_NODE_TYPE,
        data: {
          ...node.data,
          ...data,
          jsonString: (data?.jsonString as string) ?? DEFAULT_RAW_JSON_TEXT,
        },
      } as RawJsonNodeType;
    default:
      return {
        ...node,
        id: id ?? createNodeId(template.templateId),
        type: DATA_NODE_TYPE,
        data: { ...node.data, ...data },
      } as DataNodeType;
  }
}
