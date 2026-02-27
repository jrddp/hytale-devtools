import { type NodeTemplate, type NodePin } from "@shared/node-editor/workspaceTypes";
import { type XYPosition } from "@xyflow/svelte";
import { type BBox } from "rbush";
import {
  DEFAULT_COMMENT_FONT_SIZE,
  COMMENT_NODE_TYPE,
  type CommentNodeData,
  type CommentNodeType,
  DATA_NODE_TYPE,
  type DataNodeData,
  type DataNodeType,
  DEFAULT_RAW_JSON_TEXT,
  type FlowEdge,
  type FlowNode,
  GROUP_NODE_TYPE,
  type GroupNodeData,
  type GroupNodeType,
  LINK_DEFAULT_OUTPUT_LABEL,
  LINK_NODE_TYPE,
  LINK_OUTPUT_HANDLE_ID,
  type LinkNodeData,
  type LinkNodeType,
  RAW_JSON_NODE_TYPE,
  type RawJsonNodeData,
  type RawJsonNodeType,
} from "src/common";
import { createNodeId } from "src/node-editor/utils/idUtils";
import { workspace } from "src/workspace.svelte";

type PendingConnection = {
  source?: string;
  sourceHandle?: string;
  target?: string;
  targetHandle?: string;
} & ({ source: string; sourceHandle: string } | { source?: never; sourceHandle?: never }); // ensure source and sourceHandle always come in a pair

export function createDataNodeType(
  id: string,
  position: XYPosition,
  template: NodeTemplate,
  data: Partial<DataNodeData>,
): DataNodeType {
  // deep copy to avoid mutating the template
  const clonedTemplateData: NodeTemplate = structuredClone($state.snapshot(template));

  return {
    type: DATA_NODE_TYPE,
    id,
    position,
    data: {
      hasOutputs: true,
      ...clonedTemplateData,
      ...data,
    },
  };
}

export function createRawJsonNodeType(
  id: string,
  position: XYPosition,
  data: Partial<RawJsonNodeData>,
): RawJsonNodeType {
  return {
    type: RAW_JSON_NODE_TYPE,
    id,
    position,
    data: {
      hasOutputs: false,
      jsonString: data.jsonString ?? DEFAULT_RAW_JSON_TEXT,
    },
  };
}

export function createLinkNodeType(
  id: string,
  position: XYPosition,
  data: Partial<LinkNodeData>,
): LinkNodeType {
  return {
    type: LINK_NODE_TYPE,
    id,
    position,
    data: {
      hasOutputs: true,
      outputPins: data.outputPins ?? [
        {
          schemaKey: LINK_OUTPUT_HANDLE_ID,
          localId: "Output",
          label: LINK_DEFAULT_OUTPUT_LABEL,
          multiplicity: "single",
        },
      ],
    },
  };
}

export function createCommentNodeType(
  id: string,
  position: XYPosition,
  data: Partial<CommentNodeData>,
): CommentNodeType {
  return {
    type: COMMENT_NODE_TYPE,
    id,
    position,
    data: {
      hasOutputs: false,
      name: data.name ?? "",
      text: data.text ?? "",
      fontSize: data.fontSize ?? DEFAULT_COMMENT_FONT_SIZE,
    },
  };
}

export function createGroupNodeType(
  id: string,
  position: XYPosition,
  width: number,
  height: number,
  data: Partial<GroupNodeData>,
): GroupNodeType {
  return {
    type: GROUP_NODE_TYPE,
    id,
    position,
    width,
    height,
    data: {
      hasOutputs: false,
      name: data.name ?? "Group",
    },
  };
}

export function recalculateGroupParents() {
  if (!workspace.getRootNode()?.measured) {
    console.error("recalculateGroupParents called before measurements loaded.");
    return;
  }
  let groupNodes: GroupNodeType[] = [];
  // kept separately so that groups are guaranteed to be first in order (parents must be before children in workspace.nodes array)
  let nonGroupNodes: FlowNode[] = [];
  workspace.nodes.forEach(node => {
    if (node.type === GROUP_NODE_TYPE) {
      groupNodes.push(node);
    } else {
      nonGroupNodes.push(node);
    }
  });

  // sort by size ascending (process smaller groups first for accurate parent tree)
  groupNodes.sort((a, b) => {
    return a.width * a.height - b.width * b.height;
  });

  const parentRemappings = new Map<string, string>();
  const processedGroupIds = new Set<string>();

  for (const parentGroup of groupNodes) {
    for (const child of workspace.searchNodesCollidingWith(getAbsoluteBoundingBox(parentGroup))) {
      if (child.id === parentGroup.id) continue; // ignore collision with self
      if (parentRemappings.has(child.id)) continue; // already processed
      // we can't guarentee sizing order when searching the spatial index, so we'll only parent groups that are smaller than their parent
      if (child.type === GROUP_NODE_TYPE && !processedGroupIds.has(child.id)) continue;
      parentRemappings.set(child.id, parentGroup.id);
    }
    processedGroupIds.add(parentGroup.id);
  }

  groupNodes = groupNodes.map(group => {
    const parentId = parentRemappings.get(group.id);
    return {
      ...group,
      parentId,
      position: getPositionRelativeTo(
        group,
        parentId ? workspace.getNodeById(parentId) : undefined,
      ),
    };
  });
  // note: it's important that we retain the original order of nonGroupNodes, otherwise it will cause Z-flickering
  nonGroupNodes = nonGroupNodes.map(node => {
    const parentId = parentRemappings.get(node.id);
    return {
      ...node,
      parentId,
      position: getPositionRelativeTo(node, parentId ? workspace.getNodeById(parentId) : undefined),
    };
  });

  // should now save with largest groups first, since they can parent smaller groups
  groupNodes = groupNodes.reverse();
  workspace.nodes = [...groupNodes, ...nonGroupNodes];
}

export function getAbsolutePosition(node: FlowNode): XYPosition {
  if (!node.parentId) return node.position;
  const { x: parentX, y: parentY } = getAbsolutePosition(workspace.getNodeById(node.parentId));
  return { x: parentX + node.position.x, y: parentY + node.position.y };
}

export function getAbsoluteCenterPosition(node: FlowNode): XYPosition {
  const { x, y } = getAbsolutePosition(node);
  return { x: x + node.measured.width / 2, y: y + node.measured.height / 2 };
}

// todo optimization: instead of using a distanceLimit, search rbush by bounding box of the max viewport size we would want.
export function resolveInitialFitNodeIds({
  nodes,
  rootNodeId,
  fallbackRootNodeId,
  distanceLimit,
}: {
  nodes: readonly FlowNode[];
  rootNodeId: string | undefined;
  fallbackRootNodeId: string;
  distanceLimit: number;
}): Array<{ id: string }> {
  const resolvedRootNodeId = rootNodeId ?? fallbackRootNodeId;
  const rootNode = nodes.find(node => node.id === resolvedRootNodeId);
  if (!rootNode) {
    return [];
  }

  const fitNodeIdSet = new Set([resolvedRootNodeId]);
  for (const node of nodes) {
    const dx = node.position.x - rootNode.position.x;
    const dy = node.position.y - rootNode.position.y;
    if (Math.hypot(dx, dy) <= distanceLimit) {
      fitNodeIdSet.add(node.id);
    }
  }

  return Array.from(fitNodeIdSet, nodeId => ({ id: nodeId }));
}

/** Checks handles of edges and removes conflicting edges.
 * @returns edges that were removed
 */
export function pruneConflictingEdges(connection: PendingConnection): FlowEdge[] {
  const { source, sourceHandle, target, targetHandle } = connection;
  const prunedIds = new Set<string>();
  const prunedEdges: FlowEdge[] = [];

  const conflictingInput: FlowEdge | undefined = target
    ? workspace.getIncomingConnection(target)
    : undefined;
  if (conflictingInput) {
    prunedIds.add(conflictingInput.id);
    prunedEdges.push(conflictingInput);
  }

  if (source && sourceHandle) {
    const outputPin = (workspace.getNodeById(source) as DataNodeType).data.outputPins?.find(
      pin => pin.schemaKey === sourceHandle,
    );

    if (outputPin && outputPin.multiplicity === "single") {
      for (const edge of workspace.getOutgoingConnectionsForHandle(source, sourceHandle) ?? []) {
        prunedIds.add(edge.id);
        prunedEdges.push(edge);
      }
    }
  }

  workspace.edges = workspace.edges.filter(edge => !prunedIds.has(edge.id));
  return prunedEdges;
}

export function collectAllDescendentIds(seedNodeIds: string[]): string[] {
  const targetNodeIdSet = new Set<string>();
  const recCollectDescendents = (nodeId: string) => {
    if (targetNodeIdSet.has(nodeId)) {
      return;
    }
    targetNodeIdSet.add(nodeId);
    const directDescendents = Array.from(workspace.getOutgoingConnections(nodeId).values()).flat();
    directDescendents.forEach(edge => recCollectDescendents(edge.target));
  };
  seedNodeIds.forEach(nodeId => recCollectDescendents(nodeId));
  return Array.from(targetNodeIdSet);
}

export function getPositionRelativeTo(nodeA: FlowNode, nodeB?: FlowNode): XYPosition {
  if (!nodeB) return getAbsolutePosition(nodeA);
  const { x: xA, y: yA } = getAbsolutePosition(nodeA);
  const { x: xB, y: yB } = getAbsolutePosition(nodeB);
  return { x: xA - xB, y: yA - yB };
}

export function getAbsoluteBoundingBox(node: FlowNode): BBox | undefined {
  if (!node.measured) return undefined;
  const { x, y } = getAbsolutePosition(node);
  const { width, height } = node.measured;
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

/** Returns all nodes that are not descendents of other nodes in the provided list. */
export function getRootIds(nodeIds: string[]): string[] {
  const idSet = new Set(nodeIds);
  return nodeIds.filter(nodeId => !idSet.has(getParentId(nodeId)));
}

export function getParentId(nodeId: string): string | undefined {
  return workspace.getIncomingConnection(nodeId)?.source;
}

export function getParentIdWithHandle(
  nodeId: string,
): { parentId: string; parentHandleId: string } | undefined {
  const incomingConnection = workspace.getIncomingConnection(nodeId);
  if (!incomingConnection) {
    return undefined;
  }
  return { parentId: incomingConnection.source, parentHandleId: incomingConnection.sourceHandle };
}

export function getChildIds(nodeId: string): string[] {
  const connectionMap = workspace.getOutgoingConnections(nodeId);
  if (!connectionMap) {
    return [];
  }
  return Array.from(connectionMap.values())
    .flat()
    .map(edge => edge.target);
}

export function getNodeSiblingIds(
  nodeId: string,
  scope: "same-parent-handle" | "same-parent-node",
): string[] {
  const parentId = getParentId(nodeId);
  if (!parentId) {
    return [];
  }
  if (scope === "same-parent-node") {
    return getChildIds(parentId);
  }
  if (scope === "same-parent-handle") {
    const { parentId, parentHandleId } = getParentIdWithHandle(nodeId);
    return workspace
      .getOutgoingConnectionsForHandle(parentId, parentHandleId)
      .map(edge => edge.target);
  }
}

/* Currently ordered based on y position. Should be updated. **/
export function getOrderedChildren(parentId: string): FlowNode[] {
  const parentNode = workspace.getNodeById(parentId);
  const children = [];
  for (const handle of (parentNode.data.outputPins as NodePin[]) ?? []) {
    children.push(...getOrderedChildrenForHandle(parentId, handle.schemaKey));
  }
  return children;
}

/* Ordered based on y position (LOWER Y IS HIGHER) **/
export function getOrderedChildrenForHandle(parentId: string, parentHandleId: string): FlowNode[] {
  const childIds = workspace
    .getOutgoingConnectionsForHandle(parentId, parentHandleId)
    .map(edge => edge.target);
  // y position descending to order nodes
  return childIds
    .map(childId => workspace.getNodeById(childId))
    .sort((a, b) => (a.data.inputConnectionIndex ?? -1) - (b.data.inputConnectionIndex ?? -1));
}
