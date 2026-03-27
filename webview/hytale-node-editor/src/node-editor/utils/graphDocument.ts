/** Canonical node graph shape used for UI-independent graph state (e.g. for the undo/redo tree).
 * FlowNode - instance of node as used in the UI
 * NodeEditorGraphNode - canonical node shape used for UI-independent graph state (e.g. for the undo/redo tree)
 * AssetDocumentShape - the actual serialized JSON of an asset.
 */
import type {
  CommentGraphNode,
  DataGraphNode,
  GroupGraphNode,
  NodeEditorGraphDocument,
  NodeEditorGraphEdit,
  NodeEditorGraphEdge,
  NodeEditorGraphNode,
  NodeEditorGraphPropertyChange,
  RawJsonGraphNode,
  LinkGraphNode,
  NodeMoveChange,
  NodeRenameChange,
  NodeResizeChange,
} from "@shared/node-editor/graphTypes";
import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import type { FlowEdge, FlowNode } from "src/common";
import type { WorkspaceState } from "src/workspace.svelte";

function cloneGraphEdge(edge: NodeEditorGraphEdge): NodeEditorGraphEdge {
  return { ...edge };
}

function flowEdgeToGraphEdge(edge: FlowEdge): NodeEditorGraphEdge {
  return {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle ?? INPUT_HANDLE_ID,
    target: edge.target,
    targetHandle: edge.targetHandle ?? INPUT_HANDLE_ID,
  };
}

function graphNodeToFlowNode(node: NodeEditorGraphNode): FlowNode {
  const baseNode = {
    id: node.id,
    type: node.type,
    position: { ...node.position },
    parentId: node.parentId,
    data: structuredClone(node.data),
  };

  switch (node.type) {
    case "groupnode":
      return {
        ...baseNode,
        width: node.width,
        height: node.height,
      } as FlowNode;
    case "comment":
      return {
        ...baseNode,
        width: node.width,
        height: node.height,
      } as FlowNode;
    default:
      return baseNode as FlowNode;
  }
}

function flowNodeToGraphNode(node: FlowNode): NodeEditorGraphNode {
  const baseNode = {
    id: node.id,
    type: node.type,
    position: { ...node.position },
    parentId: node.parentId,
    data: structuredClone(node.data),
  };

  switch (node.type) {
    case "datanode":
      return baseNode as DataGraphNode;
    case "rawjson":
      return baseNode as RawJsonGraphNode;
    case "link":
      return baseNode as LinkGraphNode;
    case "groupnode":
      return {
        ...baseNode,
        width: node.width,
        height: node.height,
      } as GroupGraphNode;
    case "comment":
      return {
        ...baseNode,
        width: node.width,
        height: node.height,
      } as CommentGraphNode;
  }
}

export function createNodeResizeChange(
  nodeId: string,
  before: { width?: number; height?: number },
  after: { width?: number; height?: number },
): NodeResizeChange | undefined {
  if (before.width === after.width && before.height === after.height) {
    return undefined;
  }

  return {
    nodeId,
    before,
    after,
  };
}

export function createNodePropertiesUpdatedEdit(
  propertyChanges: NodeEditorGraphPropertyChange[],
  resizeChanges: NodeResizeChange[] = [],
): Extract<NodeEditorGraphEdit, { kind: "node-properties-updated" }> | undefined {
  if (propertyChanges.length === 0 && resizeChanges.length === 0) {
    return undefined;
  }

  return {
    kind: "node-properties-updated",
    propertyChanges,
    resizeChanges: resizeChanges.length > 0 ? resizeChanges : undefined,
  };
}

export function buildElementListChangedEdit(
  beforeDocument: NodeEditorGraphDocument,
  state: WorkspaceState,
  workspaceId?: string,
): Extract<NodeEditorGraphEdit, { kind: "element-list-changed" }> | undefined {
  const afterDocument = workspaceStateToGraphDocument(state, workspaceId);
  const beforeNodeIds = new Set(beforeDocument.nodes.map(node => node.id));
  const afterNodeIds = new Set(afterDocument.nodes.map(node => node.id));
  const beforeEdgeIds = new Set(beforeDocument.edges.map(edge => edge.id));
  const afterEdgeIds = new Set(afterDocument.edges.map(edge => edge.id));

  const addedNodes = afterDocument.nodes.filter(node => !beforeNodeIds.has(node.id));
  const removedNodes = beforeDocument.nodes.filter(node => !afterNodeIds.has(node.id));
  const addedEdges = afterDocument.edges.filter(edge => !beforeEdgeIds.has(edge.id));
  const removedEdges = beforeDocument.edges.filter(edge => !afterEdgeIds.has(edge.id));

  if (
    addedNodes.length === 0 &&
    removedNodes.length === 0 &&
    addedEdges.length === 0 &&
    removedEdges.length === 0 &&
    beforeDocument.rootNodeId === afterDocument.rootNodeId
  ) {
    return undefined;
  }

  return {
    kind: "element-list-changed",
    addedNodes,
    removedNodes,
    addedEdges,
    removedEdges,
    beforeRootNodeId: beforeDocument.rootNodeId,
    afterRootNodeId: afterDocument.rootNodeId,
  };
}

export function graphEditRequiresDocumentRefresh(edit: NodeEditorGraphEdit): boolean {
  return (
    edit.kind === "element-list-changed" ||
    edit.kind === "nodes-moved" ||
    edit.kind === "node-resized"
  );
}

export function graphDocumentToWorkspaceState(document: NodeEditorGraphDocument): WorkspaceState {
  return {
    nodes: document.nodes.map(graphNodeToFlowNode),
    edges: document.edges.map(cloneGraphEdge) as FlowEdge[],
    rootNodeId: document.rootNodeId,
  };
}

export function workspaceStateToGraphDocument(state: WorkspaceState, workspaceId?: string): NodeEditorGraphDocument {
  return {
    workspaceId,
    rootNodeId: state.rootNodeId,
    nodes: state.nodes.map(flowNodeToGraphNode),
    edges: state.edges.map(flowEdgeToGraphEdge),
  };
}

function buildNodeIndex(document: NodeEditorGraphDocument): Map<string, NodeEditorGraphNode> {
  return new Map(document.nodes.map(node => [node.id, node]));
}

export function buildNodesMovedEdit(
  beforeDocument: NodeEditorGraphDocument,
  nodes: FlowNode[],
): Extract<NodeEditorGraphEdit, { kind: "nodes-moved" }> | undefined {
  const beforeNodesById = buildNodeIndex(beforeDocument);
  const changes: NodeMoveChange[] = [];

  for (const node of nodes) {
    const beforeNode = beforeNodesById.get(node.id);
    if (!beforeNode) {
      continue;
    }

    if (
      beforeNode.position.x === node.position.x &&
      beforeNode.position.y === node.position.y &&
      beforeNode.parentId === node.parentId
    ) {
      continue;
    }

    changes.push({
      nodeId: node.id,
      before: {
        position: { ...beforeNode.position },
        parentId: beforeNode.parentId,
      },
      after: {
        position: { ...node.position },
        parentId: node.parentId,
      },
    });
  }

  return changes.length > 0 ? { kind: "nodes-moved", changes } : undefined;
}

export function buildNodeRenamedEdit(
  beforeDocument: NodeEditorGraphDocument,
  nodes: FlowNode[],
): Extract<NodeEditorGraphEdit, { kind: "node-renamed" }> | undefined {
  const beforeNodesById = buildNodeIndex(beforeDocument);
  const changes: NodeRenameChange[] = [];

  for (const node of nodes) {
    const beforeNode = beforeNodesById.get(node.id);
    if (!beforeNode || beforeNode.data.titleOverride === node.data.titleOverride) {
      continue;
    }

    changes.push({
      nodeId: node.id,
      beforeTitleOverride: beforeNode.data.titleOverride,
      afterTitleOverride: node.data.titleOverride,
    });
  }

  return changes.length > 0 ? { kind: "node-renamed", changes } : undefined;
}

export function buildNodeResizedEdit(
  beforeDocument: NodeEditorGraphDocument,
  nodes: FlowNode[],
): Extract<NodeEditorGraphEdit, { kind: "node-resized" }> | undefined {
  const beforeNodesById = buildNodeIndex(beforeDocument);
  const changes: NodeResizeChange[] = [];

  for (const node of nodes) {
    const beforeNode = beforeNodesById.get(node.id);
    if (!beforeNode || ("width" in beforeNode) === false || ("height" in beforeNode) === false) {
      continue;
    }

    if (beforeNode.width === node.width && beforeNode.height === node.height) {
      continue;
    }

    changes.push({
      nodeId: node.id,
      before: {
        width: beforeNode.width,
        height: beforeNode.height,
      },
      after: {
        width: node.width,
        height: node.height,
      },
    });
  }

  return changes.length > 0 ? { kind: "node-resized", changes } : undefined;
}

export function applyGraphEditToWorkspaceState(
  state: WorkspaceState,
  edit: NodeEditorGraphEdit,
): WorkspaceState {
  switch (edit.kind) {
    case "element-list-changed":
      return applyElementListChangedToWorkspaceState(state, edit);
    case "nodes-moved":
      return applyNodesMovedToWorkspaceState(state, edit.changes);
    case "node-renamed":
      return applyNodeRenamedToWorkspaceState(state, edit.changes);
    case "node-resized":
      return applyNodeResizedToWorkspaceState(state, edit.changes);
    case "node-properties-updated":
      return applyNodePropertiesUpdatedToWorkspaceState(state, edit);
  }
}

function applyElementListChangedToWorkspaceState(
  state: WorkspaceState,
  edit: Extract<NodeEditorGraphEdit, { kind: "element-list-changed" }>,
): WorkspaceState {
  const removedNodeIds = new Set(edit.removedNodes.map(node => node.id));
  const removedEdgeIds = new Set(edit.removedEdges.map(edge => edge.id));

  return {
    ...state,
    nodes: state.nodes
      .filter(node => !removedNodeIds.has(node.id))
      .concat(edit.addedNodes.map(graphNodeToFlowNode)) as FlowNode[],
    edges: state.edges
      .filter(edge => !removedEdgeIds.has(edge.id))
      .concat(edit.addedEdges.map(cloneGraphEdge)) as FlowEdge[],
    rootNodeId: edit.afterRootNodeId,
  };
}

function applyNodesMovedToWorkspaceState(
  state: WorkspaceState,
  changes: NodeMoveChange[],
): WorkspaceState {
  const changesByNodeId = new Map(changes.map(change => [change.nodeId, change]));
  return {
    ...state,
    nodes: state.nodes.map(node => {
      const change = changesByNodeId.get(node.id);
      if (!change) {
        return node;
      }

      return {
        ...node,
        position: { ...change.after.position },
        parentId: change.after.parentId,
      };
    }) as FlowNode[],
  };
}

function applyNodeRenamedToWorkspaceState(
  state: WorkspaceState,
  changes: NodeRenameChange[],
): WorkspaceState {
  const changesByNodeId = new Map(changes.map(change => [change.nodeId, change]));
  return {
    ...state,
    nodes: state.nodes.map(node => {
      const change = changesByNodeId.get(node.id);
      if (!change) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          titleOverride: change.afterTitleOverride,
        },
      };
    }) as FlowNode[],
  };
}

function applyNodeResizedToWorkspaceState(
  state: WorkspaceState,
  changes: NodeResizeChange[],
): WorkspaceState {
  const changesByNodeId = new Map(changes.map(change => [change.nodeId, change]));
  return {
    ...state,
    nodes: state.nodes.map(node => {
      const change = changesByNodeId.get(node.id);
      if (!change) {
        return node;
      }

      return {
        ...node,
        width: change.after.width ?? node.width,
        height: change.after.height ?? node.height,
        measured:
          change.after.width !== undefined || change.after.height !== undefined
            ? {
                width: change.after.width ?? node.measured?.width ?? node.width,
                height: change.after.height ?? node.measured?.height ?? node.height,
              }
            : node.measured,
      };
    }) as FlowNode[],
  };
}

function applyNodePropertiesUpdatedToWorkspaceState(
  state: WorkspaceState,
  edit: Extract<NodeEditorGraphEdit, { kind: "node-properties-updated" }>,
): WorkspaceState {
  const propertyChangesByNodeId = new Map<string, NodeEditorGraphPropertyChange[]>();
  for (const change of edit.propertyChanges) {
    if (!propertyChangesByNodeId.has(change.nodeId)) {
      propertyChangesByNodeId.set(change.nodeId, []);
    }
    propertyChangesByNodeId.get(change.nodeId)!.push(change);
  }

  let nextState = state;

  if (propertyChangesByNodeId.size > 0) {
    nextState = {
      ...nextState,
      nodes: nextState.nodes.map(node => {
        const propertyChanges = propertyChangesByNodeId.get(node.id);
        if (!propertyChanges) {
          return node;
        }

        const nextNode = {
          ...node,
          data: {
            ...node.data,
          },
        };

        for (const change of propertyChanges) {
          switch (change.type) {
            case "field-value":
              if (nextNode.data.fieldsBySchemaKey?.[change.schemaKey]) {
                nextNode.data.fieldsBySchemaKey = {
                  ...nextNode.data.fieldsBySchemaKey,
                  [change.schemaKey]: {
                    ...nextNode.data.fieldsBySchemaKey[change.schemaKey],
                    value: change.afterValue,
                    isImplicit: change.afterIsImplicit,
                  },
                };
              }
              break;
            case "comment":
              nextNode.data.comment = change.afterComment;
              break;
            case "font-size":
              if ("fontSize" in nextNode.data) {
                nextNode.data.fontSize = change.afterFontSize;
              }
              break;
            case "raw-json":
              if ("jsonString" in nextNode.data) {
                nextNode.data.jsonString = change.afterJsonString;
              }
              break;
          }
        }

        return nextNode;
      }) as FlowNode[],
    };
  }

  if (edit.resizeChanges?.length) {
    nextState = applyNodeResizedToWorkspaceState(nextState, edit.resizeChanges);
  }

  return nextState;
}
