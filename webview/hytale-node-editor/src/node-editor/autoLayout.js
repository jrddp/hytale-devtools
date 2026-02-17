import dagre from "@dagrejs/dagre";

const DEFAULT_DIRECTION = "LR";
const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 240;
const DEFAULT_NODE_SEP = 80;
const DEFAULT_RANK_SEP = 140;
const DEFAULT_MARGIN_X = 40;
const DEFAULT_MARGIN_Y = 40;

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function normalizePositiveFiniteNumber(value, fallback) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
}

function normalizeDirection(direction) {
  const normalizedDirection = normalizeNonEmptyString(direction)?.toUpperCase();
  return normalizedDirection === "TB" || normalizedDirection === "LR"
    ? normalizedDirection
    : DEFAULT_DIRECTION;
}

function normalizeNodeIds(nodeIdsCandidate) {
  const nodeIds = Array.isArray(nodeIdsCandidate) ? nodeIdsCandidate : [];
  return Array.from(
    new Set(
      nodeIds
        .map((nodeId) => normalizeNonEmptyString(nodeId))
        .filter((nodeId) => nodeId !== undefined)
    )
  ).sort((left, right) => left.localeCompare(right));
}

function normalizeLayoutNodes(layoutNodesCandidate) {
  const layoutNodes = Array.isArray(layoutNodesCandidate) ? layoutNodesCandidate : [];
  const normalizedNodes = [];
  const seenNodeIds = new Set();

  for (const layoutNode of layoutNodes) {
    const nodeId = normalizeNonEmptyString(layoutNode?.id);
    if (!nodeId || seenNodeIds.has(nodeId)) {
      continue;
    }

    seenNodeIds.add(nodeId);
    normalizedNodes.push({
      id: nodeId,
      width: normalizePositiveFiniteNumber(layoutNode?.width, DEFAULT_NODE_WIDTH),
      height: normalizePositiveFiniteNumber(layoutNode?.height, DEFAULT_NODE_HEIGHT),
    });
  }

  normalizedNodes.sort((left, right) => left.id.localeCompare(right.id));
  return normalizedNodes;
}

function normalizeEdges(edgesCandidate, knownNodeIds) {
  const knownNodeIdSet = new Set(knownNodeIds);
  const edges = Array.isArray(edgesCandidate) ? edgesCandidate : [];
  const normalizedEdges = [];

  for (const edge of edges) {
    const source = normalizeNonEmptyString(edge?.source);
    const target = normalizeNonEmptyString(edge?.target);
    if (!source || !target || !knownNodeIdSet.has(source) || !knownNodeIdSet.has(target)) {
      continue;
    }

    normalizedEdges.push({ source, target });
  }

  return normalizedEdges;
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
} = {}) {
  const normalizedSeedNodeIds = normalizeNodeIds(seedNodeIds);
  if (normalizedSeedNodeIds.length === 0) {
    return [];
  }

  const normalizedAllowedNodeIds = normalizeNodeIds(allowedNodeIds);
  const allowedNodeIdSet =
    normalizedAllowedNodeIds.length > 0
      ? new Set(normalizedAllowedNodeIds)
      : undefined;

  const childNodeIdsByParentNodeId = new Map();
  for (const edge of Array.isArray(edges) ? edges : []) {
    const sourceNodeId = normalizeNonEmptyString(edge?.source);
    const targetNodeId = normalizeNonEmptyString(edge?.target);
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
      ? normalizedSeedNodeIds.filter((nodeId) => allowedNodeIdSet.has(nodeId))
      : normalizedSeedNodeIds
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
} = {}) {
  const normalizedLayoutNodes = normalizeLayoutNodes(nodes);
  if (normalizedLayoutNodes.length === 0) {
    return new Map();
  }

  const nodeSep = normalizeFiniteNumber(spacing?.nodeSep, DEFAULT_NODE_SEP);
  const rankSep = normalizeFiniteNumber(spacing?.rankSep, DEFAULT_RANK_SEP);
  const marginX = normalizeFiniteNumber(spacing?.marginX, DEFAULT_MARGIN_X);
  const marginY = normalizeFiniteNumber(spacing?.marginY, DEFAULT_MARGIN_Y);
  const offsetX = normalizeFiniteNumber(origin?.x, 0);
  const offsetY = normalizeFiniteNumber(origin?.y, 0);

  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: normalizeDirection(direction),
    nodesep: nodeSep,
    ranksep: rankSep,
    marginx: marginX,
    marginy: marginY,
  });

  const nodeSizeByNodeId = new Map();
  for (const node of normalizedLayoutNodes) {
    nodeSizeByNodeId.set(node.id, {
      width: node.width,
      height: node.height,
    });
    graph.setNode(node.id, {
      width: node.width,
      height: node.height,
    });
  }

  const normalizedEdges = normalizeEdges(
    edges,
    normalizedLayoutNodes.map((node) => node.id)
  );
  for (let index = normalizedEdges.length - 1; index >= 0; index -= 1) {
    const edge = normalizedEdges[index];
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positionsByNodeId = new Map();
  for (const node of normalizedLayoutNodes) {
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
} = {}) {
  const normalizedNodeIds = normalizeNodeIds(nodeIds);
  const nodeWidth = normalizePositiveFiniteNumber(nodeSize?.width, DEFAULT_NODE_WIDTH);
  const nodeHeight = normalizePositiveFiniteNumber(nodeSize?.height, DEFAULT_NODE_HEIGHT);
  const layoutNodes = normalizedNodeIds.map((nodeId) => ({
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
