import { persistedRuntimeKeys } from "./runtimeKeyMapping.js";
import { isObject } from "./valueUtils.js";

export function collectNodeIdsFromPayload(
  rootPayload: unknown,
  collectedIds: Set<string>
): void {
  const metadataKey = persistedRuntimeKeys.nodeEditorMetadata;
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item);
      }
      return;
    }

    if (!isObject(candidate)) {
      return;
    }

    const nodeId = typeof candidate.$NodeId === "string" ? candidate.$NodeId : undefined;
    if (nodeId) {
      collectedIds.add(nodeId);
    }

    for (const [key, value] of Object.entries(candidate)) {
      if (key === metadataKey) {
        continue;
      }
      visit(value);
    }
  };

  visit(rootPayload);
}

export function rewriteNodePayloadTree(
  candidate: unknown,
  payloadById: Record<string, Record<string, unknown>>
): unknown {
  const metadataKey = persistedRuntimeKeys.nodeEditorMetadata;
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

  const nodeId = typeof candidate.$NodeId === "string" ? candidate.$NodeId : undefined;
  const source =
    nodeId && isObject(payloadById?.[nodeId]) ? payloadById[nodeId] : candidate;
  let changed = source !== candidate;
  const rewrittenObject: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === metadataKey) {
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
