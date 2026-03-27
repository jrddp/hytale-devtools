import type { NodeTemplate } from "./workspaceTypes";

export type NodeEditorGraphPosition = {
  x: number;
  y: number;
};

export type NodeBaseData = Record<string, unknown> &
  NodeTemplate & {
    inputConnectionIndex?: number;
    titleOverride?: string;
    comment?: string;
  };

export type DataNodeData = NodeBaseData & {
  unparsedMetadata?: Record<string, unknown>;
};

export type RawJsonNodeData = NodeBaseData & {
  jsonString: string;
};

export type LinkNodeData = NodeBaseData;

export type GroupNodeData = NodeBaseData;

export type CommentNodeData = NodeBaseData & {
  fontSize?: number;
};

export type NodeEditorGraphNodeType =
  | "datanode"
  | "rawjson"
  | "link"
  | "groupnode"
  | "comment";

export type NodeEditorGraphNodeData =
  | DataNodeData
  | RawJsonNodeData
  | LinkNodeData
  | GroupNodeData
  | CommentNodeData;

type NodeEditorGraphNodeBase<
  TData extends NodeEditorGraphNodeData = NodeEditorGraphNodeData,
  TType extends NodeEditorGraphNodeType = NodeEditorGraphNodeType,
> = {
  id: string;
  type: TType;
  position: NodeEditorGraphPosition;
  parentId?: string;
  data: TData;
};

export type DataGraphNode = NodeEditorGraphNodeBase<DataNodeData, "datanode">;
export type RawJsonGraphNode = NodeEditorGraphNodeBase<RawJsonNodeData, "rawjson">;
export type LinkGraphNode = NodeEditorGraphNodeBase<LinkNodeData, "link">;
export type GroupGraphNode = NodeEditorGraphNodeBase<GroupNodeData, "groupnode"> & {
  width: number;
  height: number;
};
export type CommentGraphNode = NodeEditorGraphNodeBase<CommentNodeData, "comment"> & {
  width: number;
  height: number;
};

export type NodeEditorGraphNode =
  | DataGraphNode
  | RawJsonGraphNode
  | LinkGraphNode
  | GroupGraphNode
  | CommentGraphNode;

export type NodeEditorGraphEdge = {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
};

export type NodeEditorGraphDocument = {
  workspaceId?: string;
  rootNodeId?: string;
  nodes: NodeEditorGraphNode[];
  edges: NodeEditorGraphEdge[];
};

export type NodeMoveChange = {
  nodeId: string;
  before: {
    position: NodeEditorGraphPosition;
    parentId?: string;
  };
  after: {
    position: NodeEditorGraphPosition;
    parentId?: string;
  };
};

export type NodeRenameChange = {
  nodeId: string;
  beforeTitleOverride?: string;
  afterTitleOverride?: string;
};

export type NodeResizeChange = {
  nodeId: string;
  before: {
    width?: number;
    height?: number;
  };
  after: {
    width?: number;
    height?: number;
  };
};

export type NodeEditorGraphPropertyChange =
  | {
      type: "field-value";
      nodeId: string;
      schemaKey: string;
      beforeValue: unknown;
      afterValue: unknown;
      beforeIsImplicit?: boolean;
      afterIsImplicit?: boolean;
    }
  | {
      type: "comment";
      nodeId: string;
      beforeComment?: string;
      afterComment?: string;
    }
  | {
      type: "font-size";
      nodeId: string;
      beforeFontSize?: number;
      afterFontSize?: number;
    }
  | {
      type: "raw-json";
      nodeId: string;
      beforeJsonString: string;
      afterJsonString: string;
    };

export type NodeEditorGraphEdit =
  | {
      kind: "element-list-changed";
      addedNodes: NodeEditorGraphNode[];
      removedNodes: NodeEditorGraphNode[];
      addedEdges: NodeEditorGraphEdge[];
      removedEdges: NodeEditorGraphEdge[];
      beforeRootNodeId?: string;
      afterRootNodeId?: string;
    }
  | { kind: "nodes-moved"; changes: NodeMoveChange[] }
  | { kind: "node-renamed"; changes: NodeRenameChange[] }
  | { kind: "node-resized"; changes: NodeResizeChange[] }
  | {
      kind: "node-properties-updated";
      propertyChanges: NodeEditorGraphPropertyChange[];
      resizeChanges?: NodeResizeChange[];
    };
