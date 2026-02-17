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

export function layoutDirectedGraph({
  nodeIds,
  edges,
  direction = DEFAULT_DIRECTION,
  nodeSize = {},
  spacing = {},
  origin = {},
} = {}) {
  const normalizedNodeIds = normalizeNodeIds(nodeIds);
  if (normalizedNodeIds.length === 0) {
    return new Map();
  }

  const nodeWidth = normalizeFiniteNumber(nodeSize?.width, DEFAULT_NODE_WIDTH);
  const nodeHeight = normalizeFiniteNumber(nodeSize?.height, DEFAULT_NODE_HEIGHT);
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

  for (const nodeId of normalizedNodeIds) {
    graph.setNode(nodeId, {
      width: nodeWidth,
      height: nodeHeight,
    });
  }

  const normalizedEdges = normalizeEdges(edges, normalizedNodeIds);
  for (let index = normalizedEdges.length - 1; index >= 0; index -= 1) {
    const edge = normalizedEdges[index];
    graph.setEdge(edge.source, edge.target);
  }

  dagre.layout(graph);

  const positionsByNodeId = new Map();
  for (const nodeId of normalizedNodeIds) {
    const nodeWithCenterAnchor = graph.node(nodeId);
    if (!nodeWithCenterAnchor) {
      continue;
    }

    positionsByNodeId.set(nodeId, {
      x: nodeWithCenterAnchor.x - nodeWidth / 2 + offsetX,
      y: nodeWithCenterAnchor.y - nodeHeight / 2 + offsetY,
    });
  }

  return positionsByNodeId;
}
