import { buildFieldValueMap } from './fieldValueUtils.js';
import {
  SAMPLE_NODE_TEMPLATES,
  findTemplateByTypeName as findDevTemplateByTypeName,
  getDefaultTemplate as getDevDefaultTemplate,
  getTemplateById as getDevTemplateById,
} from './sampleNodeTemplates.js';
import { normalizePinColor } from './pinColorUtils.js';
import { loadHytaleGeneratorJavaWorkspaceTemplates } from './workspaceTemplateLoader.js';

export const TEMPLATE_SOURCE_MODE = {
  DEV_PRESETS: 'dev-presets',
  WORKSPACE_HG_JAVA: 'workspace-hg-java',
};

let activeTemplateSourceMode = TEMPLATE_SOURCE_MODE.WORKSPACE_HG_JAVA;

const catalogByMode = new Map();
const warnedModes = new Set();

export function setActiveTemplateSourceMode(candidateMode) {
  activeTemplateSourceMode = normalizeTemplateSourceMode(candidateMode);
  const catalog = getCatalogByMode(activeTemplateSourceMode);
  logCatalogDiagnostics(activeTemplateSourceMode, catalog);
  return catalog;
}

export function getTemplateCatalog(candidateMode = activeTemplateSourceMode) {
  const normalizedMode = normalizeTemplateSourceMode(candidateMode);
  return getCatalogByMode(normalizedMode);
}

export function getTemplates() {
  return getTemplateCatalog().templates;
}

export function getTemplateById(templateId) {
  return getTemplateCatalog().getTemplateById(templateId);
}

export function getDefaultTemplate() {
  return getTemplateCatalog().getDefaultTemplate();
}

export function findTemplateByTypeName(typeName) {
  return getTemplateCatalog().findTemplateByTypeName(typeName);
}

export function getTemplateCatalogDiagnostics() {
  return getTemplateCatalog().diagnostics;
}

function getCatalogByMode(mode) {
  const existing = catalogByMode.get(mode);
  if (existing) {
    return existing;
  }

  const catalog = mode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
    ? createDevPresetCatalog()
    : createWorkspaceCatalog();
  catalogByMode.set(mode, catalog);
  return catalog;
}

function createDevPresetCatalog() {
  const fallback = createCatalogFromTemplates(SAMPLE_NODE_TEMPLATES);
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
    diagnostics: [],
  };
}

function createWorkspaceCatalog() {
  const workspaceData = loadHytaleGeneratorJavaWorkspaceTemplates();
  const baseCatalog = createCatalogFromTemplates(workspaceData.templates);

  if (baseCatalog.templates.length > 0) {
    return {
      ...baseCatalog,
      diagnostics: Array.isArray(workspaceData.diagnostics)
        ? workspaceData.diagnostics
        : [],
    };
  }

  const devFallbackCatalog = createCatalogFromTemplates(SAMPLE_NODE_TEMPLATES);
  return {
    ...devFallbackCatalog,
    diagnostics: [
      ...(Array.isArray(workspaceData.diagnostics) ? workspaceData.diagnostics : []),
      'Workspace template catalog is empty; falling back to dev preset templates.',
    ],
  };
}

function createCatalogFromTemplates(sourceTemplates) {
  const templates = normalizeTemplateArray(sourceTemplates);
  const templateById = new Map(templates.map((template) => [template.templateId, template]));
  const templateByNormalizedId = new Map();
  const lookupByTypeName = new Map();

  for (const template of templates) {
    const normalizedTemplateId = normalizeLookupKey(template.templateId);
    if (normalizedTemplateId && !templateByNormalizedId.has(normalizedTemplateId)) {
      templateByNormalizedId.set(normalizedTemplateId, template);
    }

    for (const lookupKey of getTemplateLookupKeys(template)) {
      if (!lookupByTypeName.has(lookupKey)) {
        lookupByTypeName.set(lookupKey, template);
      }
    }
  }

  return {
    templates,
    diagnostics: [],
    getTemplateById(templateId) {
      const exactTemplateId = normalizeNonEmptyString(templateId);
      if (!exactTemplateId) {
        return undefined;
      }

      return (
        templateById.get(exactTemplateId) ??
        templateByNormalizedId.get(exactTemplateId.toLowerCase())
      );
    },
    getDefaultTemplate() {
      return templates[0];
    },
    findTemplateByTypeName(typeName) {
      const lookupKey = normalizeLookupKey(typeName);
      if (!lookupKey) {
        return undefined;
      }

      return lookupByTypeName.get(lookupKey);
    },
  };
}

function normalizeTemplateArray(sourceTemplates) {
  const templates = [];
  const inputTemplates = Array.isArray(sourceTemplates) ? sourceTemplates : [];

  for (let index = 0; index < inputTemplates.length; index += 1) {
    const normalizedTemplate = normalizeTemplate(inputTemplates[index], index);
    if (normalizedTemplate) {
      templates.push(normalizedTemplate);
    }
  }

  return templates;
}

function normalizeTemplate(template, index) {
  if (!isObject(template)) {
    return undefined;
  }

  const templateId =
    normalizeNonEmptyString(template.templateId) ??
    normalizeNonEmptyString(template.defaultTypeName) ??
    `Template-${index}`;
  const label =
    normalizeNonEmptyString(template.label) ??
    normalizeNonEmptyString(template.defaultTypeName) ??
    templateId;
  const defaultTypeName =
    normalizeNonEmptyString(template.defaultTypeName) ??
    normalizeNonEmptyString(template.templateId) ??
    label;
  const nodeColor = normalizePinColor(
    template.nodeColor ??
      template.color ??
      template.Color ??
      template.colour ??
      template.Colour
  );
  const fields = Array.isArray(template.fields) ? template.fields : [];
  const inputPins = normalizePinDefinitions(template.inputPins);
  const outputPins = normalizePinDefinitions(template.outputPins);
  const schemaConnections = normalizeSchemaConnections(template.schemaConnections);
  const buildInitialValues =
    typeof template.buildInitialValues === 'function'
      ? template.buildInitialValues
      : () => buildFieldValueMap(fields);

  return {
    ...template,
    templateId,
    label,
    nodeColor,
    defaultTypeName,
    fields,
    inputPins,
    outputPins,
    schemaConnections,
    buildInitialValues,
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

    const pinId = normalizeNonEmptyString(pinCandidate.id ?? pinCandidate.Id);
    const pinType = normalizeNonEmptyString(pinCandidate.type ?? pinCandidate.Type);
    if (!pinId || !pinType) {
      continue;
    }

    normalizedPins.push({
      id: pinId,
      type: pinType,
      label: normalizeNonEmptyString(pinCandidate.label ?? pinCandidate.Label) ?? pinId,
      multiple: pinCandidate.multiple === true || pinCandidate.Multiple === true,
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

  const normalizedConnections = [];
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

    normalizedConnections.push({
      schemaKey,
      outputPinId,
      outputPinType: normalizeNonEmptyString(
        connectionCandidate.outputPinType ?? connectionCandidate.OutputPinType
      ),
      nodeSelector: normalizeNonEmptyString(
        connectionCandidate.nodeSelector ?? connectionCandidate.NodeSelector
      ),
      multiple: connectionCandidate.multiple === true || connectionCandidate.Multiple === true,
    });
  }

  return normalizedConnections;
}

function getTemplateLookupKeys(template) {
  const keys = new Set();
  const candidates = [template?.templateId, template?.defaultTypeName, template?.label];

  for (const candidate of candidates) {
    const normalized = normalizeLookupKey(candidate);
    if (normalized) {
      keys.add(normalized);
    }
  }

  return Array.from(keys);
}

function normalizeTemplateSourceMode(candidateMode) {
  return candidateMode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
    ? TEMPLATE_SOURCE_MODE.DEV_PRESETS
    : TEMPLATE_SOURCE_MODE.WORKSPACE_HG_JAVA;
}

function logCatalogDiagnostics(mode, catalog) {
  if (!catalog || warnedModes.has(mode)) {
    return;
  }

  warnedModes.add(mode);
  const diagnostics = Array.isArray(catalog.diagnostics) ? catalog.diagnostics : [];
  if (diagnostics.length === 0) {
    return;
  }

  const modeLabel =
    mode === TEMPLATE_SOURCE_MODE.DEV_PRESETS
      ? 'dev presets'
      : 'workspace HytaleGenerator Java';

  console.warn(
    `[node-editor] Template diagnostics (${modeLabel}):\n${diagnostics
      .map((message) => `- ${message}`)
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
