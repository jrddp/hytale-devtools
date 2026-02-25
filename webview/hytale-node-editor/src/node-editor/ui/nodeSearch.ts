import {
  COMMENT_NODE_TYPE,
  DATA_NODE_TYPE,
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
} from "../graph/graphTypes.js";
import { getDefaultPinColor } from "../utils/pinColorUtils.js";

const UNGROUPED_GROUP_ID = "__ungrouped__";
const UNGROUPED_GROUP_LABEL = "Ungrouped";
const DEFAULT_COMMENT_LABEL = "Comment";
const DEFAULT_LINK_LABEL = "Link";
const DEFAULT_RAW_JSON_LABEL = "Raw JSON Node";
const COMMENT_NODE_COLOR = "var(--vscode-descriptionForeground)";
const LINK_NODE_COLOR = "var(--vscode-descriptionForeground)";
const RAW_JSON_NODE_COLOR = "var(--vscode-focusBorder)";

export function buildNodeSearchGroups({ nodes, workspaceContext }: any = {}) {
  const readdNodes = Array.isArray(nodes) ? nodes : [];
  if (readdNodes.length === 0) {
    return [];
  }

  const nodeById = new Map();
  for (const node of readdNodes) {
    const nodeId = readOptionalString(node?.id);
    if (nodeId) {
      nodeById.set(nodeId, node);
    }
  }

  const absolutePositionByNodeId = new Map();
  const rootGroupsById = new Map();

  for (const node of readdNodes) {
    if (!isNodeSearchEligible(node)) {
      continue;
    }

    const nodeId = readOptionalString(node?.id);
    if (!nodeId) {
      continue;
    }

    const absolutePosition = readAbsoluteNodePosition(node, nodeById, absolutePositionByNodeId);
    if (!absolutePosition) {
      continue;
    }

    const rootGroupDescriptor = readRootGroupDescriptor(node, nodeById, absolutePositionByNodeId);
    const groupId = rootGroupDescriptor?.id ?? UNGROUPED_GROUP_ID;
    if (!rootGroupsById.has(groupId)) {
      rootGroupsById.set(groupId, {
        id: groupId,
        label: rootGroupDescriptor?.label ?? UNGROUPED_GROUP_LABEL,
        isUngrouped: groupId === UNGROUPED_GROUP_ID,
        position:
          rootGroupDescriptor?.position ??
          (groupId === UNGROUPED_GROUP_ID
            ? undefined
            : { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }),
        items: [],
      });
    }

    rootGroupsById.get(groupId).items.push({
      nodeId,
      label: readNodeSearchLabel(node, workspaceContext),
      color: readNodeSearchColor(node, workspaceContext),
      position: absolutePosition,
      searchValue: readSearchValue(node, workspaceContext, rootGroupDescriptor?.label),
    });
  }

  const groupedEntries = Array.from(rootGroupsById.values());
  for (const groupEntry of groupedEntries) {
    groupEntry.items.sort(compareNodeSearchEntries);
  }

  groupedEntries.sort(compareNodeSearchGroups);
  return groupedEntries;
}

export function filterNodeSearchGroups(groups, queryCandidate) {
  const readdGroups = Array.isArray(groups) ? groups : [];
  const readdQuery = readOptionalString(queryCandidate)?.toLowerCase() ?? "";
  if (!readdQuery) {
    return readdGroups.map(cloneGroupForSearch);
  }

  return readdGroups
    .map(group => ({
      ...group,
      items: (Array.isArray(group?.items) ? group.items : []).filter(item =>
        (typeof item?.searchValue === "string" ? item.searchValue : "").includes(readdQuery),
      ),
    }))
    .filter(group => group.items.length > 0);
}

export function isNodeSearchEligible(nodeCandidate) {
  return readOptionalString(nodeCandidate?.type) !== GROUP_NODE_TYPE;
}

export function compareNodeSearchEntries(leftEntry, rightEntry) {
  const yDelta =
    readFiniteNumber(leftEntry?.position?.y) - readFiniteNumber(rightEntry?.position?.y);
  if (Math.abs(yDelta) > 0.001) {
    return yDelta;
  }

  const xDelta =
    readFiniteNumber(leftEntry?.position?.x) - readFiniteNumber(rightEntry?.position?.x);
  if (Math.abs(xDelta) > 0.001) {
    return xDelta;
  }

  const leftLabel = readOptionalString(leftEntry?.label) ?? "";
  const rightLabel = readOptionalString(rightEntry?.label) ?? "";
  return leftLabel.localeCompare(rightLabel);
}

function compareNodeSearchGroups(leftGroup, rightGroup) {
  const leftIsUngrouped = leftGroup?.isUngrouped === true;
  const rightIsUngrouped = rightGroup?.isUngrouped === true;
  if (leftIsUngrouped !== rightIsUngrouped) {
    return leftIsUngrouped ? 1 : -1;
  }

  const yDelta =
    readFiniteNumber(leftGroup?.position?.y, Number.POSITIVE_INFINITY) -
    readFiniteNumber(rightGroup?.position?.y, Number.POSITIVE_INFINITY);
  if (Math.abs(yDelta) > 0.001) {
    return yDelta;
  }

  const xDelta =
    readFiniteNumber(leftGroup?.position?.x, Number.POSITIVE_INFINITY) -
    readFiniteNumber(rightGroup?.position?.x, Number.POSITIVE_INFINITY);
  if (Math.abs(xDelta) > 0.001) {
    return xDelta;
  }

  const leftLabel = readOptionalString(leftGroup?.label) ?? "";
  const rightLabel = readOptionalString(rightGroup?.label) ?? "";
  return leftLabel.localeCompare(rightLabel);
}

function cloneGroupForSearch(groupCandidate) {
  return {
    ...groupCandidate,
    items: Array.isArray(groupCandidate?.items) ? [...groupCandidate.items] : [],
  };
}

function readSearchValue(nodeCandidate, workspaceContext, groupLabelCandidate) {
  const nodeLabel = readNodeSearchLabel(nodeCandidate, workspaceContext);
  const groupLabel = readOptionalString(groupLabelCandidate) ?? UNGROUPED_GROUP_LABEL;
  const nodeId = readOptionalString(nodeCandidate?.id) ?? "";
  return `${nodeLabel} ${groupLabel} ${nodeId}`.toLowerCase();
}

function readNodeSearchLabel(nodeCandidate, workspaceContext) {
  const nodeType = readOptionalString(nodeCandidate?.type);
  const nodeData = isObject(nodeCandidate?.data) ? nodeCandidate.data : {};

  if (nodeType === COMMENT_NODE_TYPE) {
    return readOptionalString(nodeData?.name) ?? DEFAULT_COMMENT_LABEL;
  }

  if (nodeType === LINK_NODE_TYPE) {
    return readOptionalString(nodeData?.titleOverride) ?? DEFAULT_LINK_LABEL;
  }

  if (nodeType === RAW_JSON_NODE_TYPE) {
    return readOptionalString(nodeData?.titleOverride) ?? DEFAULT_RAW_JSON_LABEL;
  }

  if (nodeType === DATA_NODE_TYPE) {
    const template = readTemplateForNode(nodeCandidate, workspaceContext);
    return (
      readOptionalString(nodeData?.titleOverride) ??
      readOptionalString(template?.label) ??
      readOptionalString(nodeCandidate?.id) ??
      "Node"
    );
  }

  return (
    readOptionalString(nodeData?.titleOverride) ??
    readOptionalString(nodeData?.name) ??
    readOptionalString(nodeCandidate?.id) ??
    "Node"
  );
}

function readRootGroupDescriptor(nodeCandidate, nodeById, absolutePositionByNodeId) {
  const directParentId = readOptionalString(nodeCandidate?.parentId);
  if (!directParentId) {
    return undefined;
  }

  const parentGroupNode = nodeById.get(directParentId);
  if (!parentGroupNode || readOptionalString(parentGroupNode?.type) !== GROUP_NODE_TYPE) {
    return undefined;
  }

  const groupLabel = readOptionalString(parentGroupNode?.data?.name) ?? "Group";
  const groupPosition = readAbsoluteNodePosition(
    parentGroupNode,
    nodeById,
    absolutePositionByNodeId,
  );

  return {
    id: directParentId,
    label: groupLabel,
    position: groupPosition,
  };
}

function readAbsoluteNodePosition(
  nodeCandidate,
  nodeById,
  absolutePositionByNodeId,
  visitedNodeIds = new Set(),
) {
  const nodeId = readOptionalString(nodeCandidate?.id);
  if (nodeId && absolutePositionByNodeId instanceof Map && absolutePositionByNodeId.has(nodeId)) {
    return absolutePositionByNodeId.get(nodeId);
  }

  const relativePosition = readNodePosition(nodeCandidate);
  if (!relativePosition) {
    return undefined;
  }

  const parentNodeId = readOptionalString(nodeCandidate?.parentId);
  if (!parentNodeId) {
    if (nodeId && absolutePositionByNodeId instanceof Map) {
      absolutePositionByNodeId.set(nodeId, relativePosition);
    }
    return relativePosition;
  }

  if (nodeId && visitedNodeIds.has(nodeId)) {
    return relativePosition;
  }

  const parentNode = nodeById instanceof Map ? nodeById.get(parentNodeId) : undefined;
  if (!parentNode) {
    return relativePosition;
  }

  const nextVisitedNodeIds = new Set(visitedNodeIds);
  if (nodeId) {
    nextVisitedNodeIds.add(nodeId);
  }

  const parentAbsolutePosition = readAbsoluteNodePosition(
    parentNode,
    nodeById,
    absolutePositionByNodeId,
    nextVisitedNodeIds,
  );
  if (!parentAbsolutePosition) {
    return relativePosition;
  }

  const absolutePosition = {
    x: parentAbsolutePosition.x + relativePosition.x,
    y: parentAbsolutePosition.y + relativePosition.y,
  };
  if (nodeId && absolutePositionByNodeId instanceof Map) {
    absolutePositionByNodeId.set(nodeId, absolutePosition);
  }
  return absolutePosition;
}

function readNodePosition(nodeCandidate) {
  const x = readFiniteNumber(nodeCandidate?.position?.x, Number.NaN);
  const y = readFiniteNumber(nodeCandidate?.position?.y, Number.NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return undefined;
  }

  return { x, y };
}

function readOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(candidate, fallback = 0) {
  return Number.isFinite(candidate) ? Number(candidate) : fallback;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
