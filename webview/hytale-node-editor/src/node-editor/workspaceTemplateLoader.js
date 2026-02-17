import { buildFieldValueMap } from './fieldValueUtils.js';
import { FIELD_TYPE_VALUES } from './types.js';

const WORKSPACE_CONFIG_FILENAME = '_Workspace.json';
const UNCATEGORIZED_CATEGORY = 'Uncategorized';
const SUPPORTED_FIELD_TYPES = new Set(FIELD_TYPE_VALUES);
const SCHEMA_CONNECTION_RUNTIME_SUFFIX = '$Pin';
const workspaceModuleMap = import.meta.glob('../../Workspaces/**/*.json', { eager: true });

let cachedWorkspaceCollection;

export function loadWorkspaceTemplateCollection() {
  if (cachedWorkspaceCollection) {
    return cachedWorkspaceCollection;
  }

  const globalDiagnostics = [];
  const workspaceEntries = groupWorkspaceEntriesByFolder(normalizeModuleEntries(), globalDiagnostics);
  const workspaces = [];

  for (const [workspaceId, entries] of workspaceEntries.entries()) {
    workspaces.push(buildWorkspaceDefinition(workspaceId, entries));
  }

  workspaces.sort((left, right) => left.workspaceId.localeCompare(right.workspaceId));
  cachedWorkspaceCollection = {
    workspaces,
    diagnostics: globalDiagnostics,
  };
  return cachedWorkspaceCollection;
}

export function loadWorkspaceTemplateData(workspaceId) {
  const collection = loadWorkspaceTemplateCollection();
  const normalizedWorkspaceId = normalizeNonEmptyString(workspaceId);
  if (!normalizedWorkspaceId) {
    return undefined;
  }

  return collection.workspaces.find(
    (workspace) => workspace.workspaceId === normalizedWorkspaceId
  );
}

export function loadHytaleGeneratorJavaWorkspaceTemplates() {
  const workspaceData = loadWorkspaceTemplateData('HytaleGenerator Java');
  if (!workspaceData) {
    return {
      workspaceId: 'HytaleGenerator Java',
      workspaceName: 'HytaleGenerator (Java)',
      roots: [],
      variants: [],
      templates: [],
      diagnostics: ['Workspace config _Workspace.json not found in HytaleGenerator Java.'],
    };
  }

  return workspaceData;
}

function buildWorkspaceDefinition(workspaceId, entries) {
  const diagnostics = [];
  const unsupportedFieldTypes = new Set();
  const templateById = new Map();
  const workspaceConfigEntry = entries.find((entry) => entry.fileName === WORKSPACE_CONFIG_FILENAME);
  const workspaceConfig = isObject(workspaceConfigEntry?.json) ? workspaceConfigEntry.json : {};
  const variantIdentitySchemaKeys = collectVariantIdentitySchemaKeys(workspaceConfig.Variants);

  for (const entry of entries) {
    if (entry.fileName === WORKSPACE_CONFIG_FILENAME) {
      continue;
    }

    const nodeDefinition = isObject(entry.json) ? entry.json : undefined;
    if (!nodeDefinition) {
      diagnostics.push(`Skipping non-object workspace definition: ${workspaceId}/${entry.relativePath}`);
      continue;
    }

    const templateId = normalizeNonEmptyString(nodeDefinition.Id);
    if (!templateId) {
      diagnostics.push(
        `Skipping workspace definition without a valid Id: ${workspaceId}/${entry.relativePath}`
      );
      continue;
    }

    const template = buildTemplateDefinition({
      workspaceId,
      relativePath: entry.relativePath,
      templateId,
      nodeDefinition,
      diagnostics,
      unsupportedFieldTypes,
      variantIdentitySchemaKeys,
    });

    if (templateById.has(templateId)) {
      diagnostics.push(
        `Duplicate workspace node Id "${templateId}" detected; keeping the latest definition (${workspaceId}/${entry.relativePath}).`
      );
    }
    templateById.set(templateId, template);
  }

  if (!workspaceConfigEntry) {
    diagnostics.push(`Workspace config _Workspace.json not found in ${workspaceId}.`);
  } else if (!isObject(workspaceConfigEntry.json)) {
    diagnostics.push(
      `Workspace config ${workspaceId}/${workspaceConfigEntry.relativePath} is not a JSON object.`
    );
  }

  const templates = buildOrderedTemplates(templateById, workspaceConfig.NodeCategories, diagnostics);
  const variants = buildVariants(workspaceConfig.Variants, templateById, workspaceId, diagnostics);
  const variantIdentityLookups = buildVariantIdentityLookups(variants);
  const roots = buildRoots(workspaceConfig.Roots, workspaceId, diagnostics);
  const workspaceName = normalizeNonEmptyString(workspaceConfig.WorkspaceName) ?? workspaceId;

  if (unsupportedFieldTypes.size > 0) {
    diagnostics.push(
      `Unsupported workspace field types are rendered with fallback behavior: ${Array.from(
        unsupportedFieldTypes
      )
        .sort((left, right) => left.localeCompare(right))
        .join(', ')}.`
    );
  }

  return {
    workspaceId,
    workspaceName,
    roots,
    variants,
    variantFieldNames: variantIdentityLookups.variantFieldNames,
    variantIdentitiesByTemplateId: variantIdentityLookups.variantIdentitiesByTemplateId,
    templateIdByFieldNameAndValue: variantIdentityLookups.templateIdByFieldNameAndValue,
    templates,
    diagnostics,
  };
}

function buildTemplateDefinition({
  workspaceId,
  relativePath,
  templateId,
  nodeDefinition,
  diagnostics,
  unsupportedFieldTypes,
  variantIdentitySchemaKeys,
}) {
  const label = normalizeNonEmptyString(nodeDefinition.Title) ?? templateId;
  const nodeColor =
    nodeDefinition.Color ??
    nodeDefinition.color ??
    nodeDefinition.Colour ??
    nodeDefinition.colour;
  const schema = isObject(nodeDefinition.Schema) ? nodeDefinition.Schema : {};
  const schemaType =
    normalizeNonEmptyString(schema.Type) ?? normalizeNonEmptyString(nodeDefinition.Type);
  const variantIdentityFieldValueByFieldName = buildTemplateVariantFieldValueMap({
    nodeDefinition,
    schema,
    templateId,
    variantIdentitySchemaKeys,
  });
  const fields = buildTemplateFields(
    nodeDefinition.Content,
    templateId,
    workspaceId,
    relativePath,
    diagnostics,
    unsupportedFieldTypes
  );
  const inputPins = buildTemplatePins(
    nodeDefinition.Inputs,
    templateId,
    workspaceId,
    relativePath,
    'Inputs',
    diagnostics
  );
  const outputPins = buildTemplatePins(
    nodeDefinition.Outputs,
    templateId,
    workspaceId,
    relativePath,
    'Outputs',
    diagnostics
  );
  const fieldMappings = buildFieldMappings(
    schema,
    fields,
    templateId,
    workspaceId,
    relativePath,
    diagnostics,
    variantIdentitySchemaKeys
  );
  const schemaConnections = buildSchemaConnections(
    schema,
    outputPins,
    templateId,
    workspaceId,
    relativePath,
    diagnostics
  );

  return {
    templateId,
    label,
    nodeColor,
    schemaType,
    defaultTypeName: schemaType ?? templateId,
    variantIdentityFieldValueByFieldName,
    fields,
    inputPins,
    outputPins,
    fieldMappings,
    fieldIdBySchemaKey: Object.fromEntries(
      fieldMappings.map((mapping) => [mapping.schemaKey, mapping.fieldId])
    ),
    fieldRuntimeKeyByFieldId: Object.fromEntries(
      fieldMappings.map((mapping) => [mapping.fieldId, mapping.schemaKey])
    ),
    schemaConnections,
    buildInitialValues: () => buildFieldValueMap(fields),
  };
}

function buildTemplateVariantFieldValueMap({
  nodeDefinition,
  schema,
  templateId,
  variantIdentitySchemaKeys = new Set(['Type']),
}) {
  const nodeDefinitionObject = isObject(nodeDefinition) ? nodeDefinition : {};
  const schemaObject = isObject(schema) ? schema : {};
  const fieldNames = new Set(['Type', 'Id']);
  for (const fieldNameCandidate of variantIdentitySchemaKeys) {
    const fieldName = normalizeNonEmptyString(fieldNameCandidate);
    if (fieldName) {
      fieldNames.add(fieldName);
    }
  }

  const valueByFieldName = {};
  for (const fieldName of fieldNames) {
    const value =
      normalizeNonEmptyString(schemaObject[fieldName]) ??
      normalizeNonEmptyString(nodeDefinitionObject[fieldName]);
    if (!value) {
      continue;
    }

    valueByFieldName[fieldName] = value;
  }

  if (!valueByFieldName.Type) {
    const fallbackType =
      normalizeNonEmptyString(schemaObject.Type) ?? normalizeNonEmptyString(nodeDefinitionObject.Type);
    if (fallbackType) {
      valueByFieldName.Type = fallbackType;
    }
  }

  if (!valueByFieldName.Id) {
    const fallbackId =
      normalizeNonEmptyString(nodeDefinitionObject.Id) ?? normalizeNonEmptyString(templateId);
    if (fallbackId) {
      valueByFieldName.Id = fallbackId;
    }
  }

  return valueByFieldName;
}

function buildRoots(rootsCandidate, workspaceId, diagnostics) {
  const rootsObject = isObject(rootsCandidate) ? rootsCandidate : {};
  const roots = [];

  for (const [rootIdCandidate, rootDefinitionCandidate] of Object.entries(rootsObject)) {
    const rootId = normalizeNonEmptyString(rootIdCandidate);
    const rootDefinition = isObject(rootDefinitionCandidate) ? rootDefinitionCandidate : {};
    const rootNodeType = normalizeNonEmptyString(rootDefinition.RootNodeType);
    const menuName = normalizeNonEmptyString(rootDefinition.MenuName);
    if (!rootId || !rootNodeType) {
      diagnostics.push(`Skipping invalid root definition in ${workspaceId}/${WORKSPACE_CONFIG_FILENAME}.`);
      continue;
    }

    roots.push({
      rootId,
      rootNodeType,
      menuName: menuName ?? rootId,
    });
  }

  roots.sort((left, right) => left.rootId.localeCompare(right.rootId));
  return roots;
}

function buildVariants(variantsCandidate, templateById, workspaceId, diagnostics) {
  const variantsObject = isObject(variantsCandidate) ? variantsCandidate : {};
  const variants = [];

  for (const [variantIdCandidate, variantDefinitionCandidate] of Object.entries(variantsObject)) {
    const variantId = normalizeNonEmptyString(variantIdCandidate);
    const variantDefinition = isObject(variantDefinitionCandidate) ? variantDefinitionCandidate : {};
    const rawVariantMap = isObject(variantDefinition.Variants) ? variantDefinition.Variants : {};
    if (!variantId) {
      diagnostics.push(`Skipping invalid variant definition in ${workspaceId}/${WORKSPACE_CONFIG_FILENAME}.`);
      continue;
    }

    const values = [];
    const seenTemplateIds = new Set();
    for (const [variantValueCandidate, variantTemplateIdCandidate] of Object.entries(rawVariantMap)) {
      const variantValue = normalizeNonEmptyString(variantValueCandidate);
      const templateId = normalizeNonEmptyString(variantTemplateIdCandidate);
      if (!variantValue || !templateId) {
        continue;
      }

      if (!templateById.has(templateId)) {
        diagnostics.push(
          `Variant "${variantId}" references unknown template "${templateId}" (${workspaceId}/${WORKSPACE_CONFIG_FILENAME}).`
        );
        continue;
      }

      values.push({
        value: variantValue,
        templateId,
      });
      seenTemplateIds.add(templateId);
    }

    variants.push({
      variantId,
      variantFieldName: normalizeNonEmptyString(variantDefinition.VariantFieldName) ?? 'Type',
      values,
      templateIds: Array.from(seenTemplateIds),
      templateIdByValue: Object.fromEntries(values.map((entry) => [entry.value, entry.templateId])),
    });
  }

  variants.sort((left, right) => left.variantId.localeCompare(right.variantId));
  return variants;
}

function collectVariantIdentitySchemaKeys(variantsCandidate) {
  const variantIdentitySchemaKeys = new Set(['Type']);
  const variantsObject = isObject(variantsCandidate) ? variantsCandidate : {};

  for (const variantDefinitionCandidate of Object.values(variantsObject)) {
    const variantDefinition = isObject(variantDefinitionCandidate) ? variantDefinitionCandidate : {};
    const variantFieldName = normalizeNonEmptyString(variantDefinition.VariantFieldName) ?? 'Type';
    variantIdentitySchemaKeys.add(variantFieldName);
  }

  return variantIdentitySchemaKeys;
}

function buildVariantIdentityLookups(variantsCandidate) {
  const variants = Array.isArray(variantsCandidate) ? variantsCandidate : [];
  const variantFieldNames = new Set();
  const variantIdentitiesByTemplateId = {};
  const templateIdByFieldNameAndValue = {};

  for (const variant of variants) {
    const variantId = normalizeNonEmptyString(variant?.variantId);
    const variantFieldName = normalizeNonEmptyString(variant?.variantFieldName) ?? 'Type';
    const variantValues = Array.isArray(variant?.values) ? variant.values : [];
    if (!variantId) {
      continue;
    }

    variantFieldNames.add(variantFieldName);
    if (!isObject(templateIdByFieldNameAndValue[variantFieldName])) {
      templateIdByFieldNameAndValue[variantFieldName] = {};
    }

    for (const entry of variantValues) {
      const templateId = normalizeNonEmptyString(entry?.templateId);
      const value = normalizeNonEmptyString(entry?.value);
      if (!templateId || !value) {
        continue;
      }

      if (!templateIdByFieldNameAndValue[variantFieldName][value]) {
        templateIdByFieldNameAndValue[variantFieldName][value] = templateId;
      }

      if (!Array.isArray(variantIdentitiesByTemplateId[templateId])) {
        variantIdentitiesByTemplateId[templateId] = [];
      }
      variantIdentitiesByTemplateId[templateId].push({
        variantId,
        fieldName: variantFieldName,
        value,
      });
    }
  }

  for (const identityList of Object.values(variantIdentitiesByTemplateId)) {
    identityList.sort((left, right) => {
      const fieldNameCompare = left.fieldName.localeCompare(right.fieldName);
      if (fieldNameCompare !== 0) {
        return fieldNameCompare;
      }

      const valueCompare = left.value.localeCompare(right.value);
      if (valueCompare !== 0) {
        return valueCompare;
      }

      return left.variantId.localeCompare(right.variantId);
    });
  }

  return {
    variantFieldNames: Array.from(variantFieldNames).sort((left, right) =>
      left.localeCompare(right)
    ),
    variantIdentitiesByTemplateId,
    templateIdByFieldNameAndValue,
  };
}

function buildTemplateFields(
  content,
  templateId,
  workspaceId,
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
        `Node "${templateId}" has a content entry without a valid Id (${workspaceId}/${relativePath}).`
      );
      continue;
    }

    if (seenFieldIds.has(fieldId)) {
      diagnostics.push(
        `Node "${templateId}" defines duplicate field Id "${fieldId}" (${workspaceId}/${relativePath}). Keeping the latest definition.`
      );
      const existingIndex = fields.findIndex((field) => field.id === fieldId);
      if (existingIndex >= 0) {
        fields.splice(existingIndex, 1);
      }
    }
    seenFieldIds.add(fieldId);

    const fieldType = normalizeNonEmptyString(fieldCandidate.Type);
    const options = isObject(fieldCandidate.Options) ? { ...fieldCandidate.Options } : {};
    if (!fieldType) {
      diagnostics.push(
        `Node "${templateId}" field "${fieldId}" is missing a valid Type (${workspaceId}/${relativePath}).`
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

function buildTemplatePins(pins, templateId, workspaceId, relativePath, pinGroupName, diagnostics) {
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
    const pinType = normalizeNonEmptyString(pinCandidate.Type);
    if (!pinId || !pinType) {
      diagnostics.push(
        `Node "${templateId}" ${pinGroupName} contains an invalid pin definition (${workspaceId}/${relativePath}).`
      );
      continue;
    }

    if (seenPinIds.has(pinId)) {
      diagnostics.push(
        `Node "${templateId}" ${pinGroupName} contains duplicate pin Id "${pinId}" (${workspaceId}/${relativePath}). Keeping the latest definition.`
      );
      const existingIndex = normalizedPins.findIndex((pin) => pin.id === pinId);
      if (existingIndex >= 0) {
        normalizedPins.splice(existingIndex, 1);
      }
    }
    seenPinIds.add(pinId);

    normalizedPins.push({
      id: pinId,
      type: pinType,
      label: normalizeNonEmptyString(pinCandidate.Label) ?? pinId,
      multiple: pinCandidate.Multiple === true,
      isMap: pinCandidate.IsMap === true,
      color:
        pinCandidate.Color ??
        pinCandidate.color ??
        pinCandidate.Colour ??
        pinCandidate.colour,
    });
  }

  return normalizedPins;
}

function buildFieldMappings(
  schema,
  fields,
  templateId,
  workspaceId,
  relativePath,
  diagnostics,
  variantIdentitySchemaKeys = new Set(['Type'])
) {
  if (!isObject(schema)) {
    return [];
  }

  const knownFieldIds = new Set(
    Array.isArray(fields)
      ? fields
          .map((field) => normalizeNonEmptyString(field?.id))
          .filter((fieldId) => Boolean(fieldId))
      : []
  );
  const mappings = [];
  const seenFieldIds = new Set();

  for (const [schemaKeyCandidate, schemaValueCandidate] of Object.entries(schema)) {
    const schemaKey = normalizeNonEmptyString(schemaKeyCandidate);
    const fieldId = normalizeNonEmptyString(schemaValueCandidate);
    if (!schemaKey || !fieldId) {
      continue;
    }

    if (variantIdentitySchemaKeys.has(schemaKey)) {
      continue;
    }

    if (seenFieldIds.has(fieldId)) {
      diagnostics.push(
        `Node "${templateId}" maps field "${fieldId}" multiple times in Schema (${workspaceId}/${relativePath}). Keeping the latest mapping.`
      );
      const existingIndex = mappings.findIndex((mapping) => mapping.fieldId === fieldId);
      if (existingIndex >= 0) {
        mappings.splice(existingIndex, 1);
      }
    }

    if (!knownFieldIds.has(fieldId)) {
      diagnostics.push(
        `Node "${templateId}" schema key "${schemaKey}" maps to unknown field "${fieldId}" (${workspaceId}/${relativePath}).`
      );
    }

    seenFieldIds.add(fieldId);
    mappings.push({
      schemaKey,
      fieldId,
    });
  }

  return mappings;
}

function buildSchemaConnections(schema, outputPins, templateId, workspaceId, relativePath, diagnostics) {
  if (!isObject(schema)) {
    return [];
  }

  const descriptors = [];
  const seenDescriptors = new Set();

  for (const [schemaKeyCandidate, schemaValueCandidate] of Object.entries(schema)) {
    const schemaKey = normalizeSchemaConnectionRuntimeKey(schemaKeyCandidate);
    const descriptor = readSchemaLinkDescriptor(schemaValueCandidate);
    if (!schemaKey || !descriptor) {
      continue;
    }

    const resolvedOutputPin = resolveOutputPinBySchemaPinId(descriptor.pinId, outputPins);
    if (!resolvedOutputPin) {
      diagnostics.push(
        `Node "${templateId}" schema key "${schemaKey}" references unknown output pin "${descriptor.pinId}" (${workspaceId}/${relativePath}).`
      );
      continue;
    }

    const descriptorKey = `${schemaKey}\u0000${resolvedOutputPin.id}`;
    if (seenDescriptors.has(descriptorKey)) {
      const existingIndex = descriptors.findIndex(
        (entry) => entry.schemaKey === schemaKey && entry.outputPinId === resolvedOutputPin.id
      );
      if (existingIndex >= 0) {
        descriptors.splice(existingIndex, 1);
      }
    }
    seenDescriptors.add(descriptorKey);

    descriptors.push({
      schemaKey,
      outputPinId: resolvedOutputPin.id,
      outputPinType: resolvedOutputPin.type,
      nodeSelector: descriptor.nodeSelector,
      multiple: resolvedOutputPin.multiple === true,
      isMap: resolvedOutputPin.isMap === true,
    });
  }

  return descriptors;
}

function readSchemaLinkDescriptor(schemaValue) {
  if (!isObject(schemaValue)) {
    return undefined;
  }

  const nodeSelector =
    normalizeNonEmptyString(schemaValue.Node) ?? normalizeNonEmptyString(schemaValue.node);
  const pinId = normalizeNonEmptyString(schemaValue.Pin) ?? normalizeNonEmptyString(schemaValue.pin);
  if (!nodeSelector || !pinId) {
    return undefined;
  }

  return {
    nodeSelector,
    pinId,
  };
}

function resolveOutputPinBySchemaPinId(schemaPinId, outputPins) {
  if (!schemaPinId || !Array.isArray(outputPins)) {
    return undefined;
  }

  const exact = outputPins.find((pin) => pin.id === schemaPinId);
  if (exact) {
    return exact;
  }

  const schemaPinIdLower = schemaPinId.toLowerCase();
  return outputPins.find((pin) => normalizeNonEmptyString(pin.id)?.toLowerCase() === schemaPinIdLower);
}

function normalizeSchemaConnectionRuntimeKey(schemaKeyCandidate) {
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

function buildOrderedTemplates(templateById, nodeCategories, diagnostics) {
  const orderedTemplates = [];
  const assignedTemplateIds = new Set();
  const categories = isObject(nodeCategories) ? nodeCategories : {};

  for (const [categoryNameCandidate, listedNodeIds] of Object.entries(categories)) {
    const categoryName = normalizeNonEmptyString(categoryNameCandidate) ?? UNCATEGORIZED_CATEGORY;
    if (!Array.isArray(listedNodeIds)) {
      continue;
    }

    for (const listedNodeIdCandidate of listedNodeIds) {
      const listedNodeId = normalizeNonEmptyString(listedNodeIdCandidate);
      if (!listedNodeId || assignedTemplateIds.has(listedNodeId)) {
        continue;
      }

      const template = templateById.get(listedNodeId);
      if (!template) {
        diagnostics.push(
          `Workspace category "${categoryName}" references unknown node Id "${listedNodeId}".`
        );
        continue;
      }

      assignedTemplateIds.add(listedNodeId);
      orderedTemplates.push({
        ...template,
        category: categoryName,
      });
    }
  }

  const uncategorizedTemplates = Array.from(templateById.values())
    .filter((template) => !assignedTemplateIds.has(template.templateId))
    .sort((left, right) => left.label.localeCompare(right.label))
    .map((template) => ({
      ...template,
      category: UNCATEGORIZED_CATEGORY,
    }));

  return [...orderedTemplates, ...uncategorizedTemplates];
}

function groupWorkspaceEntriesByFolder(entries, globalDiagnostics) {
  const workspaceEntries = new Map();
  for (const entry of entries) {
    if (!entry.workspaceId) {
      globalDiagnostics.push(`Skipping workspace file outside Workspaces/: ${entry.modulePath}`);
      continue;
    }

    if (!workspaceEntries.has(entry.workspaceId)) {
      workspaceEntries.set(entry.workspaceId, []);
    }
    workspaceEntries.get(entry.workspaceId).push(entry);
  }

  for (const workspaceEntry of workspaceEntries.values()) {
    workspaceEntry.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  }

  return workspaceEntries;
}

function normalizeModuleEntries() {
  return Object.entries(workspaceModuleMap).map(([modulePath, moduleValue]) => {
    const pathParts = toWorkspacePathParts(modulePath);
    return {
      modulePath,
      workspaceId: pathParts.workspaceId,
      relativePath: pathParts.relativePath,
      fileName: pathParts.fileName,
      json: unwrapModuleJson(moduleValue),
    };
  });
}

function toWorkspacePathParts(modulePath) {
  const normalizedPath = typeof modulePath === 'string' ? modulePath.replaceAll('\\', '/') : '';
  const marker = '/Workspaces/';
  const markerIndex = normalizedPath.lastIndexOf(marker);
  if (markerIndex < 0) {
    return {
      workspaceId: undefined,
      relativePath: normalizedPath,
      fileName: '',
    };
  }

  const workspaceRelative = normalizedPath.slice(markerIndex + marker.length);
  const parts = workspaceRelative.split('/').filter((part) => Boolean(part));
  const workspaceId = normalizeNonEmptyString(parts[0]);
  const relativeParts = parts.slice(1);
  const relativePath = relativeParts.join('/');
  const fileName = relativeParts.length > 0 ? relativeParts[relativeParts.length - 1] : '';
  return {
    workspaceId,
    relativePath,
    fileName,
  };
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

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
