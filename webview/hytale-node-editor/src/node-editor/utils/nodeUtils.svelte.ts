import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import { type NodePin } from "@shared/node-editor/workspaceTypes";
import { type Connection, type XYPosition } from "@xyflow/svelte";
import { type BBox } from "rbush";
import {
  type DataNodeType,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type GroupNodeType,
} from "src/common";
import { GROUP_NODE_TYPE } from "src/constants";
import { workspace } from "src/workspace.svelte";

export type PendingConnection =
  | {
      source: string;
      sourceHandle: string;
      target?: string | null;
      targetHandle?: string;
    }
  | {
      source?: string | null;
      sourceHandle?: string | null;
      target: string;
      targetHandle?: string | null;
    };

// updateNodeData can't be called outside of a component, so we pass this.
/** [nodeId, dataUpdates] */
export type NodeDataUpdates = [string, Partial<FlowNodeData>];
export type NodeUpdates = [string, Partial<FlowNode>];

export function getDefaultInputPin(data?: Partial<NodePin>): NodePin {
  return {
    ...data,
    schemaKey: INPUT_HANDLE_ID,
    localId: "Input",
    label: "Input",
    multiplicity: "single",
  };
}

export function isValidConnection(connection: Connection | FlowEdge): boolean {
  if (!connection.sourceHandle) return false;
  const sourceNode = workspace.getNodeById(connection.source) as DataNodeType;
  const targetNode = workspace.getNodeById(connection.target) as DataNodeType;
  if (!sourceNode.data.childTypes || !targetNode.data.templateId) return false;
  const variantKindOrTemplateId = sourceNode.data.childTypes[connection.sourceHandle];
  const variantKind = workspace.context.variantKindsById[variantKindOrTemplateId];
  const templateId = targetNode.data.templateId;
  if (variantKind) {
    return Object.values(variantKind.Variants).includes(templateId);
  }
  return variantKindOrTemplateId === templateId;
}

export function getOutputPin(nodeId: string, handleId: string): NodePin | undefined {
  const node = workspace.getNodeById(nodeId);
  if (!node.data.hasOutputs) return undefined;
  return node.data.outputPins?.find(pin => pin.schemaKey === handleId);
}

export function recalculateGroupParents() {
  if (!workspace.areNodesMeasured) {
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
export function resolveFitViewNodeIds({
  nodes,
  rootNodeId,
  maxDistanceToRoot,
}: {
  nodes: readonly FlowNode[];
  rootNodeId: string | undefined;
  maxDistanceToRoot?: number;
}): Array<{ id: string }> {
  if (nodes.length === 0) {
    return [];
  }

  if (maxDistanceToRoot == undefined || !rootNodeId) {
    return Array.from(nodes, node => ({ id: node.id }));
  }

  const rootNode = nodes.find(node => node.id === rootNodeId);
  if (!rootNode) {
    return Array.from(nodes, node => ({ id: node.id }));
  }

  const rootCenter = getAbsoluteCenterPosition(rootNode);
  const fitNodeIdSet = new Set([rootNodeId]);
  for (const node of nodes) {
    const nodeCenter = getAbsoluteCenterPosition(node);
    const dx = nodeCenter.x - rootCenter.x;
    const dy = nodeCenter.y - rootCenter.y;
    if (Math.hypot(dx, dy) <= maxDistanceToRoot) {
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
  const pruneEdge = (edge: FlowEdge | undefined) => {
    if (!edge || prunedIds.has(edge.id)) {
      return;
    }

    prunedIds.add(edge.id);
    prunedEdges.push(edge);
  };

  const conflictingInput: FlowEdge | undefined = target
    ? workspace.getIncomingConnection(target)
    : undefined;
  pruneEdge(conflictingInput);

  if (source && sourceHandle) {
    const outputPin = (workspace.getNodeById(source) as DataNodeType).data.outputPins?.find(
      pin => pin.schemaKey === sourceHandle,
    );

    if (outputPin && outputPin.multiplicity === "single") {
      for (const edge of workspace.getOutgoingConnectionsForHandle(source, sourceHandle) ?? []) {
        pruneEdge(edge);
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
  const { width, height } = node.measured ?? {
    width: node.width,
    height: node.height,
  };
  if (width == undefined || height == undefined) return undefined;
  const { x, y } = getAbsolutePosition(node);
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
  return {
    parentId: incomingConnection.source,
    parentHandleId: incomingConnection.sourceHandle,
  };
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

export function getAllSiblingOrderUpdates(): NodeDataUpdates[] {
  const childIdsByHandle = new Map<string, string[]>();

  for (const edge of workspace.edges) {
    if (!edge.sourceHandle) {
      continue;
    }

    const key = `${edge.source}:${edge.sourceHandle}`;
    const childIds = childIdsByHandle.get(key);
    if (childIds) {
      childIds.push(edge.target);
  } else {
      childIdsByHandle.set(key, [edge.target]);
    }
  }

  const absoluteYByNodeId = new Map<string, number>();
  const getAbsoluteY = (nodeId: string) => {
    const cached = absoluteYByNodeId.get(nodeId);
    if (cached != undefined) {
      return cached;
    }

    const absoluteY = getAbsolutePosition(workspace.getNodeById(nodeId)).y;
    absoluteYByNodeId.set(nodeId, absoluteY);
    return absoluteY;
  };

  const updates: NodeDataUpdates[] = [];
  const nodesWithIncomingOrder = new Set<string>();

  for (const childIds of childIdsByHandle.values()) {
    if (childIds.length === 0) {
      continue;
    }

    childIds.forEach(childId => nodesWithIncomingOrder.add(childId));

    if (childIds.length === 1) {
      const node = workspace.getNodeById(childIds[0]);
      if (node.data.inputConnectionIndex != undefined) {
        updates.push([node.id, { inputConnectionIndex: undefined }]);
      }
      continue;
    }

    const orderedChildren = childIds
      .map(childId => workspace.getNodeById(childId))
      .sort((nodeA, nodeB) => getAbsoluteY(nodeA.id) - getAbsoluteY(nodeB.id));

    orderedChildren.forEach((node, index) => {
      if ((node.data.inputConnectionIndex ?? -1) !== index) {
        updates.push([node.id, { inputConnectionIndex: index }]);
      }
      });
  }

  for (const node of workspace.nodes) {
    if (!nodesWithIncomingOrder.has(node.id) && node.data.inputConnectionIndex != undefined) {
      updates.push([node.id, { inputConnectionIndex: undefined }]);
    }
  }

  return updates;
}

/** Returns list of node ids for the groups that the provided node is a descendent of, in order of parent to child. */
export function getGroupList(nodeId: string): string[] {
  const parentId = workspace.getNodeById(nodeId).parentId;
  if (!parentId) {
    return [];
  }
  return [...getGroupList(parentId), parentId];
}
