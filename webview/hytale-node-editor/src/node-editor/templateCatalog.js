import {
  SAMPLE_NODE_TEMPLATES,
  findTemplateByTypeName as findDevTemplateByTypeName,
  getDefaultTemplate as getDevDefaultTemplate,
  getTemplateById as getDevTemplateById,
} from './sampleNodeTemplates.js';
import { buildFieldValueMap } from './fieldValueUtils.js';
import { normalizePinColor } from './pinColorUtils.js';
import { loadWorkspaceTemplateCollection } from './workspaceTemplateLoader.js';

export const TEMPLATE_SOURCE_MODE = {
  DEV_PRESETS: 'dev-presets',
  WORKSPACE_HG_JAVA: 'workspace-hg-java',
};

let activeTemplateSourceMode = TEMPLATE_SOURCE_MODE.WORKSPACE_HG_JAVA;
let activeWorkspaceContext = {
  workspaceId: 'HytaleGenerator Java',
  rootId: 'Biome',
};

const catalogByKey = new Map();
const warnedCatalogKeys = new Set();

export function setActiveTemplateSourceMode(candidateMode) {
  activeTemplateSourceMode = normalizeTemplateSourceMode(candidateMode);
  const catalog = getTemplateCatalog();
  logCatalogDiagnostics(activeTemplateSourceMode, catalog);
  return catalog;
}

export function setActiveWorkspaceContext(candidateContext) {
  if (!isObject(candidateContext)) {
    return getTemplateCatalog();
  }

  const workspaceId = normalizeNonEmptyString(candidateContext.workspaceId);
  const rootId = normalizeNonEmptyString(candidateContext.rootId);
  activeWorkspaceContext = {
    workspaceId: workspaceId ?? activeWorkspaceContext.workspaceId,
    rootId: rootId ?? activeWorkspaceContext.rootId,
  };

  const catalog = getTemplateCatalog();
  logCatalogDiagnostics(activeTemplateSourceMode, catalog);
  return catalog;
}

export function getActiveWorkspaceContext() {
  return { ...activeWorkspaceContext };
}

export function getTemplateCatalog(
  candidateMode = activeTemplateSourceMode,
  candidateContext = activeWorkspaceContext
) {
  const mode = normalizeTemplateSourceMode(candidateMode);
  const key = buildCatalogKey(mode, candidateContext);
  const existing = catalogByKey.get(key);
  if (existing) {
    return existing;
  }

  const catalog = mode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
    ? createDevPresetCatalog()
    : createWorkspaceCatalog(candidateContext);
  catalogByKey.set(key, catalog);
  return catalog;
}

export function getTemplates(candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).templates;
}

export function getTemplateById(templateId, candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).getTemplateById(templateId);
}

export function getDefaultTemplate(candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).getDefaultTemplate();
}

export function findTemplateByTypeName(typeName, candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).findTemplateByTypeName(typeName);
}

export function findTemplatesByTypeName(typeName, candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).findTemplatesByTypeName(
    typeName
  );
}

export function getTemplatesForNodeSelector(nodeSelector, candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).getTemplatesForNodeSelector(
    nodeSelector
  );
}

export function getWorkspaceDefinition(candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).workspace;
}

export function getRootDefinition(candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).root;
}

export function getTemplateCatalogDiagnostics(candidateContext = activeWorkspaceContext) {
  return getTemplateCatalog(activeTemplateSourceMode, candidateContext).diagnostics;
}

function createDevPresetCatalog() {
  const fallback = createCatalogFromTemplates({
    templates: SAMPLE_NODE_TEMPLATES,
    diagnostics: [],
    workspace: undefined,
    root: undefined,
  });

  return {
    ...fallback,
    getTemplateById(templateId) {
      return getDevTemplateById(templateId) ?? fallback.getTemplateById(templateId);
    },
    getDefaultTemplate() {
      return getDevDefaultTemplate() ?? fallback.getDefaultTemplate();
    },
    findTemplateByTypeName(typeName) {
      return findDevTemplateByTypeName(typeName) ?? fallback.findTemplateByTypeName(typeName);
    },
    findTemplatesByTypeName(typeName) {
      const fromDev = findDevTemplateByTypeName(typeName);
      if (fromDev) {
        return [fromDev];
      }

      return fallback.findTemplatesByTypeName(typeName);
    },
    getTemplatesForNodeSelector(nodeSelector) {
      const normalizedSelector = normalizeLookupKey(nodeSelector);
      if (!normalizedSelector) {
        return fallback.templates;
      }

      const direct = fallback.findTemplateByTypeName(nodeSelector);
      return direct ? [direct] : [];
    },
  };
}

function createWorkspaceCatalog(candidateContext) {
  const collection = loadWorkspaceTemplateCollection();
  const workspaces = Array.isArray(collection.workspaces) ? collection.workspaces : [];
  const normalizedWorkspaceId = normalizeNonEmptyString(candidateContext?.workspaceId);
  const workspace =
    workspaces.find((entry) => entry.workspaceId === normalizedWorkspaceId) ?? workspaces[0];

  if (!workspace) {
    const fallback = createCatalogFromTemplates({
      templates: SAMPLE_NODE_TEMPLATES,
      diagnostics: ['Workspace catalog is empty; falling back to dev preset templates.'],
      workspace: undefined,
      root: undefined,
    });
    return fallback;
  }

  const normalizedRootId = normalizeNonEmptyString(candidateContext?.rootId);
  const root =
    workspace.roots?.find((entry) => entry.rootId === normalizedRootId) ?? workspace.roots?.[0];

  return createCatalogFromTemplates({
    templates: workspace.templates,
    diagnostics: [
      ...(Array.isArray(collection.diagnostics) ? collection.diagnostics : []),
      ...(Array.isArray(workspace.diagnostics) ? workspace.diagnostics : []),
    ],
    workspace,
    root,
  });
}

function createCatalogFromTemplates({ templates: sourceTemplates, diagnostics, workspace, root }) {
  const templates = normalizeTemplateArray(sourceTemplates);
  const templateById = new Map();
  const templateByLowerId = new Map();
  const templateByType = new Map();
  const templatesByType = new Map();
  const variantTemplatesById = new Map();

  for (const template of templates) {
    templateById.set(template.templateId, template);

    const lowerTemplateId = normalizeLookupKey(template.templateId);
    if (lowerTemplateId && !templateByLowerId.has(lowerTemplateId)) {
      templateByLowerId.set(lowerTemplateId, template);
    }

    const schemaTypeKey = normalizeLookupKey(template.schemaType ?? template.defaultTypeName);
    if (schemaTypeKey) {
      pushLookupTemplate(templatesByType, schemaTypeKey, template);
      if (!templateByType.has(schemaTypeKey)) {
        templateByType.set(schemaTypeKey, template);
      }
    }
  }

  const variants = Array.isArray(workspace?.variants) ? workspace.variants : [];
  for (const variant of variants) {
    const variantKey = normalizeLookupKey(variant.variantId);
    if (!variantKey || !Array.isArray(variant.templateIds)) {
      continue;
    }

    const resolvedTemplates = variant.templateIds
      .map((templateId) => templateById.get(templateId))
      .filter((template) => Boolean(template));
    variantTemplatesById.set(variantKey, resolvedTemplates);

    for (const entry of Array.isArray(variant.values) ? variant.values : []) {
      const valueKey = normalizeLookupKey(entry.value);
      const valueTemplate = templateById.get(entry.templateId);
      if (!valueKey || !valueTemplate) {
        continue;
      }
      pushLookupTemplate(templatesByType, valueKey, valueTemplate);
      if (!templateByType.has(valueKey)) {
        templateByType.set(valueKey, valueTemplate);
      }
    }
  }

  return {
    templates,
    diagnostics: Array.isArray(diagnostics) ? diagnostics : [],
    workspace,
    root,
    getTemplateById(templateId) {
      const normalizedTemplateId = normalizeNonEmptyString(templateId);
      if (!normalizedTemplateId) {
        return undefined;
      }
      return (
        templateById.get(normalizedTemplateId) ??
        templateByLowerId.get(normalizedTemplateId.toLowerCase())
      );
    },
    getDefaultTemplate() {
      const rootTemplateId = normalizeNonEmptyString(root?.rootNodeType);
      if (rootTemplateId) {
        const rootTemplate =
          templateById.get(rootTemplateId) ??
          templateByLowerId.get(rootTemplateId.toLowerCase()) ??
          variantTemplatesById.get(rootTemplateId.toLowerCase())?.[0];
        if (rootTemplate) {
          return rootTemplate;
        }
      }

      return templates[0];
    },
    findTemplateByTypeName(typeName) {
      const lookupKey = normalizeLookupKey(typeName);
      if (!lookupKey) {
        return undefined;
      }
      return (
        templateByType.get(lookupKey) ??
        templateByLowerId.get(lookupKey)
      );
    },
    findTemplatesByTypeName(typeName) {
      const lookupKey = normalizeLookupKey(typeName);
      if (!lookupKey) {
        return [];
      }

      const candidates = templatesByType.get(lookupKey);
      if (Array.isArray(candidates) && candidates.length > 0) {
        return candidates;
      }

      const directTemplate = templateByLowerId.get(lookupKey);
      return directTemplate ? [directTemplate] : [];
    },
    getTemplatesForNodeSelector(nodeSelector) {
      const selectorKey = normalizeLookupKey(nodeSelector);
      if (!selectorKey) {
        return templates;
      }

      const directTemplate = templateByLowerId.get(selectorKey);
      if (directTemplate) {
        return [directTemplate];
      }

      const variantTemplates = variantTemplatesById.get(selectorKey);
      if (variantTemplates && variantTemplates.length > 0) {
        return variantTemplates;
      }

      return [];
    },
  };
}

function pushLookupTemplate(lookup, key, template) {
  if (!lookup.has(key)) {
    lookup.set(key, []);
  }

  const templates = lookup.get(key);
  if (templates.includes(template)) {
    return;
  }

  templates.push(template);
}

function normalizeTemplateArray(sourceTemplates) {
  const normalizedTemplates = [];
  const templates = Array.isArray(sourceTemplates) ? sourceTemplates : [];
  for (let index = 0; index < templates.length; index += 1) {
    const normalizedTemplate = normalizeTemplate(templates[index], index);
    if (normalizedTemplate) {
      normalizedTemplates.push(normalizedTemplate);
    }
  }

  return normalizedTemplates;
}

function normalizeTemplate(template, index) {
  if (!isObject(template)) {
    return undefined;
  }

  const templateId =
    normalizeNonEmptyString(template.templateId) ??
    normalizeNonEmptyString(template.defaultTypeName) ??
    `Template-${index}`;
  const label = normalizeNonEmptyString(template.label) ?? templateId;
  const schemaType = normalizeNonEmptyString(template.schemaType);
  const defaultTypeName = schemaType ?? normalizeNonEmptyString(template.defaultTypeName) ?? templateId;
  const nodeColor = normalizePinColor(
    template.nodeColor ??
      template.color ??
      template.Color ??
      template.colour ??
      template.Colour
  );

  return {
    ...template,
    templateId,
    label,
    schemaType,
    defaultTypeName,
    nodeColor,
    fields: Array.isArray(template.fields) ? template.fields : [],
    inputPins: normalizePinDefinitions(template.inputPins),
    outputPins: normalizePinDefinitions(template.outputPins),
    schemaConnections: normalizeSchemaConnections(template.schemaConnections),
    fieldRuntimeKeyByFieldId: isObject(template.fieldRuntimeKeyByFieldId)
      ? template.fieldRuntimeKeyByFieldId
      : {},
    fieldIdBySchemaKey: isObject(template.fieldIdBySchemaKey) ? template.fieldIdBySchemaKey : {},
    buildInitialValues:
      typeof template.buildInitialValues === 'function'
        ? template.buildInitialValues
        : () => buildFieldValueMap(Array.isArray(template.fields) ? template.fields : []),
  };
}

function normalizePinDefinitions(pinCandidates) {
  if (!Array.isArray(pinCandidates)) {
    return [];
  }

  const normalizedPins = [];
  for (const pinCandidate of pinCandidates) {
    if (!isObject(pinCandidate)) {
      continue;
    }

    const id = normalizeNonEmptyString(pinCandidate.id ?? pinCandidate.Id);
    const type = normalizeNonEmptyString(pinCandidate.type ?? pinCandidate.Type);
    if (!id || !type) {
      continue;
    }

    normalizedPins.push({
      id,
      type,
      label: normalizeNonEmptyString(pinCandidate.label ?? pinCandidate.Label) ?? id,
      multiple: pinCandidate.multiple === true || pinCandidate.Multiple === true,
      isMap: pinCandidate.isMap === true || pinCandidate.IsMap === true,
      color: normalizePinColor(
        pinCandidate.color ??
          pinCandidate.Color ??
          pinCandidate.colour ??
          pinCandidate.Colour
      ),
    });
  }

  return normalizedPins;
}

function normalizeSchemaConnections(connectionCandidates) {
  if (!Array.isArray(connectionCandidates)) {
    return [];
  }

  const connections = [];
  for (const connectionCandidate of connectionCandidates) {
    if (!isObject(connectionCandidate)) {
      continue;
    }

    const schemaKey = normalizeNonEmptyString(
      connectionCandidate.schemaKey ?? connectionCandidate.SchemaKey
    );
    const outputPinId = normalizeNonEmptyString(
      connectionCandidate.outputPinId ?? connectionCandidate.OutputPinId
    );
    if (!schemaKey || !outputPinId) {
      continue;
    }

    connections.push({
      schemaKey,
      outputPinId,
      outputPinType: normalizeNonEmptyString(
        connectionCandidate.outputPinType ?? connectionCandidate.OutputPinType
      ),
      nodeSelector: normalizeNonEmptyString(
        connectionCandidate.nodeSelector ?? connectionCandidate.NodeSelector
      ),
      multiple: connectionCandidate.multiple === true || connectionCandidate.Multiple === true,
      isMap: connectionCandidate.isMap === true || connectionCandidate.IsMap === true,
    });
  }

  return connections;
}

function buildCatalogKey(mode, context) {
  const workspaceId = normalizeNonEmptyString(context?.workspaceId) ?? 'workspace-default';
  const rootId = normalizeNonEmptyString(context?.rootId) ?? 'root-default';
  return `${mode}:${workspaceId}:${rootId}`;
}

function normalizeTemplateSourceMode(candidateMode) {
  return candidateMode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
    ? TEMPLATE_SOURCE_MODE.DEV_PRESETS
    : TEMPLATE_SOURCE_MODE.WORKSPACE_HG_JAVA;
}

function logCatalogDiagnostics(mode, catalog) {
  if (!catalog) {
    return;
  }

  const workspaceLabel = normalizeNonEmptyString(catalog?.workspace?.workspaceId) ?? 'workspace';
  const rootLabel = normalizeNonEmptyString(catalog?.root?.rootId) ?? 'root';
  const warningKey = `${mode}:${workspaceLabel}:${rootLabel}`;
  if (warnedCatalogKeys.has(warningKey)) {
    return;
  }
  warnedCatalogKeys.add(warningKey);

  const diagnostics = Array.isArray(catalog.diagnostics) ? catalog.diagnostics : [];
  if (diagnostics.length === 0) {
    return;
  }

  const modeLabel =
    mode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
      ? 'dev presets'
      : `workspace ${workspaceLabel} (${rootLabel})`;
  console.warn(
    `[node-editor] Template diagnostics (${modeLabel}):\n${diagnostics
      .map((diagnostic) => `- ${diagnostic}`)
      .join('\n')}`
  );
}

function normalizeLookupKey(candidate) {
  const normalized = normalizeNonEmptyString(candidate);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
