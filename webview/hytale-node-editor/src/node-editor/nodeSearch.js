import {
  COMMENT_NODE_TYPE,
  CUSTOM_NODE_TYPE,
  GROUP_NODE_TYPE,
  LINK_NODE_TYPE,
  RAW_JSON_NODE_TYPE,
} from "./types.js";
import { findTemplateByTypeName, getTemplateById } from "./templateCatalog.js";
import { getDefaultPinColor } from "./pinColorUtils.js";

const UNGROUPED_GROUP_ID = "__ungrouped__";
const UNGROUPED_GROUP_LABEL = "Ungrouped";
const DEFAULT_COMMENT_LABEL = "Comment";
const DEFAULT_LINK_LABEL = "Link";
const DEFAULT_RAW_JSON_LABEL = "Raw JSON Node";
const COMMENT_NODE_COLOR = "var(--vscode-descriptionForeground)";
const LINK_NODE_COLOR = "var(--vscode-descriptionForeground)";
const RAW_JSON_NODE_COLOR = "var(--vscode-focusBorder)";

export function buildNodeSearchGroups({ nodes, workspaceContext } = {}) {
  const normalizedNodes = Array.isArray(nodes) ? nodes : [];
  if (normalizedNodes.length === 0) {
    return [];
  }

  const nodeById = new Map();
  for (const node of normalizedNodes) {
    const nodeId = normalizeOptionalString(node?.id);
    if (nodeId) {
      nodeById.set(nodeId, node);
    }
  }

  const absolutePositionByNodeId = new Map();
  const rootGroupsById = new Map();

  for (const node of normalizedNodes) {
    if (!isNodeSearchEligible(node)) {
      continue;
    }

    const nodeId = normalizeOptionalString(node?.id);
    if (!nodeId) {
      continue;
    }

    const absolutePosition = readAbsoluteNodePosition(node, nodeById, absolutePositionByNodeId);
    if (!absolutePosition) {
      continue;
    }

    const rootGroupDescriptor = readRootGroupDescriptor(
      node,
      nodeById,
      absolutePositionByNodeId
    );
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
  const normalizedGroups = Array.isArray(groups) ? groups : [];
  const normalizedQuery = normalizeOptionalString(queryCandidate)?.toLowerCase() ?? "";
  if (!normalizedQuery) {
    return normalizedGroups.map(cloneGroupForSearch);
  }

  return normalizedGroups
    .map((group) => ({
      ...group,
      items: (Array.isArray(group?.items) ? group.items : []).filter((item) =>
        (typeof item?.searchValue === "string" ? item.searchValue : "").includes(normalizedQuery)
      ),
    }))
    .filter((group) => group.items.length > 0);
}

export function isNodeSearchEligible(nodeCandidate) {
  return normalizeOptionalString(nodeCandidate?.type) !== GROUP_NODE_TYPE;
}

export function compareNodeSearchEntries(leftEntry, rightEntry) {
  const yDelta = readFiniteNumber(leftEntry?.position?.y) - readFiniteNumber(rightEntry?.position?.y);
  if (Math.abs(yDelta) > 0.001) {
    return yDelta;
  }

  const xDelta = readFiniteNumber(leftEntry?.position?.x) - readFiniteNumber(rightEntry?.position?.x);
  if (Math.abs(xDelta) > 0.001) {
    return xDelta;
  }

  const leftLabel = normalizeOptionalString(leftEntry?.label) ?? "";
  const rightLabel = normalizeOptionalString(rightEntry?.label) ?? "";
  return leftLabel.localeCompare(rightLabel);
}

function compareNodeSearchGroups(leftGroup, rightGroup) {
  const leftIsUngrouped = leftGroup?.isUngrouped === true;
  const rightIsUngrouped = rightGroup?.isUngrouped === true;
  if (leftIsUngrouped !== rightIsUngrouped) {
    return leftIsUngrouped ? 1 : -1;
  }

  const yDelta = readFiniteNumber(leftGroup?.position?.y, Number.POSITIVE_INFINITY) -
    readFiniteNumber(rightGroup?.position?.y, Number.POSITIVE_INFINITY);
  if (Math.abs(yDelta) > 0.001) {
    return yDelta;
  }

  const xDelta = readFiniteNumber(leftGroup?.position?.x, Number.POSITIVE_INFINITY) -
    readFiniteNumber(rightGroup?.position?.x, Number.POSITIVE_INFINITY);
  if (Math.abs(xDelta) > 0.001) {
    return xDelta;
  }

  const leftLabel = normalizeOptionalString(leftGroup?.label) ?? "";
  const rightLabel = normalizeOptionalString(rightGroup?.label) ?? "";
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
  const groupLabel = normalizeOptionalString(groupLabelCandidate) ?? UNGROUPED_GROUP_LABEL;
  const nodeId = normalizeOptionalString(nodeCandidate?.id) ?? "";
  return `${nodeLabel} ${groupLabel} ${nodeId}`.toLowerCase();
}

function readNodeSearchLabel(nodeCandidate, workspaceContext) {
  const nodeType = normalizeOptionalString(nodeCandidate?.type);
  const nodeData = isObject(nodeCandidate?.data) ? nodeCandidate.data : {};

  if (nodeType === COMMENT_NODE_TYPE) {
    return normalizeOptionalString(nodeData?.$commentName) ?? DEFAULT_COMMENT_LABEL;
  }

  if (nodeType === LINK_NODE_TYPE) {
    return normalizeOptionalString(nodeData?.label) ?? DEFAULT_LINK_LABEL;
  }

  if (nodeType === RAW_JSON_NODE_TYPE) {
    return normalizeOptionalString(nodeData?.label) ?? DEFAULT_RAW_JSON_LABEL;
  }

  if (nodeType === CUSTOM_NODE_TYPE) {
    const template = readTemplateForNode(nodeCandidate, workspaceContext);
    return (
      normalizeOptionalString(nodeData?.label) ??
      normalizeOptionalString(template?.label) ??
      normalizeOptionalString(nodeCandidate?.id) ??
      "Node"
    );
  }

  return (
    normalizeOptionalString(nodeData?.label) ??
    normalizeOptionalString(nodeData?.$commentName) ??
    normalizeOptionalString(nodeCandidate?.id) ??
    "Node"
  );
}

function readNodeSearchColor(nodeCandidate, workspaceContext) {
  const nodeType = normalizeOptionalString(nodeCandidate?.type);
  if (nodeType === COMMENT_NODE_TYPE) {
    return COMMENT_NODE_COLOR;
  }

  if (nodeType === LINK_NODE_TYPE) {
    return LINK_NODE_COLOR;
  }

  if (nodeType === RAW_JSON_NODE_TYPE) {
    return RAW_JSON_NODE_COLOR;
  }

  if (nodeType === CUSTOM_NODE_TYPE) {
    const template = readTemplateForNode(nodeCandidate, workspaceContext);
    return normalizeOptionalString(template?.nodeColor) ?? getDefaultPinColor();
  }

  return getDefaultPinColor();
}

function readTemplateForNode(nodeCandidate, workspaceContext) {
  const nodeData = isObject(nodeCandidate?.data) ? nodeCandidate.data : {};
  const templateId = normalizeOptionalString(nodeData?.$templateId);

  return (
    (templateId ? getTemplateById(templateId, workspaceContext) : undefined) ??
    findTemplateByTypeName(nodeData?.Type, workspaceContext)
  );
}

function readRootGroupDescriptor(nodeCandidate, nodeById, absolutePositionByNodeId) {
  const directParentId = normalizeOptionalString(nodeCandidate?.parentId);
  if (!directParentId) {
    return undefined;
  }

  const parentGroupNode = nodeById.get(directParentId);
  if (!parentGroupNode || normalizeOptionalString(parentGroupNode?.type) !== GROUP_NODE_TYPE) {
    return undefined;
  }

  const groupLabel = normalizeOptionalString(parentGroupNode?.data?.$groupName) ?? "Group";
  const groupPosition = readAbsoluteNodePosition(
    parentGroupNode,
    nodeById,
    absolutePositionByNodeId
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
  visitedNodeIds = new Set()
) {
  const nodeId = normalizeOptionalString(nodeCandidate?.id);
  if (nodeId && absolutePositionByNodeId instanceof Map && absolutePositionByNodeId.has(nodeId)) {
    return absolutePositionByNodeId.get(nodeId);
  }

  const relativePosition = readNodePosition(nodeCandidate);
  if (!relativePosition) {
    return undefined;
  }

  const parentNodeId = normalizeOptionalString(nodeCandidate?.parentId);
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
    nextVisitedNodeIds
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

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(candidate, fallback = 0) {
  return Number.isFinite(candidate) ? Number(candidate) : fallback;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
