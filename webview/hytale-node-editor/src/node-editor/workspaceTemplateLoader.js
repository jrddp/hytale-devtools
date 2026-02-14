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
    const defaultTypeName = normalizeNonEmptyString(schema.Type) ?? templateId;
    const fields = buildTemplateFields(
      nodeDefinition.Content,
      templateId,
      entry.relativePath,
      diagnostics,
      unsupportedFieldTypes
    );

    if (hasConnectionPins(nodeDefinition)) {
      nodesWithConnectionPins += 1;
    }
    schemaLinkDescriptorCount += countSchemaLinkDescriptors(schema);

    const template = createTemplate({
      templateId,
      label,
      subtitle: defaultTypeName !== label ? defaultTypeName : undefined,
      defaultTypeName,
      fields,
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
      `Workspace defines pin schemas for ${nodesWithConnectionPins} node types. Pin typing and connection rules are not enforced yet.`
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

function hasConnectionPins(nodeDefinition) {
  const hasInputs = Array.isArray(nodeDefinition?.Inputs) && nodeDefinition.Inputs.length > 0;
  const hasOutputs = Array.isArray(nodeDefinition?.Outputs) && nodeDefinition.Outputs.length > 0;
  return hasInputs || hasOutputs;
}

function countSchemaLinkDescriptors(schema) {
  if (!isObject(schema)) {
    return 0;
  }

  let count = 0;
  for (const schemaValue of Object.values(schema)) {
    if (
      isObject(schemaValue) &&
      normalizeNonEmptyString(schemaValue.Node) &&
      normalizeNonEmptyString(schemaValue.Pin)
    ) {
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
    buildInitialValues: () => buildFieldValueMap(definition.fields),
  };
}

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
