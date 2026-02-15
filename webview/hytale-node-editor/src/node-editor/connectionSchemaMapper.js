function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function normalizeConnectionDescriptors(template) {
  if (!Array.isArray(template?.schemaConnections)) {
    return [];
  }

  const descriptors = [];
  for (const descriptor of template.schemaConnections) {
    if (!isObject(descriptor)) {
      continue;
    }

    const schemaKey = normalizeNonEmptyString(descriptor.schemaKey);
    const outputPinId = normalizeNonEmptyString(descriptor.outputPinId);
    if (!schemaKey || !outputPinId) {
      continue;
    }

    descriptors.push({
      schemaKey,
      outputPinId,
      outputPinType: normalizeNonEmptyString(descriptor.outputPinType),
      multiple: descriptor.multiple === true,
    });
  }

  return descriptors;
}

function readNodeId(candidate) {
  if (typeof candidate?.$NodeId === 'string' && candidate.$NodeId.trim()) {
    return candidate.$NodeId.trim();
  }

  return undefined;
}

function readLinkedNodeIdsFromValue(connectionValue) {
  if (Array.isArray(connectionValue)) {
    const linkedIds = [];
    for (const item of connectionValue) {
      const linkedNodeId = readNodeId(item);
      if (linkedNodeId) {
        linkedIds.push(linkedNodeId);
      }
    }
    return linkedIds;
  }

  if (isObject(connectionValue)) {
    const linkedNodeId = readNodeId(connectionValue);
    return linkedNodeId ? [linkedNodeId] : [];
  }

  return [];
}

function buildSchemaEdgeId({
  sourceNodeId,
  sourceHandleId,
  targetNodeId,
  targetHandleId,
  schemaKey,
  itemIndex,
}) {
  const safeTargetHandle = targetHandleId ?? 'target';
  return `${sourceNodeId}:${sourceHandleId}:${schemaKey}:${itemIndex}->${targetNodeId}:${safeTargetHandle}`;
}

function mergeLinkedNodeOrder(existingNodeIds, desiredNodeIds) {
  const ordered = [];
  const seen = new Set();
  const desiredSet = new Set(desiredNodeIds);

  for (const existingNodeId of existingNodeIds) {
    if (!desiredSet.has(existingNodeId) || seen.has(existingNodeId)) {
      continue;
    }

    seen.add(existingNodeId);
    ordered.push(existingNodeId);
  }

  for (const desiredNodeId of desiredNodeIds) {
    if (seen.has(desiredNodeId)) {
      continue;
    }

    seen.add(desiredNodeId);
    ordered.push(desiredNodeId);
  }

  return ordered;
}

function createSourceHandleKey(sourceNodeId, sourceHandleId) {
  return `${sourceNodeId}\u0000${sourceHandleId}`;
}

export function chooseCompatibleInputHandleId(sourcePinType, targetTemplate) {
  const inputPins = Array.isArray(targetTemplate?.inputPins) ? targetTemplate.inputPins : [];
  if (inputPins.length === 0) {
    return undefined;
  }

  const normalizedSourcePinType = normalizeNonEmptyString(sourcePinType);
  if (normalizedSourcePinType) {
    const typeMatch = inputPins.find(
      (pin) => normalizeNonEmptyString(pin?.type) === normalizedSourcePinType
    );
    if (typeMatch) {
      return normalizeNonEmptyString(typeMatch.id);
    }
  }

  return normalizeNonEmptyString(inputPins[0]?.id);
}

export function extractSchemaEdgesFromNodePayloads({
  nodePayloadById,
  resolveTemplateByNodeId,
}) {
  if (!isObject(nodePayloadById) || typeof resolveTemplateByNodeId !== 'function') {
    return [];
  }

  const edges = [];
  const seenEdgeIds = new Set();
  const sourceNodeIds = Object.keys(nodePayloadById).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const sourceNodeId of sourceNodeIds) {
    const sourcePayload = nodePayloadById[sourceNodeId];
    if (!isObject(sourcePayload)) {
      continue;
    }

    const sourceTemplate = resolveTemplateByNodeId(sourceNodeId, sourcePayload);
    const sourceDescriptors = normalizeConnectionDescriptors(sourceTemplate);
    for (const descriptor of sourceDescriptors) {
      const sourceHandleId = normalizeNonEmptyString(descriptor.outputPinId);
      if (!sourceHandleId) {
        continue;
      }

      const linkedNodeIds = readLinkedNodeIdsFromValue(sourcePayload[descriptor.schemaKey]);
      for (let index = 0; index < linkedNodeIds.length; index += 1) {
        const targetNodeId = linkedNodeIds[index];
        const targetPayload = isObject(nodePayloadById[targetNodeId])
          ? nodePayloadById[targetNodeId]
          : undefined;
        const targetTemplate = resolveTemplateByNodeId(targetNodeId, targetPayload);
        const targetHandleId = chooseCompatibleInputHandleId(
          descriptor.outputPinType,
          targetTemplate
        );

        const baseEdgeId = buildSchemaEdgeId({
          sourceNodeId,
          sourceHandleId,
          targetNodeId,
          targetHandleId,
          schemaKey: descriptor.schemaKey,
          itemIndex: index,
        });

        let edgeId = baseEdgeId;
        let duplicateCounter = 1;
        while (seenEdgeIds.has(edgeId)) {
          edgeId = `${baseEdgeId}#${duplicateCounter}`;
          duplicateCounter += 1;
        }

        seenEdgeIds.add(edgeId);
        edges.push({
          id: edgeId,
          source: sourceNodeId,
          target: targetNodeId,
          sourceHandle: sourceHandleId,
          ...(targetHandleId ? { targetHandle: targetHandleId } : {}),
        });
      }
    }
  }

  return edges;
}

export function applySchemaEdgesToNodePayloads({
  nodePayloadById,
  edges,
  resolveTemplateByNodeId,
}) {
  if (!isObject(nodePayloadById) || typeof resolveTemplateByNodeId !== 'function') {
    return isObject(nodePayloadById) ? { ...nodePayloadById } : {};
  }

  const nextNodePayloadById = {};
  for (const [nodeId, payload] of Object.entries(nodePayloadById)) {
    nextNodePayloadById[nodeId] = isObject(payload) ? { ...payload } : payload;
  }

  const desiredTargetsBySourceHandle = new Map();
  const inputEdges = Array.isArray(edges) ? edges : [];
  for (const edge of inputEdges) {
    const sourceNodeId = normalizeNonEmptyString(edge?.source);
    const targetNodeId = normalizeNonEmptyString(edge?.target);
    const sourceHandleId = normalizeNonEmptyString(edge?.sourceHandle);

    if (!sourceNodeId || !targetNodeId || !sourceHandleId) {
      continue;
    }

    if (!isObject(nextNodePayloadById[sourceNodeId]) || !isObject(nextNodePayloadById[targetNodeId])) {
      continue;
    }

    const sourceHandleKey = createSourceHandleKey(sourceNodeId, sourceHandleId);
    if (!desiredTargetsBySourceHandle.has(sourceHandleKey)) {
      desiredTargetsBySourceHandle.set(sourceHandleKey, []);
    }

    const targets = desiredTargetsBySourceHandle.get(sourceHandleKey);
    if (!targets.includes(targetNodeId)) {
      targets.push(targetNodeId);
    }
  }

  for (const [sourceNodeId, sourcePayloadCandidate] of Object.entries(nextNodePayloadById)) {
    if (!isObject(sourcePayloadCandidate)) {
      continue;
    }

    const sourcePayload = sourcePayloadCandidate;
    const sourceTemplate = resolveTemplateByNodeId(sourceNodeId, sourcePayload);
    const sourceDescriptors = normalizeConnectionDescriptors(sourceTemplate);

    for (const descriptor of sourceDescriptors) {
      const sourceHandleId = normalizeNonEmptyString(descriptor.outputPinId);
      if (!sourceHandleId) {
        continue;
      }

      const sourceHandleKey = createSourceHandleKey(sourceNodeId, sourceHandleId);
      const desiredTargetIds = desiredTargetsBySourceHandle.get(sourceHandleKey) ?? [];
      const existingTargetIds = readLinkedNodeIdsFromValue(sourcePayload[descriptor.schemaKey]);
      const mergedTargetIds = mergeLinkedNodeOrder(existingTargetIds, desiredTargetIds);
      const resolvedTargetPayloads = mergedTargetIds
        .map((targetNodeId) => nextNodePayloadById[targetNodeId])
        .filter((targetPayload) => isObject(targetPayload));

      if (resolvedTargetPayloads.length === 0) {
        delete sourcePayload[descriptor.schemaKey];
        continue;
      }

      if (descriptor.multiple) {
        sourcePayload[descriptor.schemaKey] = resolvedTargetPayloads;
        continue;
      }

      sourcePayload[descriptor.schemaKey] = resolvedTargetPayloads[0];
    }

    nextNodePayloadById[sourceNodeId] = sourcePayload;
  }

  return nextNodePayloadById;
}
