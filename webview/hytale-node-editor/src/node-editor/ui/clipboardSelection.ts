import { isObject } from "src/node-editor/utils/valueUtils";

export const NODE_EDITOR_CLIPBOARD_MIME = "application/x-hytale-node-editor-selection+json";

export function buildClipboardSelectionPayload({
  nodes,
  edges,
  readAbsoluteNodePosition,
  readNodeDimensions,
  readOptionalString,
}: any = {}) {
  const read = createReadOptionalString(readOptionalString);
  const selectedNodeRecords = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const nodeCandidate of Array.isArray(nodes) ? nodes : []) {
    if (nodeCandidate?.selected !== true) {
      continue;
    }

    const sourceNodeId = read(nodeCandidate?.id);
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
      readNodeDimensions,
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
  const selectedNodeIdSet = new Set(selectedNodeRecords.map(entry => entry.sourceNodeId));
  const edgeSnapshots = readInternalSelectedEdges(edges, selectedNodeIdSet, read);

  return {
    nodes: selectedNodeRecords.map(entry => ({
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
    clipboardData.getData(NODE_EDITOR_CLIPBOARD_MIME),
  );
  if (fromCustomMime) {
    return fromCustomMime;
  }

  return parseClipboardSelectionPayloadText(clipboardData.getData("text/plain"));
}

export function cutSelectedNodesFromFlowState({ nodes, edges, readOptionalString }: any = {}) {
  const read = createReadOptionalString(readOptionalString);
  const readdNodes = Array.isArray(nodes) ? nodes : [];
  const initiallySelectedNodeIds = new Set(
    readdNodes
      .filter(nodeCandidate => nodeCandidate?.selected === true)
      .map(nodeCandidate => read(nodeCandidate?.id))
      .filter(Boolean),
  );
  if (initiallySelectedNodeIds.size === 0) {
    return {
      didCut: false,
      nodes: readdNodes,
      edges: Array.isArray(edges) ? edges : [],
    };
  }

  const cutNodeIds = collectDescendantNodeIds(initiallySelectedNodeIds, readdNodes, read);
  const nextNodes = readdNodes.filter(nodeCandidate => {
    const nodeId = read(nodeCandidate?.id);
    return !nodeId || !cutNodeIds.has(nodeId);
  });

  const readdEdges = Array.isArray(edges) ? edges : [];
  const nextEdges = readdEdges.filter(edgeCandidate => {
    if (edgeCandidate?.selected === true) {
      return false;
    }

    const sourceNodeId = read(edgeCandidate?.source);
    const targetNodeId = read(edgeCandidate?.target);
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

function readInternalSelectedEdges(edges, selectedNodeIdSet, readOptionalString) {
  if (!(selectedNodeIdSet instanceof Set) || selectedNodeIdSet.size === 0) {
    return [];
  }

  const snapshots = [];
  for (const edgeCandidate of Array.isArray(edges) ? edges : []) {
    const sourceNodeId = readOptionalString(edgeCandidate?.source);
    const targetNodeId = readOptionalString(edgeCandidate?.target);
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

function collectDescendantNodeIds(initialNodeIds, nodeCandidates, readOptionalString) {
  const descendants = new Set(initialNodeIds);
  const readdNodes = Array.isArray(nodeCandidates) ? nodeCandidates : [];
  let didChange = true;
  while (didChange) {
    didChange = false;
    for (const nodeCandidate of readdNodes) {
      const nodeId = readOptionalString(nodeCandidate?.id);
      if (!nodeId || descendants.has(nodeId)) {
        continue;
      }

      const parentNodeId = readOptionalString(nodeCandidate?.parentId);
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
    nodeCandidate?.width ?? nodeCandidate?.initialWidth ?? nodeCandidate?.measured?.width,
  );
  const height = Number(
    nodeCandidate?.height ?? nodeCandidate?.initialHeight ?? nodeCandidate?.measured?.height,
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
  const sourceNodeType = context.read(sourceNode?.type);
  if (sourceNodeType === context.read(context.groupNodeType)) {
    return "Group";
  }

  if (sourceNodeType === context.read(context.commentNodeType)) {
    return "Comment";
  }

  if (sourceNodeType === context.read(context.linkNodeType)) {
    return "Link";
  }

  if (sourceNodeType === context.read(context.rawJsonNodeType)) {
    return "Generic";
  }

  const readdSourceNodeId = context.read(sourceNodeId);
  if (readdSourceNodeId) {
    const separatorIndex = readdSourceNodeId.indexOf("-");
    const sourcePrefix =
      separatorIndex > 0 ? readdSourceNodeId.slice(0, separatorIndex) : readdSourceNodeId;
    const readdPrefix = context.readType(sourcePrefix);
    if (readdPrefix) {
      return readdPrefix;
    }
  }

  return "Node";
}

function cloneSerializableValue(value) {
  if (typeof globalThis?.structuredClone === "function") {
    try {
      return globalThis.structuredClone(value);
    } catch {
      // fall back to JSON clone below.
    }
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return undefined;
  }
}

function createReadOptionalString(readOptionalString) {
  return typeof readOptionalString === "function" ? readOptionalString : readOptionalStringInternal;
}

function createReadNodeType(readNodeType) {
  return typeof readNodeType === "function" ? readNodeType : readNodeTypeInternal;
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

function readOptionalStringInternal(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNodeTypeInternal(candidate) {
  if (typeof candidate === "string") {
    const cleaned = candidate.trim().replace(/\s+/g, "");
    if (cleaned) {
      return cleaned;
    }
  }

  return "Node";
}

