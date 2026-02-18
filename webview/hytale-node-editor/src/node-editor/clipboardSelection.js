export const NODE_EDITOR_CLIPBOARD_MIME = "application/x-hytale-node-editor-selection+json";

export function buildClipboardSelectionPayload({
  nodes,
  edges,
  readAbsoluteNodePosition,
  readNodeDimensions,
  normalizeOptionalString,
} = {}) {
  const normalize = createNormalizeOptionalString(normalizeOptionalString);
  const selectedNodeRecords = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const nodeCandidate of Array.isArray(nodes) ? nodes : []) {
    if (nodeCandidate?.selected !== true) {
      continue;
    }

    const sourceNodeId = normalize(nodeCandidate?.id);
    if (!sourceNodeId) {
      continue;
    }

    const absolutePosition = readPosition(readAbsoluteNodePosition?.(nodeCandidate));
    if (!absolutePosition) {
      continue;
    }

    const nodeSnapshot = cloneNodeForClipboard(nodeCandidate);
    if (!nodeSnapshot) {
      continue;
    }

    const absoluteBounds = readAbsoluteNodeBounds(
      nodeCandidate,
      absolutePosition,
      readNodeDimensions
    );
    if (!absoluteBounds) {
      continue;
    }

    selectedNodeRecords.push({
      sourceNodeId,
      node: nodeSnapshot,
      absolutePosition,
    });
    minX = Math.min(minX, absoluteBounds.minX);
    minY = Math.min(minY, absoluteBounds.minY);
    maxX = Math.max(maxX, absoluteBounds.maxX);
    maxY = Math.max(maxY, absoluteBounds.maxY);
  }

  if (
    selectedNodeRecords.length === 0 ||
    !Number.isFinite(minX) ||
    !Number.isFinite(minY) ||
    !Number.isFinite(maxX) ||
    !Number.isFinite(maxY)
  ) {
    return undefined;
  }

  const selectionCenter = {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
  const selectedNodeIdSet = new Set(
    selectedNodeRecords.map((entry) => entry.sourceNodeId)
  );
  const edgeSnapshots = readInternalSelectedEdges(edges, selectedNodeIdSet, normalize);

  return {
    nodes: selectedNodeRecords.map((entry) => ({
      sourceNodeId: entry.sourceNodeId,
      node: entry.node,
      offset: {
        x: entry.absolutePosition.x - selectionCenter.x,
        y: entry.absolutePosition.y - selectionCenter.y,
      },
    })),
    edges: edgeSnapshots,
  };
}

export function writeClipboardSelectionPayload(clipboardData, payload) {
  if (!clipboardData || !isObject(payload)) {
    return false;
  }

  let serializedPayload;
  try {
    serializedPayload = JSON.stringify(payload);
  } catch {
    return false;
  }

  if (!serializedPayload) {
    return false;
  }

  clipboardData.setData(NODE_EDITOR_CLIPBOARD_MIME, serializedPayload);
  clipboardData.setData("text/plain", serializedPayload);
  return true;
}

export function readClipboardSelectionPayload(clipboardData) {
  if (!clipboardData || typeof clipboardData.getData !== "function") {
    return undefined;
  }

  const fromCustomMime = parseClipboardSelectionPayloadText(
    clipboardData.getData(NODE_EDITOR_CLIPBOARD_MIME)
  );
  if (fromCustomMime) {
    return fromCustomMime;
  }

  return parseClipboardSelectionPayloadText(clipboardData.getData("text/plain"));
}

export function cutSelectedNodesFromFlowState({
  nodes,
  edges,
  normalizeOptionalString,
} = {}) {
  const normalize = createNormalizeOptionalString(normalizeOptionalString);
  const normalizedNodes = Array.isArray(nodes) ? nodes : [];
  const initiallySelectedNodeIds = new Set(
    normalizedNodes
      .filter((nodeCandidate) => nodeCandidate?.selected === true)
      .map((nodeCandidate) => normalize(nodeCandidate?.id))
      .filter(Boolean)
  );
  if (initiallySelectedNodeIds.size === 0) {
    return {
      didCut: false,
      nodes: normalizedNodes,
      edges: Array.isArray(edges) ? edges : [],
    };
  }

  const cutNodeIds = collectDescendantNodeIds(
    initiallySelectedNodeIds,
    normalizedNodes,
    normalize
  );
  const nextNodes = normalizedNodes.filter((nodeCandidate) => {
    const nodeId = normalize(nodeCandidate?.id);
    return !nodeId || !cutNodeIds.has(nodeId);
  });

  const normalizedEdges = Array.isArray(edges) ? edges : [];
  const nextEdges = normalizedEdges.filter((edgeCandidate) => {
    if (edgeCandidate?.selected === true) {
      return false;
    }

    const sourceNodeId = normalize(edgeCandidate?.source);
    const targetNodeId = normalize(edgeCandidate?.target);
    return (
      !sourceNodeId ||
      !targetNodeId ||
      (!cutNodeIds.has(sourceNodeId) && !cutNodeIds.has(targetNodeId))
    );
  });

  return {
    didCut: true,
    nodes: nextNodes,
    edges: nextEdges,
  };
}

export function applyClipboardSelectionPayload({
  clipboardPayload,
  pasteAnchor,
  nodes,
  edges,
  addEdgeWithConflictPruning,
  normalizeOptionalString,
  normalizeNodeType,
  createUuid,
  readNodeDimensions,
  readGroupUnselectedZIndex,
  groupNodeType,
  commentNodeType,
  linkNodeType,
  rawJsonNodeType,
} = {}) {
  const normalize = createNormalizeOptionalString(normalizeOptionalString);
  const normalizeType = createNormalizeNodeType(normalizeNodeType);
  const createId = createUuidFactory(createUuid);
  const nextNodes = Array.isArray(nodes) ? nodes : [];
  const nextEdgesBase = Array.isArray(edges) ? edges : [];
  const normalizedPasteAnchor = readPosition(pasteAnchor);

  if (!normalizedPasteAnchor || !isObject(clipboardPayload)) {
    return {
      didPaste: false,
      nodes: nextNodes,
      edges: nextEdgesBase,
    };
  }

  const payloadNodes = Array.isArray(clipboardPayload.nodes)
    ? clipboardPayload.nodes
    : [];
  if (payloadNodes.length === 0) {
    return {
      didPaste: false,
      nodes: nextNodes,
      edges: nextEdgesBase,
    };
  }

  const usedNodeIds = new Set(
    nextNodes
      .map((nodeCandidate) => normalize(nodeCandidate?.id))
      .filter(Boolean)
  );
  const pastedNodeIdBySourceId = new Map();
  for (const payloadNode of payloadNodes) {
    const sourceNodeId = normalize(payloadNode?.sourceNodeId);
    if (!sourceNodeId || pastedNodeIdBySourceId.has(sourceNodeId)) {
      continue;
    }

    const pastedNodeId = createPastedNodeId(
      payloadNode?.node,
      sourceNodeId,
      usedNodeIds,
      {
        createId,
        normalize,
        normalizeType,
        groupNodeType,
        commentNodeType,
        linkNodeType,
        rawJsonNodeType,
      }
    );
    pastedNodeIdBySourceId.set(sourceNodeId, pastedNodeId);
    usedNodeIds.add(pastedNodeId);
  }
  if (pastedNodeIdBySourceId.size === 0) {
    return {
      didPaste: false,
      nodes: nextNodes,
      edges: nextEdgesBase,
    };
  }

  const pastedAbsolutePositionBySourceId = new Map();
  for (const payloadNode of payloadNodes) {
    const sourceNodeId = normalize(payloadNode?.sourceNodeId);
    if (!sourceNodeId || !pastedNodeIdBySourceId.has(sourceNodeId)) {
      continue;
    }

    const offset = readClipboardOffset(payloadNode?.offset);
    pastedAbsolutePositionBySourceId.set(sourceNodeId, {
      x: normalizedPasteAnchor.x + offset.x,
      y: normalizedPasteAnchor.y + offset.y,
    });
  }

  const pastedNodes = [];
  for (const payloadNode of payloadNodes) {
    const sourceNodeId = normalize(payloadNode?.sourceNodeId);
    if (!sourceNodeId) {
      continue;
    }

    const pastedNodeId = pastedNodeIdBySourceId.get(sourceNodeId);
    const pastedAbsolutePosition = pastedAbsolutePositionBySourceId.get(sourceNodeId);
    if (!pastedNodeId || !pastedAbsolutePosition) {
      continue;
    }

    const pastedNode = cloneSerializableValue(payloadNode?.node);
    if (!isObject(pastedNode)) {
      continue;
    }

    const sourceParentId = normalize(pastedNode?.parentId);
    const pastedParentId = sourceParentId
      ? pastedNodeIdBySourceId.get(sourceParentId)
      : undefined;
    const pastedParentAbsolutePosition =
      sourceParentId && pastedParentId
        ? pastedAbsolutePositionBySourceId.get(sourceParentId)
        : undefined;

    pastedNode.id = pastedNodeId;
    pastedNode.selected = true;
    delete pastedNode.dragging;
    delete pastedNode.resizing;
    delete pastedNode.measured;

    if (pastedParentId && pastedParentAbsolutePosition) {
      pastedNode.parentId = pastedParentId;
      pastedNode.position = {
        x: pastedAbsolutePosition.x - pastedParentAbsolutePosition.x,
        y: pastedAbsolutePosition.y - pastedParentAbsolutePosition.y,
      };
    } else {
      delete pastedNode.parentId;
      delete pastedNode.extent;
      pastedNode.position = {
        x: pastedAbsolutePosition.x,
        y: pastedAbsolutePosition.y,
      };
    }

    if (normalize(pastedNode?.type) === normalize(groupNodeType)) {
      const dimensions = readNodeDimensionsSafe(pastedNode, readNodeDimensions);
      pastedNode.draggable = false;
      pastedNode.zIndex =
        typeof readGroupUnselectedZIndex === "function"
          ? readGroupUnselectedZIndex(dimensions.width, dimensions.height)
          : pastedNode.zIndex;
    }

    pastedNodes.push(pastedNode);
  }
  if (pastedNodes.length === 0) {
    return {
      didPaste: false,
      nodes: nextNodes,
      edges: nextEdgesBase,
    };
  }

  let nextEdges = [...nextEdgesBase];
  const payloadEdges = Array.isArray(clipboardPayload.edges)
    ? clipboardPayload.edges
    : [];
  for (const payloadEdge of payloadEdges) {
    const sourceSourceNodeId = normalize(payloadEdge?.source);
    const targetSourceNodeId = normalize(payloadEdge?.target);
    if (!sourceSourceNodeId || !targetSourceNodeId) {
      continue;
    }

    const sourceNodeId = pastedNodeIdBySourceId.get(sourceSourceNodeId);
    const targetNodeId = pastedNodeIdBySourceId.get(targetSourceNodeId);
    if (!sourceNodeId || !targetNodeId) {
      continue;
    }

    const nextEdgeState =
      typeof addEdgeWithConflictPruning === "function"
        ? addEdgeWithConflictPruning(nextEdges, {
            sourceNodeId,
            sourceHandleId: normalize(payloadEdge?.sourceHandle),
            targetNodeId,
            targetHandleId: normalize(payloadEdge?.targetHandle),
          })
        : nextEdges;
    if (Array.isArray(nextEdgeState)) {
      nextEdges = nextEdgeState;
    }
  }

  return {
    didPaste: true,
    nodes: [
      ...nextNodes.map((nodeCandidate) =>
        isObject(nodeCandidate)
          ? {
              ...nodeCandidate,
              selected: false,
            }
          : nodeCandidate
      ),
      ...pastedNodes,
    ],
    edges: nextEdges.map((edgeCandidate) =>
      isObject(edgeCandidate)
        ? {
            ...edgeCandidate,
            selected: false,
          }
        : edgeCandidate
    ),
  };
}

function parseClipboardSelectionPayloadText(payloadTextCandidate) {
  const payloadText =
    typeof payloadTextCandidate === "string" ? payloadTextCandidate.trim() : "";
  if (!payloadText) {
    return undefined;
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch {
    return undefined;
  }

  return normalizeClipboardSelectionPayload(parsedPayload);
}

function normalizeClipboardSelectionPayload(payloadCandidate) {
  if (
    !isObject(payloadCandidate) ||
    !Array.isArray(payloadCandidate.nodes)
  ) {
    return undefined;
  }

  const nodes = [];
  const seenSourceNodeIds = new Set();
  for (const entryCandidate of payloadCandidate.nodes) {
    const normalizedEntry = normalizeClipboardSelectionEntry(entryCandidate);
    if (!normalizedEntry || seenSourceNodeIds.has(normalizedEntry.sourceNodeId)) {
      continue;
    }

    seenSourceNodeIds.add(normalizedEntry.sourceNodeId);
    nodes.push(normalizedEntry);
  }
  if (nodes.length === 0) {
    return undefined;
  }

  const edges = [];
  for (const edgeCandidate of Array.isArray(payloadCandidate.edges)
    ? payloadCandidate.edges
    : []) {
    const edgeSnapshot = cloneSerializableValue(edgeCandidate);
    if (!isObject(edgeSnapshot)) {
      continue;
    }

    delete edgeSnapshot.selected;
    edges.push(edgeSnapshot);
  }

  return {
    nodes,
    edges,
  };
}

function normalizeClipboardSelectionEntry(entryCandidate) {
  if (!isObject(entryCandidate) || !isObject(entryCandidate.node)) {
    return undefined;
  }

  const sourceNodeId =
    normalizeOptionalStringInternal(entryCandidate.sourceNodeId) ??
    normalizeOptionalStringInternal(entryCandidate?.node?.id);
  if (!sourceNodeId) {
    return undefined;
  }

  const nodeSnapshot = cloneNodeForClipboard(entryCandidate.node);
  if (!nodeSnapshot) {
    return undefined;
  }

  return {
    sourceNodeId,
    node: nodeSnapshot,
    offset: readClipboardOffset(entryCandidate.offset),
  };
}

function readInternalSelectedEdges(edges, selectedNodeIdSet, normalizeOptionalString) {
  if (!(selectedNodeIdSet instanceof Set) || selectedNodeIdSet.size === 0) {
    return [];
  }

  const snapshots = [];
  for (const edgeCandidate of Array.isArray(edges) ? edges : []) {
    const sourceNodeId = normalizeOptionalString(edgeCandidate?.source);
    const targetNodeId = normalizeOptionalString(edgeCandidate?.target);
    if (
      !sourceNodeId ||
      !targetNodeId ||
      !selectedNodeIdSet.has(sourceNodeId) ||
      !selectedNodeIdSet.has(targetNodeId)
    ) {
      continue;
    }

    const edgeSnapshot = cloneSerializableValue(edgeCandidate);
    if (!isObject(edgeSnapshot)) {
      continue;
    }

    delete edgeSnapshot.selected;
    snapshots.push(edgeSnapshot);
  }

  return snapshots;
}

function collectDescendantNodeIds(initialNodeIds, nodeCandidates, normalizeOptionalString) {
  const descendants = new Set(initialNodeIds);
  const normalizedNodes = Array.isArray(nodeCandidates) ? nodeCandidates : [];
  let didChange = true;
  while (didChange) {
    didChange = false;
    for (const nodeCandidate of normalizedNodes) {
      const nodeId = normalizeOptionalString(nodeCandidate?.id);
      if (!nodeId || descendants.has(nodeId)) {
        continue;
      }

      const parentNodeId = normalizeOptionalString(nodeCandidate?.parentId);
      if (!parentNodeId || !descendants.has(parentNodeId)) {
        continue;
      }

      descendants.add(nodeId);
      didChange = true;
    }
  }

  return descendants;
}

function readAbsoluteNodeBounds(nodeCandidate, absolutePosition, readNodeDimensions) {
  const resolvedPosition = readPosition(absolutePosition);
  if (!resolvedPosition) {
    return undefined;
  }

  const dimensions = readNodeDimensionsSafe(nodeCandidate, readNodeDimensions);
  const origin = readNodeOrigin(nodeCandidate);
  const minX = resolvedPosition.x - dimensions.width * origin.x;
  const minY = resolvedPosition.y - dimensions.height * origin.y;
  return {
    minX,
    minY,
    maxX: minX + dimensions.width,
    maxY: minY + dimensions.height,
  };
}

function readNodeOrigin(nodeCandidate) {
  const sourceOrigin = nodeCandidate?.origin;
  if (!Array.isArray(sourceOrigin) || sourceOrigin.length < 2) {
    return { x: 0, y: 0 };
  }

  const x = Number(sourceOrigin[0]);
  const y = Number(sourceOrigin[1]);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function readNodeDimensionsSafe(nodeCandidate, readNodeDimensions) {
  const fromCallback =
    typeof readNodeDimensions === "function" ? readNodeDimensions(nodeCandidate) : undefined;
  const widthFromCallback = Number(fromCallback?.width);
  const heightFromCallback = Number(fromCallback?.height);
  if (Number.isFinite(widthFromCallback) || Number.isFinite(heightFromCallback)) {
    return {
      width: Number.isFinite(widthFromCallback) ? widthFromCallback : 0,
      height: Number.isFinite(heightFromCallback) ? heightFromCallback : 0,
    };
  }

  const width = Number(
    nodeCandidate?.width ?? nodeCandidate?.initialWidth ?? nodeCandidate?.measured?.width
  );
  const height = Number(
    nodeCandidate?.height ?? nodeCandidate?.initialHeight ?? nodeCandidate?.measured?.height
  );
  return {
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
}

function readPosition(candidatePosition) {
  const x = Number(candidatePosition?.x);
  const y = Number(candidatePosition?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return { x, y };
}

function readClipboardOffset(offsetCandidate) {
  const x = Number(offsetCandidate?.x);
  const y = Number(offsetCandidate?.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function cloneNodeForClipboard(nodeCandidate) {
  const nodeSnapshot = cloneSerializableValue(nodeCandidate);
  if (!isObject(nodeSnapshot)) {
    return undefined;
  }

  delete nodeSnapshot.selected;
  delete nodeSnapshot.dragging;
  delete nodeSnapshot.resizing;
  delete nodeSnapshot.measured;
  return nodeSnapshot;
}

function createPastedNodeId(sourceNode, sourceNodeId, usedNodeIds, context) {
  const nodeIdPrefix = readPastedNodeIdPrefix(sourceNode, sourceNodeId, context);
  let pastedNodeId = `${nodeIdPrefix}-${context.createId()}`;
  while (usedNodeIds.has(pastedNodeId)) {
    pastedNodeId = `${nodeIdPrefix}-${context.createId()}`;
  }

  return pastedNodeId;
}

function readPastedNodeIdPrefix(sourceNode, sourceNodeId, context) {
  const sourceNodeType = context.normalize(sourceNode?.type);
  if (sourceNodeType === context.normalize(context.groupNodeType)) {
    return "Group";
  }

  if (sourceNodeType === context.normalize(context.commentNodeType)) {
    return "Comment";
  }

  if (sourceNodeType === context.normalize(context.linkNodeType)) {
    return "Link";
  }

  if (sourceNodeType === context.normalize(context.rawJsonNodeType)) {
    return "Generic";
  }

  const normalizedSourceNodeId = context.normalize(sourceNodeId);
  if (normalizedSourceNodeId) {
    const separatorIndex = normalizedSourceNodeId.indexOf("-");
    const sourcePrefix =
      separatorIndex > 0
        ? normalizedSourceNodeId.slice(0, separatorIndex)
        : normalizedSourceNodeId;
    const normalizedPrefix = context.normalizeType(sourcePrefix);
    if (normalizedPrefix) {
      return normalizedPrefix;
    }
  }

  return "Node";
}

function cloneSerializableValue(value) {
  if (typeof globalThis?.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // Fall back to JSON clone below.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function createNormalizeOptionalString(normalizeOptionalString) {
  return typeof normalizeOptionalString === "function"
    ? normalizeOptionalString
    : normalizeOptionalStringInternal;
}

function createNormalizeNodeType(normalizeNodeType) {
  return typeof normalizeNodeType === "function"
    ? normalizeNodeType
    : normalizeNodeTypeInternal;
}

function createUuidFactory(createUuid) {
  if (typeof createUuid === "function") {
    return createUuid;
  }

  return function createUuidFallback() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }

    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}`;
  };
}

function normalizeOptionalStringInternal(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeNodeTypeInternal(candidate) {
  if (typeof candidate === "string") {
    const cleaned = candidate.trim().replace(/\s+/g, "");
    if (cleaned) {
      return cleaned;
    }
  }

  return "Node";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
