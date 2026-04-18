import { INPUT_HANDLE_ID } from "@shared/node-editor/sharedConstants";
import { getResolvedChildSlots } from "@shared/node-editor/childSlotUtils";
import {
  areConnectionTypesCompatible,
  GENERIC_CONNECTION_TYPE,
  getCompatibleInputHandleId,
  getCompatibleOutputHandleId,
  templateHasCompatibleInput,
  templateHasCompatibleOutput,
} from "@shared/node-editor/pinUtils";
import { type NodePin, type NodeTemplate } from "@shared/node-editor/workspaceTypes";
import { type Connection, type XYPosition } from "@xyflow/svelte";
import { type BBox } from "rbush";
import {
  type DataNodeType,
  type FlowEdge,
  type FlowNode,
  type FlowNodeData,
  type GroupNodeType,
} from "@node-editor/common";
import { GROUP_NODE_TYPE } from "@node-editor/constants";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

export {
  areConnectionTypesCompatible,
  getCompatibleInputHandleId,
  getCompatibleOutputHandleId,
  templateHasCompatibleInput,
  templateHasCompatibleOutput,
} from "@shared/node-editor/pinUtils";

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
    connectionType: GENERIC_CONNECTION_TYPE,
    localId: "Input",
    label: "Input",
    multiplicity: "single",
  };
}

export function isValidConnection(
  connection: Connection | FlowEdge,
  session: NodeEditorSession,
): boolean {
  if (!connection.sourceHandle) return false;
  const sourceNode = session.getNodeById(connection.source) as DataNodeType;
  const targetNode = session.getNodeById(connection.target) as DataNodeType;
  const sourcePin = sourceNode.data.outputPins?.find(pin => pin.schemaKey === connection.sourceHandle);
  const targetPin = targetNode.data.inputPins?.find(pin => pin.schemaKey === connection.targetHandle);
  if (!sourcePin || !targetPin) return false;
  return areConnectionTypesCompatible(
    sourcePin.connectionType,
    targetPin.connectionType,
    session.context.connectionTypesById,
  );
}

function getSerializedChildIdsByHandle(
  nodeId: string,
  handleId: string,
  side: "input" | "output",
  session: NodeEditorSession,
): string[] {
  if (side === "output") {
    return session.getOutgoingConnectionsForHandle(nodeId, handleId).map(edge => edge.target);
  }

  return session.getIncomingConnectionsForHandle(nodeId, handleId).map(edge => edge.source);
}

function getSerializedParentConnectionForHandle(
  nodeId: string,
  handleId: string,
  session: NodeEditorSession,
): { parentId: string; parentHandleId: string } | undefined {
  const outgoingEdges = session.getOutgoingConnections(nodeId);
  if (!outgoingEdges) {
    return undefined;
  }

  for (const edges of outgoingEdges.values()) {
    for (const edge of edges) {
      if (edge.source === edge.target) {
        continue;
      }

      const targetNode = session.getNodeById(edge.target) as DataNodeType | undefined;
      if (!targetNode || targetNode.type !== "datanode") {
        continue;
      }

      const resolvedChildSlot = getResolvedChildSlots(targetNode.data).find(
        slot => slot.side === "input" && slot.pin.schemaKey === edge.targetHandle,
      );
      if (!resolvedChildSlot) {
        continue;
      }

      if (edge.source === nodeId && handleId === edge.sourceHandle) {
        return {
          parentId: edge.target,
          parentHandleId: edge.targetHandle,
        };
      }
    }
  }

  return undefined;
}

export function getOutputPin(
  nodeId: string,
  handleId: string,
  session: NodeEditorSession,
): NodePin | undefined {
  const node = session.getNodeById(nodeId);
  return node.data.outputPins?.find(pin => pin.schemaKey === handleId);
}

export function getInputPin(
  nodeId: string,
  handleId: string,
  session: NodeEditorSession,
): NodePin | undefined {
  const node = session.getNodeById(nodeId);
  return node.data.inputPins?.find(pin => pin.schemaKey === handleId);
}

export function recalculateGroupParents(session: NodeEditorSession) {
  if (!session.areNodesMeasured) {
    console.error("recalculateGroupParents called before measurements loaded.");
    return;
  }
  let groupNodes: GroupNodeType[] = [];
  // kept separately so that groups are guaranteed to be first in order (parents must be before children in workspace.nodes array)
  let nonGroupNodes: FlowNode[] = [];
  session.nodes.forEach(node => {
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
    for (const child of session.searchNodesCollidingWith(getAbsoluteBoundingBox(parentGroup, session))) {
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
        parentId ? session.getNodeById(parentId) : undefined,
        session,
      ),
    };
  });
  // note: it's important that we retain the original order of nonGroupNodes, otherwise it will cause Z-flickering
  nonGroupNodes = nonGroupNodes.map(node => {
    const parentId = parentRemappings.get(node.id);
    return {
      ...node,
      parentId,
      position: getPositionRelativeTo(node, parentId ? session.getNodeById(parentId) : undefined, session),
    };
  });

  // should now save with largest groups first, since they can parent smaller groups
  groupNodes = groupNodes.reverse();
  session.nodes = [...groupNodes, ...nonGroupNodes];
}

export function getAbsolutePosition(node: FlowNode, session: NodeEditorSession): XYPosition {
  if (!node.parentId) return node.position;
  const { x: parentX, y: parentY } = getAbsolutePosition(session.getNodeById(node.parentId), session);
  return { x: parentX + node.position.x, y: parentY + node.position.y };
}

export function getAbsoluteCenterPosition(node: FlowNode, session: NodeEditorSession): XYPosition {
  const { x, y } = getAbsolutePosition(node, session);
  return { x: x + node.measured.width / 2, y: y + node.measured.height / 2 };
}

// todo optimization: instead of using a distanceLimit, search rbush by bounding box of the max viewport size we would want.
export function resolveFitViewNodeIds({
  nodes,
  rootNodeId,
  maxDistanceToRoot,
  session,
}: {
  nodes: readonly FlowNode[];
  rootNodeId: string | undefined;
  maxDistanceToRoot?: number;
  session: NodeEditorSession;
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

  const rootCenter = getAbsoluteCenterPosition(rootNode, session);
  const fitNodeIdSet = new Set([rootNodeId]);
  for (const node of nodes) {
    const nodeCenter = getAbsoluteCenterPosition(node, session);
    const dx = nodeCenter.x - rootCenter.x;
    const dy = nodeCenter.y - rootCenter.y;
    if (Math.hypot(dx, dy) <= maxDistanceToRoot) {
      fitNodeIdSet.add(node.id);
    }
  }

  return Array.from(fitNodeIdSet, nodeId => ({ id: nodeId }));
}

/** Collects the conflicting edges for a partial or complete pending connection without mutating the session. */
export function collectConflictingEdges(
  connection: PendingConnection,
  session: NodeEditorSession,
  additionalEdges: FlowEdge[] = [],
): FlowEdge[] {
  const { source, sourceHandle, target, targetHandle } = connection;
  const conflictingIds = new Set<string>();
  const conflictingEdges: FlowEdge[] = [];
  const collectEdge = (edge: FlowEdge | undefined) => {
    if (!edge || conflictingIds.has(edge.id)) {
      return;
    }

    conflictingIds.add(edge.id);
    conflictingEdges.push(edge);
  };
  const collectEdges = (edges: FlowEdge[] | undefined) => {
    for (const edge of edges ?? []) {
      collectEdge(edge);
    }
  };
  const collectAdditionalEdges = (
    predicate: (edge: FlowEdge) => boolean,
  ) => {
    for (const edge of additionalEdges) {
      if (predicate(edge)) {
        collectEdge(edge);
      }
    }
  };

  if (target && targetHandle) {
    const targetPin = getInputPin(target, targetHandle, session);
    if (targetPin?.multiplicity === "single") {
      collectEdges(session.getIncomingConnectionsForHandle(target, targetHandle));
      collectAdditionalEdges(
        edge =>
          edge.target === target &&
          (edge.targetHandle ?? INPUT_HANDLE_ID) === targetHandle,
      );
    }
  }

  if (source && sourceHandle) {
    const outputPin = (session.getNodeById(source) as DataNodeType).data.outputPins?.find(
      pin => pin.schemaKey === sourceHandle,
    );

    if (outputPin && outputPin.multiplicity === "single") {
      collectEdges(session.getOutgoingConnectionsForHandle(source, sourceHandle));
      collectAdditionalEdges(
        edge => edge.source === source && edge.sourceHandle === sourceHandle,
      );
    }
  }

  return conflictingEdges;
}

export function collectConflictingEdgeIds(
  connection: PendingConnection,
  session: NodeEditorSession,
): string[] {
  return collectConflictingEdges(connection, session).map(edge => edge.id);
}

export function collectAllDescendentIds(
  seedNodeIds: string[],
  session: NodeEditorSession,
): string[] {
  const targetNodeIdSet = new Set<string>();
  const recCollectDescendents = (nodeId: string) => {
    if (targetNodeIdSet.has(nodeId)) {
      return;
    }
    targetNodeIdSet.add(nodeId);
    getChildIds(nodeId, session).forEach(childId => recCollectDescendents(childId));
  };
  seedNodeIds.forEach(nodeId => recCollectDescendents(nodeId));
  return Array.from(targetNodeIdSet);
}

export function getPositionRelativeTo(
  nodeA: FlowNode,
  nodeB: FlowNode | undefined,
  session: NodeEditorSession,
): XYPosition {
  if (!nodeB) return getAbsolutePosition(nodeA, session);
  const { x: xA, y: yA } = getAbsolutePosition(nodeA, session);
  const { x: xB, y: yB } = getAbsolutePosition(nodeB, session);
  return { x: xA - xB, y: yA - yB };
}

export function getAbsoluteBoundingBox(node: FlowNode, session: NodeEditorSession): BBox | undefined {
  const { width, height } = node.measured ?? {
    width: node.width,
    height: node.height,
  };
  if (width == undefined || height == undefined) return undefined;
  const { x, y } = getAbsolutePosition(node, session);
  return { minX: x, minY: y, maxX: x + width, maxY: y + height };
}

/** Returns all nodes that are not descendents of other nodes in the provided list. */
export function getRootIds(nodeIds: string[], session: NodeEditorSession): string[] {
  const idSet = new Set(nodeIds);
  return nodeIds.filter(nodeId => !idSet.has(getParentId(nodeId, session)));
}

export function getParentId(nodeId: string, session: NodeEditorSession): string | undefined {
  const node = session.getNodeById(nodeId) as DataNodeType | undefined;
  if (!node || node.type !== "datanode") {
    return session.getIncomingConnection(nodeId)?.source;
  }

  for (const pin of node.data.inputPins ?? []) {
    const directIncoming = session.getIncomingConnection(nodeId, pin.schemaKey);
    if (
      directIncoming &&
      !getResolvedChildSlots(node.data).some(
        slot => slot.side === "input" && slot.pin.schemaKey === pin.schemaKey,
      )
    ) {
      return directIncoming.source;
    }
  }

  for (const pin of node.data.outputPins ?? []) {
    const parentConnection = getSerializedParentConnectionForHandle(nodeId, pin.schemaKey, session);
    if (parentConnection) {
      return parentConnection.parentId;
    }
  }

  return undefined;
}

export function getParentIdWithHandle(
  nodeId: string,
  session: NodeEditorSession,
): { parentId: string; parentHandleId: string } | undefined {
  const node = session.getNodeById(nodeId) as DataNodeType | undefined;
  if (!node || node.type !== "datanode") {
    const incomingConnection = session.getIncomingConnection(nodeId);
    if (!incomingConnection) {
      return undefined;
    }
    return {
      parentId: incomingConnection.source,
      parentHandleId: incomingConnection.sourceHandle,
    };
  }

  for (const pin of node.data.inputPins ?? []) {
    const directIncoming = session.getIncomingConnection(nodeId, pin.schemaKey);
    if (
      directIncoming &&
      !getResolvedChildSlots(node.data).some(
        slot => slot.side === "input" && slot.pin.schemaKey === pin.schemaKey,
      )
    ) {
      return {
        parentId: directIncoming.source,
        parentHandleId: directIncoming.sourceHandle,
      };
    }
  }

  for (const pin of node.data.outputPins ?? []) {
    const parentConnection = getSerializedParentConnectionForHandle(nodeId, pin.schemaKey, session);
    if (parentConnection) {
      return parentConnection;
    }
  }

  return undefined;
}

export function getChildIds(nodeId: string, session: NodeEditorSession): string[] {
  const node = session.getNodeById(nodeId) as DataNodeType | undefined;
  if (!node || node.type !== "datanode") {
    return [];
  }

  return getResolvedChildSlots(node.data).flatMap(slot =>
    getSerializedChildIdsByHandle(nodeId, slot.pin.schemaKey, slot.side, session),
  );
}

export function getNodeSiblingIds(
  nodeId: string,
  scope: "same-parent-handle" | "same-parent-node",
  session: NodeEditorSession,
): string[] {
  const parentId = getParentId(nodeId, session);
  if (!parentId) {
    return [];
  }
  if (scope === "same-parent-node") {
    return getChildIds(parentId, session);
  }
  if (scope === "same-parent-handle") {
    const parentWithHandle = getParentIdWithHandle(nodeId, session);
    if (!parentWithHandle) {
      return [];
    }
    const parentNode = session.getNodeById(parentWithHandle.parentId) as DataNodeType | undefined;
    const slot = parentNode?.type === "datanode"
      ? getResolvedChildSlots(parentNode.data).find(
          resolvedSlot => resolvedSlot.pin.schemaKey === parentWithHandle.parentHandleId,
        )
      : undefined;
    return slot
      ? getSerializedChildIdsByHandle(
          parentWithHandle.parentId,
          parentWithHandle.parentHandleId,
          slot.side,
          session,
        )
      : session
          .getOutgoingConnectionsForHandle(parentWithHandle.parentId, parentWithHandle.parentHandleId)
          .map(edge => edge.target);
  }

  return [];
}

/* Currently ordered based on y position. Should be updated. **/
export function getOrderedChildren(parentId: string, session: NodeEditorSession): FlowNode[] {
  const parentNode = session.getNodeById(parentId) as DataNodeType | undefined;
  if (!parentNode || parentNode.type !== "datanode") {
    return [];
  }
  const children = [];
  for (const slot of getResolvedChildSlots(parentNode.data)) {
    children.push(...getOrderedChildrenForHandle(parentId, slot.pin.schemaKey, session));
  }
  return children;
}

/* Ordered based on y position (LOWER Y IS HIGHER) **/
export function getOrderedChildrenForHandle(
  parentId: string,
  parentHandleId: string,
  session: NodeEditorSession,
): FlowNode[] {
  const parentNode = session.getNodeById(parentId) as DataNodeType | undefined;
  const slot = parentNode?.type === "datanode"
    ? getResolvedChildSlots(parentNode.data).find(resolvedSlot => resolvedSlot.pin.schemaKey === parentHandleId)
    : undefined;
  const childIds = slot
    ? getSerializedChildIdsByHandle(parentId, parentHandleId, slot.side, session)
    : session.getOutgoingConnectionsForHandle(parentId, parentHandleId).map(edge => edge.target);
  // y position descending to order nodes
  return childIds
    .map(childId => session.getNodeById(childId))
    .sort((a, b) => (a.data.inputConnectionIndex ?? -1) - (b.data.inputConnectionIndex ?? -1));
}

export function getAllSiblingOrderUpdates(session: NodeEditorSession): NodeDataUpdates[] {
  const childIdsByHandle = new Map<string, string[]>();
  const processedHandles = new Set<string>();

  for (const node of session.nodes) {
    if (node.type !== "datanode") {
      continue;
    }

    for (const slot of getResolvedChildSlots(node.data)) {
      if (slot.pin.multiplicity === "single") {
        continue;
      }

      const key = `${node.id}:${slot.pin.schemaKey}`;
      if (processedHandles.has(key)) {
        continue;
      }

      processedHandles.add(key);
      childIdsByHandle.set(
        key,
        getSerializedChildIdsByHandle(node.id, slot.pin.schemaKey, slot.side, session),
      );
    }
  }

  const absoluteYByNodeId = new Map<string, number>();
  const getAbsoluteY = (nodeId: string) => {
    const cached = absoluteYByNodeId.get(nodeId);
    if (cached != undefined) {
      return cached;
    }

    const absoluteY = getAbsolutePosition(session.getNodeById(nodeId), session).y;
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
      const node = session.getNodeById(childIds[0]);
      if (node.data.inputConnectionIndex != undefined) {
        updates.push([node.id, { inputConnectionIndex: undefined }]);
      }
      continue;
    }

    const orderedChildren = childIds
      .map(childId => session.getNodeById(childId))
      .sort((nodeA, nodeB) => getAbsoluteY(nodeA.id) - getAbsoluteY(nodeB.id));

    orderedChildren.forEach((node, index) => {
      if ((node.data.inputConnectionIndex ?? -1) !== index) {
        updates.push([node.id, { inputConnectionIndex: index }]);
      }
    });
  }

  for (const node of session.nodes) {
    if (!nodesWithIncomingOrder.has(node.id) && node.data.inputConnectionIndex != undefined) {
      updates.push([node.id, { inputConnectionIndex: undefined }]);
    }
  }

  return updates;
}

/** Returns list of node ids for the groups that the provided node is a descendent of, in order of parent to child. */
export function getGroupList(nodeId: string, session: NodeEditorSession): string[] {
  const parentId = session.getNodeById(nodeId).parentId;
  if (!parentId) {
    return [];
  }
  return [...getGroupList(parentId, session), parentId];
}
