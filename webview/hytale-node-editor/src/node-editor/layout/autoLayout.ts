import dagre from "@dagrejs/dagre";

const DEFAULT_DIRECTION = "LR";
const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 240;
const DEFAULT_NODE_SEP = 80;
const DEFAULT_RANK_SEP = 140;
const DEFAULT_MARGIN_X = 40;
const DEFAULT_MARGIN_Y = 40;

function readString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function readPositiveFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function readDirection(direction) {
  const readdDirection = readString(direction)?.toUpperCase();
  return readdDirection === "TB" || readdDirection === "LR"
    ? readdDirection
    : DEFAULT_DIRECTION;
}

function readNodeIds(nodeIdsCandidate) {
  const nodeIds = Array.isArray(nodeIdsCandidate) ? nodeIdsCandidate : [];
  return Array.from(
    new Set(
      nodeIds
        .map((nodeId) => readString(nodeId))
        .filter((nodeId) => nodeId !== undefined)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function readLayoutNodes(layoutNodesCandidate) {
  const layoutNodes = Array.isArray(layoutNodesCandidate) ? layoutNodesCandidate : [];
  const readdNodes = [];
  const seenNodeIds = new Set();

  for (const layoutNode of layoutNodes) {
    const nodeId = readString(layoutNode?.id);
    if (!nodeId || seenNodeIds.has(nodeId)) {
      continue;
    }

    seenNodeIds.add(nodeId);
    readdNodes.push({
      id: nodeId,
      width: readPositiveFiniteNumber(layoutNode?.width, DEFAULT_NODE_WIDTH),
      height: readPositiveFiniteNumber(layoutNode?.height, DEFAULT_NODE_HEIGHT),
    });
  }

  readdNodes.sort((left, right) => left.id.localeCompare(right.id));
  return readdNodes;
}

function readEdges(edgesCandidate, knownNodeIds) {
  const knownNodeIdSet = new Set(knownNodeIds);
  const edges = Array.isArray(edgesCandidate) ? edgesCandidate : [];
  const readdEdges = [];

  for (const edge of edges) {
    const source = readString(edge?.source);
    const target = readString(edge?.target);
    if (!source || !target || !knownNodeIdSet.has(source) || !knownNodeIdSet.has(target)) {
      continue;
    }

    readdEdges.push({ source, target });
  }

  return readdEdges;
}

export function readLayoutOriginFromPositions(positionsCandidate) {
  const positions = Array.isArray(positionsCandidate) ? positionsCandidate : [];
  if (positions.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  for (const position of positions) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return { x: 0, y: 0 };
  }

  return { x: minX, y: minY };
}

export function collectRecursiveDescendantNodeIds({
  seedNodeIds,
  edges,
  allowedNodeIds,
}: any = {}) {
  const readdSeedNodeIds = readNodeIds(seedNodeIds);
  if (readdSeedNodeIds.length === 0) {
    return [];
  }

  const readdAllowedNodeIds = readNodeIds(allowedNodeIds);
  const allowedNodeIdSet =
    readdAllowedNodeIds.length > 0
      ? new Set(readdAllowedNodeIds)
      : undefined;

  const childNodeIdsByParentNodeId = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const sourceNodeId = readString(edge?.source);
    const targetNodeId = readString(edge?.target);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }

    if (
      allowedNodeIdSet &&
      (!allowedNodeIdSet.has(sourceNodeId) || !allowedNodeIdSet.has(targetNodeId))
    ) {
      continue;
    }

    if (!childNodeIdsByParentNodeId.has(sourceNodeId)) {
      childNodeIdsByParentNodeId.set(sourceNodeId, new Set());
    }
    childNodeIdsByParentNodeId.get(sourceNodeId).add(targetNodeId);
  }

  const visitedNodeIds = new Set(
    allowedNodeIdSet
      ? readdSeedNodeIds.filter((nodeId) => allowedNodeIdSet.has(nodeId))
      : readdSeedNodeIds
  );
  const pendingNodeIds = Array.from(visitedNodeIds);
  while (pendingNodeIds.length > 0) {
    const currentNodeId = pendingNodeIds.shift();
    const childNodeIds = childNodeIdsByParentNodeId.get(currentNodeId);
    if (!(childNodeIds instanceof Set)) {
      continue;
    }

    for (const childNodeId of childNodeIds) {
      if (visitedNodeIds.has(childNodeId)) {
        continue;
      }

      visitedNodeIds.add(childNodeId);
      pendingNodeIds.push(childNodeId);
    }
  }

  return Array.from(visitedNodeIds);
}

export function layoutDirectedGraphWithNodeSizes({
  nodes,
  edges,
  direction = DEFAULT_DIRECTION,
  spacing = {},
  origin = {},
}: any = {}) {
  const readdLayoutNodes = readLayoutNodes(nodes);
  if (readdLayoutNodes.length === 0) {
    return new Map();
  }

  const nodeSep = readFiniteNumber(spacing?.nodeSep, DEFAULT_NODE_SEP);
  const rankSep = readFiniteNumber(spacing?.rankSep, DEFAULT_RANK_SEP);
  const marginX = readFiniteNumber(spacing?.marginX, DEFAULT_MARGIN_X);
  const marginY = readFiniteNumber(spacing?.marginY, DEFAULT_MARGIN_Y);
  const offsetX = readFiniteNumber(origin?.x, 0);
  const offsetY = readFiniteNumber(origin?.y, 0);

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: readDirection(direction),
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: marginX,
    marginy: marginY,
  });

  const nodeSizeByNodeId = new Map();
  for (const node of readdLayoutNodes) {
    nodeSizeByNodeId.set(node.id, {
      width: node.width,
      height: node.height,
    });
    graph.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }

  const readdEdges = readEdges(
    edges,
    readdLayoutNodes.map((node) => node.id)
  );
  for (let index = readdEdges.length - 1; index >= 0; index -= 1) {
    const edge = readdEdges[index];
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positionsByNodeId = new Map();
  for (const node of readdLayoutNodes) {
    const nodeWithCenterAnchor = graph.node(node.id);
    const nodeSize = nodeSizeByNodeId.get(node.id);
    if (!nodeWithCenterAnchor || !nodeSize) {
      continue;
    }

    positionsByNodeId.set(node.id, {
      x: nodeWithCenterAnchor.x - nodeSize.width / 2 + offsetX,
      y: nodeWithCenterAnchor.y - nodeSize.height / 2 + offsetY,
    });
  }

  return positionsByNodeId;
}

export function layoutDirectedGraph({
  nodeIds,
  edges,
  direction = DEFAULT_DIRECTION,
  nodeSize = {},
  spacing = {},
  origin = {},
}: any = {}) {
  const readdNodeIds = readNodeIds(nodeIds);
  const nodeWidth = readPositiveFiniteNumber(nodeSize?.width, DEFAULT_NODE_WIDTH);
  const nodeHeight = readPositiveFiniteNumber(nodeSize?.height, DEFAULT_NODE_HEIGHT);
  const layoutNodes = readdNodeIds.map((nodeId) => ({
    id: nodeId,
    width: nodeWidth,
    height: nodeHeight,
  }));

  return layoutDirectedGraphWithNodeSizes({
    nodes: layoutNodes,
    edges,
    direction,
    spacing,
    origin,
  });
}
