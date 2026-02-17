import {
  isObject,
  normalizeNonEmptyString,
  readTypeFromNodeId,
} from './assetDocumentUtils.js';

const SCHEMA_CONNECTION_RUNTIME_SUFFIX = '$Pin';

function normalizeConnectionRuntimeKey(schemaKeyCandidate) {
  const schemaKey = normalizeNonEmptyString(schemaKeyCandidate);
  if (!schemaKey) {
    return undefined;
  }

  if (!schemaKey.endsWith(SCHEMA_CONNECTION_RUNTIME_SUFFIX)) {
    return schemaKey;
  }

  const withoutSuffix = schemaKey.slice(0, -SCHEMA_CONNECTION_RUNTIME_SUFFIX.length);
  return normalizeNonEmptyString(withoutSuffix) ?? schemaKey;
}

function normalizeVariantIdentity(identity) {
  if (!isObject(identity)) {
    return undefined;
  }

  const fieldName = normalizeNonEmptyString(identity.fieldName);
  const value = normalizeNonEmptyString(identity.value);
  if (!fieldName || !value) {
    return undefined;
  }

  return {
    variantId: normalizeNonEmptyString(identity.variantId),
    fieldName,
    value,
  };
}

export function getWorkspaceVariantFieldNames(workspace) {
  const fromWorkspace = Array.isArray(workspace?.variantFieldNames)
    ? workspace.variantFieldNames
    : [];
  const fromVariants = Array.isArray(workspace?.variants)
    ? workspace.variants
        .map((variant) => normalizeNonEmptyString(variant?.variantFieldName))
        .filter((fieldName) => Boolean(fieldName))
    : [];
  const deduped = new Set([...fromWorkspace, ...fromVariants, 'Type']);
  return Array.from(deduped);
}

function collectPayloadVariantIdentities(
  payload,
  workspace,
  { nodeId, includeNodeIdFallback = true } = {}
) {
  const payloadObject = isObject(payload) ? payload : {};
  const knownFieldNames = getWorkspaceVariantFieldNames(workspace);
  const identities = [];

  for (const fieldName of knownFieldNames) {
    const value = normalizeNonEmptyString(payloadObject[fieldName]);
    if (!value) {
      continue;
    }

    identities.push({
      fieldName,
      value,
      source: fieldName === 'Type' ? 'type-field' : 'workspace-field',
    });
  }

  if (includeNodeIdFallback) {
    const nodeIdCandidate = normalizeNonEmptyString(nodeId) ?? normalizeNonEmptyString(payloadObject.$NodeId);
    const inferredValue = readTypeFromNodeId(nodeIdCandidate);
    if (inferredValue) {
      identities.push({
        fieldName: 'Type',
        value: inferredValue,
        source: 'node-id',
      });
    }
  }

  return identities;
}

function buildCaseInsensitiveEntryMap(entryMapCandidate) {
  if (!isObject(entryMapCandidate)) {
    return {};
  }

  const byLowerValue = {};
  for (const [rawValue, rawTemplateId] of Object.entries(entryMapCandidate)) {
    const value = normalizeNonEmptyString(rawValue);
    const templateId = normalizeNonEmptyString(rawTemplateId);
    if (!value || !templateId) {
      continue;
    }

    const lowerValue = value.toLowerCase();
    if (!byLowerValue[lowerValue]) {
      byLowerValue[lowerValue] = templateId;
    }
  }

  return byLowerValue;
}

function resolveTemplateIdFromFieldValue(workspace, fieldName, value) {
  const normalizedFieldName = normalizeNonEmptyString(fieldName);
  const normalizedValue = normalizeNonEmptyString(value);
  if (!normalizedFieldName || !normalizedValue) {
    return undefined;
  }

  const fieldMaps = isObject(workspace?.templateIdByFieldNameAndValue)
    ? workspace.templateIdByFieldNameAndValue
    : {};
  const entryMap = isObject(fieldMaps[normalizedFieldName]) ? fieldMaps[normalizedFieldName] : {};
  const exactMatch = normalizeNonEmptyString(entryMap[normalizedValue]);
  if (exactMatch) {
    return exactMatch;
  }

  const lowerMatch = buildCaseInsensitiveEntryMap(entryMap)[normalizedValue.toLowerCase()];
  if (lowerMatch) {
    return lowerMatch;
  }

  return undefined;
}

function resolveTemplateIdFromAnyFieldValue(workspace, value) {
  const normalizedValue = normalizeNonEmptyString(value);
  if (!normalizedValue) {
    return undefined;
  }

  const fieldMaps = isObject(workspace?.templateIdByFieldNameAndValue)
    ? workspace.templateIdByFieldNameAndValue
    : {};

  for (const entryMapCandidate of Object.values(fieldMaps)) {
    const entryMap = isObject(entryMapCandidate) ? entryMapCandidate : {};
    const exactMatch = normalizeNonEmptyString(entryMap[normalizedValue]);
    if (exactMatch) {
      return exactMatch;
    }
  }

  const lowerValue = normalizedValue.toLowerCase();
  for (const entryMapCandidate of Object.values(fieldMaps)) {
    const entryMap = isObject(entryMapCandidate) ? entryMapCandidate : {};
    const lowerMatch = buildCaseInsensitiveEntryMap(entryMap)[lowerValue];
    if (lowerMatch) {
      return lowerMatch;
    }
  }

  return undefined;
}

function resolveTemplateIdFromVariantValue(workspace, value) {
  const normalizedValue = normalizeNonEmptyString(value);
  if (!normalizedValue) {
    return undefined;
  }

  const variants = Array.isArray(workspace?.variants) ? workspace.variants : [];
  for (const variant of variants) {
    const directMatch = normalizeNonEmptyString(variant?.templateIdByValue?.[normalizedValue]);
    if (directMatch) {
      return directMatch;
    }
  }

  const lowerValue = normalizedValue.toLowerCase();
  for (const variant of variants) {
    const entries = Array.isArray(variant?.values) ? variant.values : [];
    for (const entry of entries) {
      const entryValue = normalizeNonEmptyString(entry?.value);
      const templateId = normalizeNonEmptyString(entry?.templateId);
      if (!entryValue || !templateId) {
        continue;
      }

      if (entryValue.toLowerCase() === lowerValue) {
        return templateId;
      }
    }
  }

  return undefined;
}

export function readPayloadVariantIdentity(
  payload,
  workspace,
  { nodeId, includeNodeIdFallback = true } = {}
) {
  const identities = collectPayloadVariantIdentities(payload, workspace, {
    nodeId,
    includeNodeIdFallback,
  });
  return identities[0];
}

export function resolveTemplateIdFromPayloadVariant(
  payload,
  workspace,
  { nodeId, includeNodeIdFallback = true } = {}
) {
  const identities = collectPayloadVariantIdentities(payload, workspace, {
    nodeId,
    includeNodeIdFallback,
  });
  if (identities.length === 0) {
    return undefined;
  }
  const identity = identities[0];
  const hasExplicitPayloadIdentity = identities.some(
    (candidateIdentity) => candidateIdentity.source !== 'node-id'
  );
  const lookupIdentities = hasExplicitPayloadIdentity
    ? identities.filter((candidateIdentity) => candidateIdentity.source !== 'node-id')
    : identities;

  for (const candidateIdentity of lookupIdentities) {
    const directFieldTemplateId = resolveTemplateIdFromFieldValue(
      workspace,
      candidateIdentity.fieldName,
      candidateIdentity.value
    );
    if (directFieldTemplateId) {
      return {
        templateId: directFieldTemplateId,
        identity: candidateIdentity,
      };
    }
  }

  for (const candidateIdentity of lookupIdentities) {
    const byAnyFieldTemplateId = resolveTemplateIdFromAnyFieldValue(workspace, candidateIdentity.value);
    if (byAnyFieldTemplateId) {
      return {
        templateId: byAnyFieldTemplateId,
        identity: candidateIdentity,
      };
    }
  }

  for (const candidateIdentity of lookupIdentities) {
    const legacyVariantTemplateId = resolveTemplateIdFromVariantValue(workspace, candidateIdentity.value);
    if (legacyVariantTemplateId) {
      return {
        templateId: legacyVariantTemplateId,
        identity: candidateIdentity,
      };
    }
  }

  return {
    identity,
  };
}

export function resolveCanonicalVariantIdentityForTemplate(template, workspace, payload) {
  const templateId = normalizeNonEmptyString(template?.templateId);
  const identityList = templateId && isObject(workspace?.variantIdentitiesByTemplateId)
    ? workspace.variantIdentitiesByTemplateId[templateId]
    : undefined;
  const payloadObject = isObject(payload) ? payload : {};
  const normalizedIdentityList = Array.isArray(identityList)
    ? identityList
        .map((identity) => normalizeVariantIdentity(identity))
        .filter((identity) => Boolean(identity))
    : [];

  if (normalizedIdentityList.length > 0) {
    for (const identity of normalizedIdentityList) {
      const payloadValue = normalizeNonEmptyString(payloadObject[identity.fieldName]);
      if (payloadValue && payloadValue.toLowerCase() === identity.value.toLowerCase()) {
        return identity;
      }
    }

    return normalizedIdentityList[0];
  }

  const variantFieldValueByFieldName = isObject(template?.variantIdentityFieldValueByFieldName)
    ? template.variantIdentityFieldValueByFieldName
    : {};
  const workspaceVariantFieldNames = getWorkspaceVariantFieldNames(workspace);
  for (const fieldName of workspaceVariantFieldNames) {
    const canonicalValue = normalizeNonEmptyString(variantFieldValueByFieldName[fieldName]);
    if (!canonicalValue) {
      continue;
    }

    const payloadValue = normalizeNonEmptyString(payloadObject[fieldName]);
    if (payloadValue && payloadValue.toLowerCase() === canonicalValue.toLowerCase()) {
      return {
        fieldName,
        value: canonicalValue,
      };
    }
  }

  for (const fieldName of workspaceVariantFieldNames) {
    const canonicalValue = normalizeNonEmptyString(variantFieldValueByFieldName[fieldName]);
    if (!canonicalValue) {
      continue;
    }

    return {
      fieldName,
      value: canonicalValue,
    };
  }

  const schemaType = normalizeNonEmptyString(template?.schemaType ?? template?.defaultTypeName);
  if (!schemaType) {
    return undefined;
  }

  return {
    fieldName: 'Type',
    value: schemaType,
  };
}

function buildTemplateRuntimeKeySet(template) {
  const keys = new Set();

  const fieldRuntimeKeyMap = isObject(template?.fieldRuntimeKeyByFieldId)
    ? template.fieldRuntimeKeyByFieldId
    : {};
  for (const runtimeKey of Object.values(fieldRuntimeKeyMap)) {
    const normalizedRuntimeKey = normalizeNonEmptyString(runtimeKey);
    if (normalizedRuntimeKey) {
      keys.add(normalizedRuntimeKey);
    }
  }

  const schemaConnections = Array.isArray(template?.schemaConnections) ? template.schemaConnections : [];
  for (const descriptor of schemaConnections) {
    const schemaKey = normalizeConnectionRuntimeKey(descriptor?.schemaKey);
    if (schemaKey) {
      keys.add(schemaKey);
    }
  }

  return keys;
}

export function writeTemplateVariantIdentity(payload, template, workspace) {
  if (!isObject(payload)) {
    return undefined;
  }

  const identity = resolveCanonicalVariantIdentityForTemplate(template, workspace, payload);
  if (!identity) {
    return undefined;
  }

  payload[identity.fieldName] = identity.value;
  const templateRuntimeKeys = buildTemplateRuntimeKeySet(template);
  const variantFieldNames = getWorkspaceVariantFieldNames(workspace);
  for (const fieldName of variantFieldNames) {
    if (fieldName === identity.fieldName) {
      continue;
    }

    if (templateRuntimeKeys.has(fieldName)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(payload, fieldName)) {
      delete payload[fieldName];
    }
  }

  return identity;
}
