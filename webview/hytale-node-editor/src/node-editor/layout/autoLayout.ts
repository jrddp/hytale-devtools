import dagre from "@dagrejs/dagre";
import type { FlowEdge, FlowNode } from "@node-editor/common";
import type { NodeUpdates } from "@node-editor/node-editor/utils/nodeUtils.svelte";
import { getAbsolutePosition } from "@node-editor/node-editor/utils/nodeUtils.svelte";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

const NODE_SEPARATION = 100;
const RANK_SEPARATION = 160;

type LayoutNode = {
  id: string;
  width: number;
  height: number;
};

type LayoutComponent = {
  nodeIds: string[];
  edges: FlowEdge[];
  anchorNodeId: string;
};

export function getAutoPositionNodeUpdates(
  seedNodes: FlowNode[],
  session: NodeEditorSession,
): NodeUpdates[] {
  const layoutableSeedNodeIds = seedNodes
    .filter(isLayoutableNode)
    .map(node => node.id);
  if (layoutableSeedNodeIds.length === 0) {
    return [];
  }

  const components = getConnectedLayoutComponents(layoutableSeedNodeIds, session);
  const updates: NodeUpdates[] = [];

  for (const component of components) {
    const positionsByNodeId = layoutConnectedComponent(component, session);
    for (const [nodeId, position] of positionsByNodeId) {
      const currentNode = session.getNodeById(nodeId);
      if (!currentNode) {
        continue;
      }

      if (
        currentNode.position.x === position.x &&
        currentNode.position.y === position.y &&
        currentNode.parentId === undefined
      ) {
        continue;
      }

      updates.push([nodeId, { position, parentId: undefined }]);
    }
  }

  return updates;
}

function layoutConnectedComponent(
  component: LayoutComponent,
  session: NodeEditorSession,
): Map<string, { x: number; y: number }> {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    nodesep: NODE_SEPARATION,
    ranksep: RANK_SEPARATION,
  });

  const layoutNodes = component.nodeIds
    .map(nodeId => toLayoutNode(nodeId, session))
    .filter((node): node is LayoutNode => node !== null);

  for (const node of layoutNodes) {
    graph.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }

  const seenEdges = new Set<string>();
  for (const edge of component.edges) {
    const key = `${edge.source}->${edge.target}`;
    if (seenEdges.has(key)) {
      continue;
    }
    seenEdges.add(key);
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const anchorNode = session.getNodeById(component.anchorNodeId);
  const anchorGraphNode = graph.node(component.anchorNodeId);
  if (!anchorNode || !anchorGraphNode) {
    return new Map();
  }

  const anchorAbsolutePosition = getAbsolutePosition(anchorNode, session);
  const anchorWidth = anchorNode.measured.width ?? anchorNode.width ?? 0;
  const anchorHeight = anchorNode.measured.height ?? anchorNode.height ?? 0;
  const anchorLayoutPosition = {
    x: anchorGraphNode.x - anchorWidth / 2,
    y: anchorGraphNode.y - anchorHeight / 2,
  };
  const deltaX = anchorAbsolutePosition.x - anchorLayoutPosition.x;
  const deltaY = anchorAbsolutePosition.y - anchorLayoutPosition.y;

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    const graphNode = graph.node(node.id);
    if (!graphNode) {
      continue;
    }

    positionsByNodeId.set(node.id, {
      x: graphNode.x - node.width / 2 + deltaX,
      y: graphNode.y - node.height / 2 + deltaY,
    });
  }

  return positionsByNodeId;
}

function getConnectedLayoutComponents(
  seedNodeIds: string[],
  session: NodeEditorSession,
): LayoutComponent[] {
  const neighborIdsByNodeId = buildNeighborIdsByNodeId(session);
  const edgesByNodeId = buildEdgesByNodeId(session);
  const visitedNodeIds = new Set<string>();
  const components: LayoutComponent[] = [];

  for (const seedNodeId of seedNodeIds) {
    if (visitedNodeIds.has(seedNodeId)) {
      continue;
    }

    const queue = [seedNodeId];
    const componentNodeIds: string[] = [];
    const componentNodeIdSet = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visitedNodeIds.has(nodeId)) {
        continue;
      }

      visitedNodeIds.add(nodeId);
      componentNodeIds.push(nodeId);
      componentNodeIdSet.add(nodeId);

      for (const neighborId of neighborIdsByNodeId.get(nodeId) ?? []) {
        if (!visitedNodeIds.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    const componentEdges: FlowEdge[] = [];
    const seenEdgeIds = new Set<string>();
    for (const nodeId of componentNodeIds) {
      for (const edge of edgesByNodeId.get(nodeId) ?? []) {
        if (
          componentNodeIdSet.has(edge.source) &&
          componentNodeIdSet.has(edge.target) &&
          !seenEdgeIds.has(edge.id)
        ) {
          seenEdgeIds.add(edge.id);
          componentEdges.push(edge);
        }
      }
    }

    components.push({
      nodeIds: componentNodeIds,
      edges: componentEdges,
      anchorNodeId: seedNodeId,
    });
  }

  return components;
}

function buildNeighborIdsByNodeId(session: NodeEditorSession): Map<string, Set<string>> {
  const neighbors = new Map<string, Set<string>>();

  for (const edge of session.edges) {
    if (!isLayoutableNodeId(edge.source, session) || !isLayoutableNodeId(edge.target, session)) {
      continue;
    }

    if (!neighbors.has(edge.source)) {
      neighbors.set(edge.source, new Set());
    }
    if (!neighbors.has(edge.target)) {
      neighbors.set(edge.target, new Set());
    }

    neighbors.get(edge.source)!.add(edge.target);
    neighbors.get(edge.target)!.add(edge.source);
  }

  for (const node of session.nodes) {
    if (!isLayoutableNode(node)) {
      continue;
    }
    if (!neighbors.has(node.id)) {
      neighbors.set(node.id, new Set());
    }
  }

  return neighbors;
}

function buildEdgesByNodeId(session: NodeEditorSession): Map<string, FlowEdge[]> {
  const edgesByNodeId = new Map<string, FlowEdge[]>();

  for (const edge of session.edges) {
    if (!isLayoutableNodeId(edge.source, session) || !isLayoutableNodeId(edge.target, session)) {
      continue;
    }

    if (!edgesByNodeId.has(edge.source)) {
      edgesByNodeId.set(edge.source, []);
    }
    if (!edgesByNodeId.has(edge.target)) {
      edgesByNodeId.set(edge.target, []);
    }

    edgesByNodeId.get(edge.source)!.push(edge);
    edgesByNodeId.get(edge.target)!.push(edge);
  }

  return edgesByNodeId;
}

function toLayoutNode(nodeId: string, session: NodeEditorSession): LayoutNode | null {
  const node = session.getNodeById(nodeId);
  if (!node || !isLayoutableNode(node)) {
    return null;
  }

  const width = node.measured.width ?? node.width;
  const height = node.measured.height ?? node.height;
  if (typeof width !== "number" || typeof height !== "number") {
    return null;
  }

  return {
    id: nodeId,
    width,
    height,
  };
}

function isLayoutableNode(node: FlowNode): boolean {
  return node.type !== "groupnode" && node.type !== "comment";
}

function isLayoutableNodeId(nodeId: string, session: NodeEditorSession): boolean {
  const node = session.getNodeById(nodeId);
  return !!node && isLayoutableNode(node);
}
