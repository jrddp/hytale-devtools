import {
  NODE_EDITOR_METADATA_KEY,
  isObject,
  normalizeNodeId,
  normalizeNonEmptyString,
  normalizePosition,
  omitKeys,
} from './assetDocumentUtils.js';

export const LEGACY_ROOT_EDITOR_KEYS = [
  '$WorkspaceID',
  '$Groups',
  '$Comments',
  '$Links',
  '$FloatingNodes',
];

function isPositionValue(candidatePosition) {
  if (!isObject(candidatePosition)) {
    return false;
  }

  return (
    Number.isFinite(Number(candidatePosition.$x)) ||
    Number.isFinite(Number(candidatePosition.$y))
  );
}

export function isLegacyInlineAssetDocument(root) {
  if (!isObject(root) || isObject(root[NODE_EDITOR_METADATA_KEY])) {
    return false;
  }

  const hasRootMarkers =
    isPositionValue(root.$Position) ||
    normalizeNonEmptyString(root.$Title) !== undefined ||
    normalizeNonEmptyString(root.$WorkspaceID) !== undefined ||
    Array.isArray(root.$Groups) ||
    Array.isArray(root.$Comments) ||
    isObject(root.$Links) ||
    Array.isArray(root.$FloatingNodes);
  if (hasRootMarkers) {
    return true;
  }

  let hasInlinePositions = false;
  const scan = (candidate) => {
    if (hasInlinePositions) {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        scan(item);
        if (hasInlinePositions) {
          return;
        }
      }
      return;
    }

    if (!isObject(candidate)) {
      return;
    }

    if (isPositionValue(candidate.$Position)) {
      hasInlinePositions = true;
      return;
    }

    for (const value of Object.values(candidate)) {
      scan(value);
      if (hasInlinePositions) {
        return;
      }
    }
  };

  scan(root);
  return hasInlinePositions;
}

export function convertLegacyInlineAssetDocument(
  root,
  { resolveNodeIdPrefix } = {}
) {
  if (!isObject(root)) {
    return {
      runtime: {},
      metadataRoot: {
        $Nodes: {},
        $FloatingNodes: [],
        $Links: {},
        $Groups: [],
        $Comments: [],
      },
    };
  }

  const legacyRuntimeRoot = omitKeys(root, LEGACY_ROOT_EDITOR_KEYS);
  const nodeMetadataById = {};
  let fallbackIndex = 0;

  const visit = (
    candidate,
    {
      forceNode = false,
      keyHint = undefined,
      parentPayload = undefined,
      parentNodeId = undefined,
    } = {}
  ) => {
    if (Array.isArray(candidate)) {
      return candidate.map((item) =>
        visit(item, {
          forceNode: false,
          keyHint,
          parentPayload,
          parentNodeId,
        })
      );
    }

    if (!isObject(candidate)) {
      return candidate;
    }

    const shouldTreatAsNode =
      forceNode ||
      normalizeNonEmptyString(candidate.$NodeId) !== undefined ||
      isPositionValue(candidate.$Position) ||
      normalizeNonEmptyString(candidate.$Title) !== undefined;
    if (!shouldTreatAsNode) {
      const transformed = {};
      for (const [childKey, childValue] of Object.entries(candidate)) {
        transformed[childKey] = visit(childValue, {
          forceNode: false,
          keyHint: childKey,
          parentPayload,
          parentNodeId,
        });
      }
      return transformed;
    }

    const prefixHint =
      normalizeNonEmptyString(
        typeof resolveNodeIdPrefix === 'function'
          ? resolveNodeIdPrefix({
              payload: candidate,
              keyHint,
              parentPayload,
              parentNodeId,
              isRoot: forceNode === true && parentPayload === undefined,
            })
          : undefined
      ) ??
      normalizeNonEmptyString(candidate.Type) ??
      normalizeNonEmptyString(keyHint) ??
      'Node';
    const nodeId = normalizeNodeId(candidate.$NodeId, prefixHint);

    const position = normalizePosition(candidate.$Position, fallbackIndex);
    fallbackIndex += 1;
    const title = normalizeNonEmptyString(candidate.$Title);
    nodeMetadataById[nodeId] = {
      $Position: {
        $x: position.x,
        $y: position.y,
      },
      ...(title !== undefined ? { $Title: title } : {}),
    };

    const payloadForChildren = {
      ...candidate,
      $NodeId: nodeId,
    };
    const transformedNode = {};
    for (const [childKey, childValue] of Object.entries(candidate)) {
      if (childKey === '$Position' || childKey === '$Title') {
        continue;
      }

      transformedNode[childKey] = visit(childValue, {
        forceNode: false,
        keyHint: childKey,
        parentPayload: payloadForChildren,
        parentNodeId: nodeId,
      });
    }
    transformedNode.$NodeId = nodeId;
    return transformedNode;
  };

  const runtime = visit(legacyRuntimeRoot, {
    forceNode: true,
    keyHint: 'Root',
    parentPayload: undefined,
    parentNodeId: undefined,
  });

  const floatingRoots = Array.isArray(root.$FloatingNodes) ? root.$FloatingNodes : [];
  const convertedFloatingRoots = floatingRoots
    .map((floatingRoot, index) =>
      visit(floatingRoot, {
        forceNode: true,
        keyHint: `Floating${index}`,
        parentPayload: undefined,
        parentNodeId: undefined,
      })
    )
    .filter((floatingRoot) => isObject(floatingRoot));

  const metadataRoot = {
    ...(normalizeNonEmptyString(root.$WorkspaceID) !== undefined
      ? { $WorkspaceID: root.$WorkspaceID.trim() }
      : {}),
    $Nodes: nodeMetadataById,
    $FloatingNodes: convertedFloatingRoots,
    $Links: isObject(root.$Links) ? { ...root.$Links } : {},
    $Groups: Array.isArray(root.$Groups) ? root.$Groups : [],
    $Comments: Array.isArray(root.$Comments) ? root.$Comments : [],
  };

  return {
    runtime: isObject(runtime) ? runtime : {},
    metadataRoot,
  };
}
