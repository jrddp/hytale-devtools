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
      isMap: descriptor.isMap === true,
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

function readLinkedNodeEntriesFromValue(connectionValue, descriptor) {
  if (Array.isArray(connectionValue)) {
    const entries = [];
    for (const item of connectionValue) {
      const linkedNodeId = readNodeId(item);
      if (linkedNodeId) {
        entries.push({
          nodeId: linkedNodeId,
          mapKey: undefined,
        });
      }
    }
    return entries;
  }

  if (isObject(connectionValue)) {
    const directNodeId = readNodeId(connectionValue);
    if (directNodeId) {
      return [
        {
          nodeId: directNodeId,
          mapKey: undefined,
        },
      ];
    }

    if (descriptor?.isMap === true) {
      const entries = [];
      for (const [mapKeyCandidate, mapValue] of Object.entries(connectionValue)) {
        const linkedNodeId = readNodeId(mapValue);
        if (!linkedNodeId) {
          continue;
        }

        entries.push({
          nodeId: linkedNodeId,
          mapKey: normalizeNonEmptyString(mapKeyCandidate),
        });
      }
      return entries;
    }

    const entries = [];
    for (const mapValue of Object.values(connectionValue)) {
      const linkedNodeId = readNodeId(mapValue);
      if (!linkedNodeId) {
        continue;
      }
      entries.push({
        nodeId: linkedNodeId,
        mapKey: undefined,
      });
    }
    return entries;
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

      const linkedEntries = readLinkedNodeEntriesFromValue(
        sourcePayload[descriptor.schemaKey],
        descriptor
      );
      for (let index = 0; index < linkedEntries.length; index += 1) {
        const entry = linkedEntries[index];
        const targetNodeId = entry.nodeId;
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
          itemIndex: descriptor.isMap
            ? `${index}:${entry.mapKey ?? 'map'}`
            : index,
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
          data: {
            schemaKey: descriptor.schemaKey,
            ...(descriptor.isMap === true && entry.mapKey ? { mapKey: entry.mapKey } : {}),
          },
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
  resolveMapKeyForTargetNode,
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
      const existingEntries = readLinkedNodeEntriesFromValue(
        sourcePayload[descriptor.schemaKey],
        descriptor
      );
      const existingTargetIds = existingEntries.map((entry) => entry.nodeId);
      const existingMapKeyByNodeId = new Map();
      for (const existingEntry of existingEntries) {
        if (!existingEntry.mapKey || existingMapKeyByNodeId.has(existingEntry.nodeId)) {
          continue;
        }
        existingMapKeyByNodeId.set(existingEntry.nodeId, existingEntry.mapKey);
      }
      const mergedTargetIds = mergeLinkedNodeOrder(existingTargetIds, desiredTargetIds);
      const resolvedTargetPayloads = mergedTargetIds
        .map((targetNodeId) => ({
          targetNodeId,
          targetPayload: nextNodePayloadById[targetNodeId],
        }))
        .filter((entry) => isObject(entry.targetPayload));

      if (resolvedTargetPayloads.length === 0) {
        delete sourcePayload[descriptor.schemaKey];
        continue;
      }

      if (descriptor.isMap) {
        const nextMappedValue = {};
        const usedKeys = new Set();
        for (let index = 0; index < resolvedTargetPayloads.length; index += 1) {
          const entry = resolvedTargetPayloads[index];
          const fallbackMapKey = existingMapKeyByNodeId.get(entry.targetNodeId);
          const requestedMapKey =
            normalizeNonEmptyString(fallbackMapKey) ??
            normalizeNonEmptyString(
              typeof resolveMapKeyForTargetNode === 'function'
                ? resolveMapKeyForTargetNode({
                    sourceNodeId,
                    descriptor,
                    targetNodeId: entry.targetNodeId,
                    targetPayload: entry.targetPayload,
                    itemIndex: index,
                  })
                : undefined
            ) ??
            entry.targetNodeId;

          const uniqueMapKey = buildUniqueMapKey(requestedMapKey, usedKeys);
          usedKeys.add(uniqueMapKey);
          nextMappedValue[uniqueMapKey] = entry.targetPayload;
        }

        sourcePayload[descriptor.schemaKey] = nextMappedValue;
        continue;
      }

      if (descriptor.multiple) {
        sourcePayload[descriptor.schemaKey] = resolvedTargetPayloads.map((entry) => entry.targetPayload);
        continue;
      }

      sourcePayload[descriptor.schemaKey] = resolvedTargetPayloads[0].targetPayload;
    }

    nextNodePayloadById[sourceNodeId] = sourcePayload;
  }

  return nextNodePayloadById;
}

function buildUniqueMapKey(baseMapKey, usedKeys) {
  const normalizedBase = normalizeNonEmptyString(baseMapKey) ?? 'Node';
  if (!usedKeys.has(normalizedBase)) {
    return normalizedBase;
  }

  let suffix = 2;
  while (usedKeys.has(`${normalizedBase}_${suffix}`)) {
    suffix += 1;
  }

  return `${normalizedBase}_${suffix}`;
}
