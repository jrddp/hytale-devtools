import {
  NODE_EDITOR_METADATA_KEY,
  isObject,
  normalizeNodeId,
  normalizeNonEmptyString,
  omitKeys,
} from './assetDocumentUtils.js';

export const LEGACY_ROOT_EDITOR_KEYS = [
  '$WorkspaceID',
  '$Groups',
  '$Comments',
  '$Links',
  '$FloatingNodes',
];

export function isLegacyInlineAssetDocument(root) {
  return isObject(root) && !isObject(root[NODE_EDITOR_METADATA_KEY]);
}

function hasLegacyInlinePosition(candidatePosition) {
  if (!isObject(candidatePosition)) {
    return false;
  }

  return (
    Number.isFinite(Number(candidatePosition.$x)) ||
    Number.isFinite(Number(candidatePosition.$y)) ||
    Number.isFinite(Number(candidatePosition.x)) ||
    Number.isFinite(Number(candidatePosition.y))
  );
}

function normalizeLegacyPosition(candidatePosition) {
  const x = Number(candidatePosition?.$x ?? candidatePosition?.x);
  const y = Number(candidatePosition?.$y ?? candidatePosition?.y);

  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

export function convertLegacyInlineAssetDocument(
  root,
  { resolveNodeIdPrefix, shouldTreatAsLegacyNodePayload } = {}
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
      hasLegacyInlinePosition(candidate.$Position) ||
      normalizeNonEmptyString(candidate.$Title) !== undefined ||
      (typeof shouldTreatAsLegacyNodePayload === 'function'
        ? shouldTreatAsLegacyNodePayload({
            payload: candidate,
            keyHint,
            parentPayload,
            parentNodeId,
            isRoot: forceNode === true && parentPayload === undefined,
          }) === true
        : false);
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
      normalizeNonEmptyString(candidate.Id) ??
      normalizeNonEmptyString(candidate.Type) ??
      normalizeNonEmptyString(keyHint) ??
      'Node';
    const nodeId = normalizeNodeId(candidate.$NodeId, prefixHint);

    const position = normalizeLegacyPosition(candidate.$Position);
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
