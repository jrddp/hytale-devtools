import { buildFieldValueMap } from './fieldValueUtils.js';
import { FIELD_TYPE_VALUES } from './types.js';

const WORKSPACE_CONFIG_FILENAME = '_Workspace.json';
const UNCATEGORIZED_CATEGORY = 'Uncategorized';

const SUPPORTED_FIELD_TYPES = new Set(FIELD_TYPE_VALUES);
const workspaceModuleMap = import.meta.glob(
  '../../Workspaces/HytaleGenerator Java/**/*.json',
  { eager: true }
);

let cachedWorkspaceTemplateData;

export function loadHytaleGeneratorJavaWorkspaceTemplates() {
  if (cachedWorkspaceTemplateData) {
    return cachedWorkspaceTemplateData;
  }

  const diagnostics = [];
  const moduleEntries = normalizeModuleEntries();
  const workspaceConfigEntry = moduleEntries.find((entry) =>
    entry.relativePath.endsWith(`/${WORKSPACE_CONFIG_FILENAME}`) ||
    entry.relativePath === WORKSPACE_CONFIG_FILENAME
  );
  const workspaceConfig = isObject(workspaceConfigEntry?.json) ? workspaceConfigEntry.json : {};
  const templateById = new Map();
  const unsupportedFieldTypes = new Set();

  let nodesWithConnectionPins = 0;
  let schemaLinkDescriptorCount = 0;
  let nodesWithSchemaConnections = 0;

  for (const entry of moduleEntries) {
    if (entry === workspaceConfigEntry) {
      continue;
    }

    const nodeDefinition = isObject(entry.json) ? entry.json : undefined;
    if (!nodeDefinition) {
      diagnostics.push(`Skipping non-object workspace definition: ${entry.relativePath}`);
      continue;
    }

    const templateId = normalizeNonEmptyString(nodeDefinition.Id);
    if (!templateId) {
      diagnostics.push(`Skipping workspace definition without a valid Id: ${entry.relativePath}`);
      continue;
    }

    const label = normalizeNonEmptyString(nodeDefinition.Title) ?? templateId;
    const schema = isObject(nodeDefinition.Schema) ? nodeDefinition.Schema : {};
    const outputPins = buildTemplatePins(
      nodeDefinition.Outputs,
      templateId,
      entry.relativePath,
      'Outputs',
      diagnostics
    );
    const inputPins = buildTemplatePins(
      nodeDefinition.Inputs,
      templateId,
      entry.relativePath,
      'Inputs',
      diagnostics
    );
    const schemaConnections = buildSchemaConnections(
      schema,
      outputPins,
      templateId,
      entry.relativePath,
      diagnostics
    );
    const defaultTypeName = normalizeNonEmptyString(schema.Type) ?? templateId;
    const fields = buildTemplateFields(
      nodeDefinition.Content,
      templateId,
      entry.relativePath,
      diagnostics,
      unsupportedFieldTypes
    );

    if (inputPins.length > 0 || outputPins.length > 0) {
      nodesWithConnectionPins += 1;
    }
    schemaLinkDescriptorCount += countSchemaLinkDescriptors(schema);
    if (schemaConnections.length > 0) {
      nodesWithSchemaConnections += 1;
    }

    const template = createTemplate({
      templateId,
      label,
      defaultTypeName,
      fields,
      inputPins,
      outputPins,
      schemaConnections,
    });

    if (templateById.has(templateId)) {
      diagnostics.push(
        `Duplicate workspace node Id "${templateId}" detected; keeping the latest definition (${entry.relativePath}).`
      );
    }
    templateById.set(templateId, template);
  }

  if (workspaceConfigEntry && !isObject(workspaceConfigEntry.json)) {
    diagnostics.push(`Workspace config ${workspaceConfigEntry.relativePath} is not a JSON object.`);
  }
  if (!workspaceConfigEntry) {
    diagnostics.push('Workspace config _Workspace.json not found in HytaleGenerator Java.');
  }

  const templates = buildOrderedTemplates(
    templateById,
    workspaceConfig.NodeCategories,
    diagnostics
  );

  if (unsupportedFieldTypes.size > 0) {
    diagnostics.push(
      `Unsupported workspace field types were found and are rendered with fallback behavior: ${Array.from(
        unsupportedFieldTypes
      )
        .sort((left, right) => left.localeCompare(right))
        .join(', ')}.`
    );
  }

  if (nodesWithConnectionPins > 0) {
    diagnostics.push(
      `Workspace defines pin schemas for ${nodesWithConnectionPins} node types. Pin-based handles are generated; type filtering rules are not enforced yet.`
    );
  }

  if (nodesWithSchemaConnections > 0) {
    diagnostics.push(
      `Workspace schemas include connection mappings for ${nodesWithSchemaConnections} node types. Runtime connection parsing/writing is schema-driven.`
    );
  }

  if (schemaLinkDescriptorCount > 0) {
    diagnostics.push(
      `Workspace schemas include ${schemaLinkDescriptorCount} linked-node descriptors ({ Node, Pin }). Automated linked-node behaviors are not implemented yet.`
    );
  }

  cachedWorkspaceTemplateData = {
    workspaceName:
      normalizeNonEmptyString(workspaceConfig.WorkspaceName) ?? 'HytaleGenerator (Java)',
    templates,
    diagnostics,
  };

  return cachedWorkspaceTemplateData;
}

function normalizeModuleEntries() {
  return Object.entries(workspaceModuleMap)
    .map(([modulePath, moduleValue]) => ({
      modulePath,
      relativePath: toWorkspaceRelativePath(modulePath),
      json: unwrapModuleJson(moduleValue),
    }))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function unwrapModuleJson(moduleValue) {
  if (!isObject(moduleValue)) {
    return moduleValue;
  }

  if (Object.prototype.hasOwnProperty.call(moduleValue, 'default')) {
    return moduleValue.default;
  }

  return moduleValue;
}

function toWorkspaceRelativePath(modulePath) {
  if (typeof modulePath !== 'string') {
    return '';
  }

  const normalizedPath = modulePath.replaceAll('\\', '/');
  const marker = '/Workspaces/HytaleGenerator Java/';
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex >= 0) {
    return normalizedPath.slice(markerIndex + marker.length);
  }

  const fallbackMarker = 'HytaleGenerator Java/';
  const fallbackIndex = normalizedPath.lastIndexOf(fallbackMarker);
  if (fallbackIndex >= 0) {
    return normalizedPath.slice(fallbackIndex + fallbackMarker.length);
  }

  return normalizedPath;
}

function buildTemplateFields(
  content,
  templateId,
  relativePath,
  diagnostics,
  unsupportedFieldTypes
) {
  if (!Array.isArray(content)) {
    return [];
  }

  const fields = [];
  const seenFieldIds = new Set();

  for (const fieldCandidate of content) {
    if (!isObject(fieldCandidate)) {
      continue;
    }

    const fieldId = normalizeNonEmptyString(fieldCandidate.Id);
    if (!fieldId) {
      diagnostics.push(
        `Node "${templateId}" has a content entry without a valid Id (${relativePath}).`
      );
      continue;
    }

    if (seenFieldIds.has(fieldId)) {
      diagnostics.push(
        `Node "${templateId}" defines duplicate field Id "${fieldId}" (${relativePath}). Keeping the latest definition.`
      );
      const existingFieldIndex = fields.findIndex(
        (existingField) => existingField.id === fieldId
      );
      if (existingFieldIndex >= 0) {
        fields.splice(existingFieldIndex, 1);
      }
    }

    seenFieldIds.add(fieldId);

    const fieldType = normalizeNonEmptyString(fieldCandidate.Type);
    const options = isObject(fieldCandidate.Options) ? { ...fieldCandidate.Options } : {};

    if (!fieldType) {
      diagnostics.push(
        `Node "${templateId}" field "${fieldId}" is missing a valid Type (${relativePath}).`
      );
      continue;
    }

    if (!SUPPORTED_FIELD_TYPES.has(fieldType)) {
      unsupportedFieldTypes.add(fieldType);
    }

    fields.push({
      id: fieldId,
      type: fieldType,
      label: normalizeNonEmptyString(options.Label) ?? fieldId,
      options,
    });
  }

  return fields;
}

function buildTemplatePins(pins, templateId, relativePath, pinGroupName, diagnostics) {
  if (!Array.isArray(pins)) {
    return [];
  }

  const normalizedPins = [];
  const seenPinIds = new Set();

  for (const pinCandidate of pins) {
    if (!isObject(pinCandidate)) {
      continue;
    }

    const pinId = normalizeNonEmptyString(pinCandidate.Id);
    if (!pinId) {
      diagnostics.push(
        `Node "${templateId}" ${pinGroupName} contains an entry without a valid Id (${relativePath}).`
      );
      continue;
    }

    if (seenPinIds.has(pinId)) {
      diagnostics.push(
        `Node "${templateId}" ${pinGroupName} contains duplicate pin Id "${pinId}" (${relativePath}). Keeping the latest definition.`
      );
      const existingPinIndex = normalizedPins.findIndex(
        (existingPin) => existingPin.id === pinId
      );
      if (existingPinIndex >= 0) {
        normalizedPins.splice(existingPinIndex, 1);
      }
    }

    const pinType = normalizeNonEmptyString(pinCandidate.Type);
    if (!pinType) {
      diagnostics.push(
        `Node "${templateId}" ${pinGroupName} pin "${pinId}" is missing a valid Type (${relativePath}).`
      );
      continue;
    }

    seenPinIds.add(pinId);

    normalizedPins.push({
      id: pinId,
      type: pinType,
      label: normalizeNonEmptyString(pinCandidate.Label) ?? pinId,
      multiple: typeof pinCandidate.Multiple === 'boolean' ? pinCandidate.Multiple : false,
    });
  }

  return normalizedPins;
}

function buildSchemaConnections(schema, outputPins, templateId, relativePath, diagnostics) {
  if (!isObject(schema)) {
    return [];
  }

  const connections = [];
  const seenConnectionKeys = new Set();

  for (const [schemaKey, schemaValue] of Object.entries(schema)) {
    const descriptor = readSchemaLinkDescriptor(schemaValue);
    if (!descriptor) {
      continue;
    }

    const runtimeSchemaKey = normalizeSchemaRuntimeKey(schemaKey);
    if (!runtimeSchemaKey) {
      diagnostics.push(
        `Node "${templateId}" schema connection key "${schemaKey}" is not valid (${relativePath}).`
      );
      continue;
    }

    const resolvedOutputPin = resolveOutputPinBySchemaPinId(descriptor.pinId, outputPins);
    if (!resolvedOutputPin) {
      diagnostics.push(
        `Node "${templateId}" schema key "${schemaKey}" references unknown output pin "${descriptor.pinId}" (${relativePath}).`
      );
      continue;
    }

    if (resolvedOutputPin.id !== descriptor.pinId) {
      diagnostics.push(
        `Node "${templateId}" schema key "${schemaKey}" pin "${descriptor.pinId}" matched output "${resolvedOutputPin.id}" by Type fallback (${relativePath}).`
      );
    }

    const connectionLookupKey = `${runtimeSchemaKey}:${resolvedOutputPin.id}`;
    if (seenConnectionKeys.has(connectionLookupKey)) {
      diagnostics.push(
        `Node "${templateId}" schema defines duplicate connection mapping for key "${runtimeSchemaKey}" and pin "${resolvedOutputPin.id}" (${relativePath}). Keeping the latest definition.`
      );
      const existingConnectionIndex = connections.findIndex(
        (existingConnection) =>
          existingConnection.schemaKey === runtimeSchemaKey &&
          existingConnection.outputPinId === resolvedOutputPin.id
      );
      if (existingConnectionIndex >= 0) {
        connections.splice(existingConnectionIndex, 1);
      }
    }

    seenConnectionKeys.add(connectionLookupKey);

    connections.push({
      schemaKey: runtimeSchemaKey,
      outputPinId: resolvedOutputPin.id,
      outputPinType: resolvedOutputPin.type,
      nodeSelector: descriptor.nodeSelector,
      multiple: resolvedOutputPin.multiple,
    });
  }

  return connections;
}

function readSchemaLinkDescriptor(schemaValue) {
  if (!isObject(schemaValue)) {
    return undefined;
  }

  const nodeSelector =
    normalizeNonEmptyString(schemaValue.Node) ?? normalizeNonEmptyString(schemaValue.node);
  const pinId =
    normalizeNonEmptyString(schemaValue.Pin) ?? normalizeNonEmptyString(schemaValue.pin);
  if (!nodeSelector || !pinId) {
    return undefined;
  }

  return {
    nodeSelector,
    pinId,
  };
}

function normalizeSchemaRuntimeKey(schemaKey) {
  const normalizedSchemaKey = normalizeNonEmptyString(schemaKey);
  if (!normalizedSchemaKey) {
    return undefined;
  }

  if (normalizedSchemaKey.endsWith('$Pin')) {
    return normalizedSchemaKey.slice(0, -'$Pin'.length);
  }

  return normalizedSchemaKey;
}

function resolveOutputPinBySchemaPinId(schemaPinId, outputPins) {
  if (!schemaPinId || !Array.isArray(outputPins) || outputPins.length === 0) {
    return undefined;
  }

  const exactMatch = outputPins.find((pin) => pin.id === schemaPinId);
  if (exactMatch) {
    return exactMatch;
  }

  const typeMatches = outputPins.filter((pin) => pin.type === schemaPinId);
  if (typeMatches.length === 1) {
    return typeMatches[0];
  }

  return undefined;
}

function countSchemaLinkDescriptors(schema) {
  if (!isObject(schema)) {
    return 0;
  }

  let count = 0;
  for (const schemaValue of Object.values(schema)) {
    if (readSchemaLinkDescriptor(schemaValue)) {
      count += 1;
    }
  }

  return count;
}

function buildOrderedTemplates(templateById, nodeCategories, diagnostics) {
  const orderedTemplates = [];
  const assignedTemplateIds = new Set();
  const categories = isObject(nodeCategories) ? nodeCategories : {};

  for (const [categoryName, listedNodeIds] of Object.entries(categories)) {
    const normalizedCategoryName =
      normalizeNonEmptyString(categoryName) ?? UNCATEGORIZED_CATEGORY;
    if (!Array.isArray(listedNodeIds)) {
      continue;
    }

    for (const listedNodeId of listedNodeIds) {
      const normalizedNodeId = normalizeNonEmptyString(listedNodeId);
      if (!normalizedNodeId || assignedTemplateIds.has(normalizedNodeId)) {
        continue;
      }

      const template = templateById.get(normalizedNodeId);
      if (!template) {
        diagnostics.push(
          `Workspace category "${normalizedCategoryName}" references unknown node Id "${normalizedNodeId}".`
        );
        continue;
      }

      assignedTemplateIds.add(normalizedNodeId);
      orderedTemplates.push({
        ...template,
        category: normalizedCategoryName,
      });
    }
  }

  const uncategorized = Array.from(templateById.values())
    .filter((template) => !assignedTemplateIds.has(template.templateId))
    .sort((left, right) => {
      const labelCompare = left.label.localeCompare(right.label);
      if (labelCompare !== 0) {
        return labelCompare;
      }

      return left.templateId.localeCompare(right.templateId);
    })
    .map((template) => ({
      ...template,
      category: UNCATEGORIZED_CATEGORY,
    }));

  return [...orderedTemplates, ...uncategorized];
}

function createTemplate(definition) {
  return {
    ...definition,
    inputPins: Array.isArray(definition.inputPins) ? definition.inputPins : [],
    outputPins: Array.isArray(definition.outputPins) ? definition.outputPins : [],
    schemaConnections: Array.isArray(definition.schemaConnections)
      ? definition.schemaConnections
      : [],
    buildInitialValues: () => buildFieldValueMap(definition.fields),
  };
}

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
