const SCHEMA_VARIANT_POINTER_FIELDS = ["allOf", "anyOf", "oneOf"];

export function normalizeNodeSchemaMappingsByWorkspace(documentCandidate) {
  const mappingsByWorkspace = new Map();
  if (!isObject(documentCandidate)) {
    return mappingsByWorkspace;
  }

  for (const [workspaceIdCandidate, workspaceMappingsCandidate] of Object.entries(
    documentCandidate
  )) {
    const workspaceId = normalizeOptionalString(workspaceIdCandidate);
    if (!workspaceId || !isObject(workspaceMappingsCandidate)) {
      continue;
    }

    const mappingsByNodeId = new Map();
    for (const [nodeIdCandidate, schemaDefinitionCandidate] of Object.entries(
      workspaceMappingsCandidate
    )) {
      const nodeId = normalizeOptionalString(nodeIdCandidate);
      const schemaDefinition = normalizeOptionalString(schemaDefinitionCandidate);
      if (!nodeId || !schemaDefinition) {
        continue;
      }

      mappingsByNodeId.set(nodeId, schemaDefinition);
    }

    if (mappingsByNodeId.size > 0) {
      mappingsByWorkspace.set(workspaceId, mappingsByNodeId);
    }
  }

  return mappingsByWorkspace;
}

export function resolveMappedSchemaDefinitionForNode({
  workspaceId,
  templateId,
  schemaType,
  payloadType,
  mappingsByWorkspace,
} = {}) {
  const normalizedWorkspaceId = normalizeOptionalString(workspaceId);
  const lookupKeyCandidates = Array.from(
    new Set(
      [templateId, schemaType, payloadType]
        .map((candidate) => normalizeOptionalString(candidate))
        .filter(Boolean)
    )
  );
  if (!normalizedWorkspaceId || lookupKeyCandidates.length === 0) {
    return {
      workspaceId: normalizedWorkspaceId,
      lookupKey: undefined,
      schemaDefinition: undefined,
      resolvedSchema: undefined,
    };
  }

  const normalizedMappingsByWorkspace =
    mappingsByWorkspace instanceof Map ? mappingsByWorkspace : new Map();
  const workspaceMappings = normalizedMappingsByWorkspace.get(normalizedWorkspaceId);
  if (!(workspaceMappings instanceof Map) || workspaceMappings.size === 0) {
    return {
      workspaceId: normalizedWorkspaceId,
      lookupKey: undefined,
      schemaDefinition: undefined,
      resolvedSchema: undefined,
    };
  }

  for (const lookupKeyCandidate of lookupKeyCandidates) {
    const mappedDefinition = workspaceMappings.get(lookupKeyCandidate);
    if (!mappedDefinition) {
      continue;
    }

    return {
      workspaceId: normalizedWorkspaceId,
      lookupKey: lookupKeyCandidate,
      schemaDefinition: mappedDefinition,
      resolvedSchema: parseMappedSchemaDefinition(mappedDefinition),
    };
  }

  const lookupKeyCandidateByLowerValue = new Map(
    lookupKeyCandidates.map((candidate) => [candidate.toLowerCase(), candidate])
  );
  for (const [mappedNodeId, mappedDefinition] of workspaceMappings.entries()) {
    const matchedLookupKey = lookupKeyCandidateByLowerValue.get(mappedNodeId.toLowerCase());
    if (!matchedLookupKey) {
      continue;
    }

    return {
      workspaceId: normalizedWorkspaceId,
      lookupKey: matchedLookupKey,
      schemaDefinition: mappedDefinition,
      resolvedSchema: parseMappedSchemaDefinition(mappedDefinition),
    };
  }

  return {
    workspaceId: normalizedWorkspaceId,
    lookupKey: undefined,
    schemaDefinition: undefined,
    resolvedSchema: undefined,
  };
}

export function parseMappedSchemaDefinition(schemaDefinitionCandidate) {
  const schemaDefinition = normalizeOptionalString(schemaDefinitionCandidate);
  if (!schemaDefinition) {
    return undefined;
  }

  const hashIndex = schemaDefinition.indexOf("#");
  const schemaFile = normalizeOptionalString(
    hashIndex >= 0 ? schemaDefinition.slice(0, hashIndex) : schemaDefinition
  );
  if (!schemaFile) {
    return undefined;
  }

  const fragmentWithVariant = hashIndex >= 0 ? schemaDefinition.slice(hashIndex + 1) : "";
  let pointerFragment = fragmentWithVariant;
  let variantIndex = undefined;

  const variantSeparatorIndex = fragmentWithVariant.lastIndexOf("@");
  if (variantSeparatorIndex >= 0) {
    const variantToken = normalizeOptionalString(
      fragmentWithVariant.slice(variantSeparatorIndex + 1)
    );
    if (variantToken && /^\d+$/.test(variantToken)) {
      variantIndex = Number.parseInt(variantToken, 10);
      pointerFragment = fragmentWithVariant.slice(0, variantSeparatorIndex);
    }
  }

  const jsonPointer = normalizeJsonPointer(pointerFragment);
  const schemaReference = `${schemaFile}#${jsonPointer}`;
  const hasVariantIndex = Number.isInteger(variantIndex);
  const variantPointerCandidates = hasVariantIndex
    ? SCHEMA_VARIANT_POINTER_FIELDS.map((fieldName) =>
        appendJsonPointerToken(appendJsonPointerToken(jsonPointer, fieldName), String(variantIndex))
      )
    : [];

  return {
    schemaFile,
    jsonPointer,
    schemaReference,
    pointerSegments: decodeJsonPointerSegments(jsonPointer),
    variantIndex: hasVariantIndex ? variantIndex : null,
    variantPointerCandidates,
  };
}

function normalizeJsonPointer(pointerCandidate) {
  if (typeof pointerCandidate !== "string") {
    return "";
  }

  let pointer = pointerCandidate.trim();
  if (!pointer || pointer === "/" || pointer === "#") {
    return "";
  }

  if (pointer.startsWith("#")) {
    pointer = pointer.slice(1);
  }
  if (!pointer || pointer === "/") {
    return "";
  }

  return pointer.startsWith("/") ? pointer : `/${pointer}`;
}

function appendJsonPointerToken(pointerCandidate, tokenCandidate) {
  const token = normalizeOptionalString(tokenCandidate);
  const pointer = normalizeJsonPointer(pointerCandidate);
  if (!token) {
    return pointer;
  }

  const escapedToken = token.replaceAll("~", "~0").replaceAll("/", "~1");
  return pointer ? `${pointer}/${escapedToken}` : `/${escapedToken}`;
}

function decodeJsonPointerSegments(pointerCandidate) {
  const pointer = normalizeJsonPointer(pointerCandidate);
  if (!pointer) {
    return [];
  }

  return pointer
    .slice(1)
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"));
}

function normalizeOptionalString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
