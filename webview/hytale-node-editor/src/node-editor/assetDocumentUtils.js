export const NODE_EDITOR_METADATA_KEY = "$NodeEditorMetadata";

export function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function normalizeNonEmptyString(candidate) {
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : undefined;
}

export function omitKeys(source, keysToOmit) {
  if (!isObject(source)) {
    return {};
  }

  const omitSet = new Set(keysToOmit);
  return Object.fromEntries(Object.entries(source).filter(([key]) => !omitSet.has(key)));
}

export function defaultLabelForNodeId(nodeId) {
  if (typeof nodeId !== "string" || !nodeId.trim()) {
    return "Node";
  }

  const [prefix, suffix] = nodeId.split("-", 2);
  if (prefix && suffix) {
    return prefix;
  }

  return nodeId;
}

export function normalizeNodeId(candidate, typeHint) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return String(candidate);
  }

  const cleanType = normalizeNonEmptyString(typeHint) ?? "Node";
  return `${cleanType}-${createUuid()}`;
}

export function normalizeHandleId(candidate) {
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }

  return undefined;
}

export function normalizePosition(candidatePosition, index) {
  const fallbackX = index * 180;
  const fallbackY = 100;
  const x = Number(candidatePosition?.x);
  const y = Number(candidatePosition?.y);
  const metaX = Number(candidatePosition?.$x);
  const metaY = Number(candidatePosition?.$y);

  return {
    x: Number.isFinite(x) ? x : Number.isFinite(metaX) ? metaX : fallbackX,
    y: Number.isFinite(y) ? y : Number.isFinite(metaY) ? metaY : fallbackY,
  };
}

export function readRuntimeRootNodeId(runtimeRoot) {
  if (!isObject(runtimeRoot)) {
    return undefined;
  }

  if (typeof runtimeRoot.$NodeId === "string" && runtimeRoot.$NodeId.trim()) {
    return runtimeRoot.$NodeId.trim();
  }

  return undefined;
}

export function readTypeFromNodeId(nodeId) {
  const normalizedNodeId = normalizeNonEmptyString(nodeId);
  if (!normalizedNodeId) {
    return undefined;
  }

  const match = normalizedNodeId.match(
    /^(.*)-([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
  );
  if (!match) {
    return undefined;
  }

  const typePrefix = normalizeNonEmptyString(match[1]);
  return typePrefix ?? undefined;
}

export function collectRuntimeNodePayloadById(runtimeRoot) {
  const payloadById = {};

  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (!isObject(candidate)) {
      return;
    }

    const nodeId =
      typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()
        ? candidate.$NodeId.trim()
        : undefined;

    if (nodeId && !isObject(payloadById[nodeId])) {
      payloadById[nodeId] = candidate;
    }

    for (const [key, value] of Object.entries(candidate)) {
      if (key === NODE_EDITOR_METADATA_KEY) {
        continue;
      }
      visit(value);
    }
  };

  visit(runtimeRoot);
  return payloadById;
}

export function collectNodeIdsFromPayload(rootPayload, collectedIds) {
  const visit = (candidate) => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (!isObject(candidate)) {
      return;
    }

    const nodeId =
      typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()
        ? candidate.$NodeId.trim()
        : undefined;
    if (nodeId) {
      collectedIds.add(nodeId);
    }

    for (const [key, value] of Object.entries(candidate)) {
      if (key === NODE_EDITOR_METADATA_KEY) {
        continue;
      }
      visit(value);
    }
  };

  visit(rootPayload);
}

export function rewriteNodePayloadTree(candidate, payloadById) {
  if (Array.isArray(candidate)) {
    let changed = false;
    const rewrittenArray = candidate.map((item) => {
      const rewrittenItem = rewriteNodePayloadTree(item, payloadById);
      if (rewrittenItem !== item) {
        changed = true;
      }
      return rewrittenItem;
    });
    return changed ? rewrittenArray : candidate;
  }

  if (!isObject(candidate)) {
    return candidate;
  }

  const nodeId =
    typeof candidate.$NodeId === "string" && candidate.$NodeId.trim()
      ? candidate.$NodeId.trim()
      : undefined;
  const source =
    nodeId && isObject(payloadById?.[nodeId]) ? payloadById[nodeId] : candidate;

  let changed = source !== candidate;
  const rewrittenObject = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === NODE_EDITOR_METADATA_KEY) {
      rewrittenObject[key] = value;
      continue;
    }

    const rewrittenValue = rewriteNodePayloadTree(value, payloadById);
    if (rewrittenValue !== value) {
      changed = true;
    }
    rewrittenObject[key] = rewrittenValue;
  }

  return changed ? rewrittenObject : source;
}

export function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(16).slice(2);
}
