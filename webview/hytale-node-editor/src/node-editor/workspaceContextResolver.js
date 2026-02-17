import { loadWorkspaceTemplateCollection } from './workspaceTemplateLoader.js';
import { resolveTemplateIdFromPayloadVariant } from './variantIdentityResolver.js';

const WORKSPACE_PATH_RULES = [
  {
    workspaceId: 'ScriptableBrushes',
    rootId: 'DropList',
    includesAny: ['/server/scriptedbrushes/', '/server/scriptablebrushes/'],
  },
  {
    workspaceId: 'HytaleGenerator Java',
    rootId: 'Biome',
    includesAny: ['/server/hytalegenerator/biomes/'],
  },
  {
    workspaceId: 'HytaleGenerator Java',
    rootId: 'Density',
    includesAny: ['/server/hytalegenerator/density/'],
  },
  {
    workspaceId: 'HytaleGenerator Java',
    rootId: 'BlockMask',
    includesAny: ['/server/hytalegenerator/materialmasks/'],
  },
  {
    workspaceId: 'HytaleGenerator Java',
    rootId: 'Assignments',
    includesAny: ['/server/hytalegenerator/assignments/'],
  },
];

export function resolveWorkspaceContext({
  documentPath,
  metadataWorkspaceId,
  runtimeRoot,
} = {}) {
  const diagnostics = [];
  const collection = loadWorkspaceTemplateCollection();
  const workspaces = Array.isArray(collection.workspaces) ? collection.workspaces : [];
  if (workspaces.length === 0) {
    return {
      workspaceId: undefined,
      workspaceName: undefined,
      rootId: undefined,
      rootNodeType: undefined,
      rootMenuName: undefined,
      rootTemplateId: undefined,
      source: 'none',
      diagnostics: ['No workspace templates are available.'],
    };
  }

  const pathMatch = findWorkspaceByPath(documentPath, workspaces);
  if (pathMatch) {
    return finalizeContext(pathMatch.workspace, pathMatch.root, runtimeRoot, diagnostics, 'path');
  }

  const metadataMatch = findWorkspaceByMetadataWorkspaceId(metadataWorkspaceId, workspaces);
  if (metadataMatch) {
    return finalizeContext(
      metadataMatch.workspace,
      metadataMatch.root,
      runtimeRoot,
      diagnostics,
      'metadata'
    );
  }

  const defaultWorkspace = workspaces.find((workspace) => workspace.workspaceId === 'HytaleGenerator Java')
    ?? workspaces[0];
  const defaultRoot = findRootById(defaultWorkspace, 'Biome') ?? defaultWorkspace.roots?.[0];
  return finalizeContext(defaultWorkspace, defaultRoot, runtimeRoot, diagnostics, 'default');
}

export function resolveTemplateByType(workspace, typeName) {
  const normalizedType = normalizeNonEmptyString(typeName);
  if (!workspace || !normalizedType) {
    return undefined;
  }

  const templates = Array.isArray(workspace.templates) ? workspace.templates : [];
  const templateIdFromVariantIdentity = resolveTemplateIdFromPayloadVariant(
    { Type: normalizedType },
    workspace,
    { includeNodeIdFallback: false }
  )?.templateId;
  if (templateIdFromVariantIdentity) {
    const mappedTemplate = templates.find((template) => template.templateId === templateIdFromVariantIdentity);
    if (mappedTemplate) {
      return mappedTemplate;
    }
  }

  const exactSchemaTypeMatch = templates.find(
    (template) => normalizeNonEmptyString(template?.schemaType) === normalizedType
  );
  if (exactSchemaTypeMatch) {
    return exactSchemaTypeMatch;
  }

  const caseInsensitiveType = normalizedType.toLowerCase();
  const schemaTypeFallback = templates.find(
    (template) => normalizeNonEmptyString(template?.schemaType)?.toLowerCase() === caseInsensitiveType
  );
  if (schemaTypeFallback) {
    return schemaTypeFallback;
  }

  const variants = Array.isArray(workspace.variants) ? workspace.variants : [];
  for (const variant of variants) {
    const directVariantValue = variant?.templateIdByValue?.[normalizedType];
    if (directVariantValue) {
      return templates.find((template) => template.templateId === directVariantValue);
    }
  }

  for (const variant of variants) {
    const entries = Array.isArray(variant?.values) ? variant.values : [];
    const matched = entries.find(
      (entry) => normalizeNonEmptyString(entry?.value)?.toLowerCase() === caseInsensitiveType
    );
    if (matched) {
      return templates.find((template) => template.templateId === matched.templateId);
    }
  }

  const templateIdMatch = templates.find(
    (template) => normalizeNonEmptyString(template?.templateId) === normalizedType
  );
  if (templateIdMatch) {
    return templateIdMatch;
  }

  return templates.find(
    (template) => normalizeNonEmptyString(template?.templateId)?.toLowerCase() === caseInsensitiveType
  );
}

function finalizeContext(workspace, root, runtimeRoot, diagnostics, source) {
  const resolvedWorkspace = workspace;
  const resolvedRoot = root ?? workspace?.roots?.[0];
  let rootTemplateId;

  if (resolvedWorkspace) {
    const rootIdentityResolution = resolveTemplateIdFromPayloadVariant(runtimeRoot, resolvedWorkspace, {
      nodeId: runtimeRoot?.$NodeId,
      includeNodeIdFallback: true,
    });
    if (rootIdentityResolution?.templateId) {
      rootTemplateId = rootIdentityResolution.templateId;
    } else if (rootIdentityResolution?.identity?.value) {
      const identity = rootIdentityResolution.identity;
      diagnostics.push(
        `Root payload variant identity "${identity.fieldName}=${identity.value}" did not resolve to a template in workspace "${resolvedWorkspace.workspaceId}".`
      );
    } else {
      const rootTypeFromPayload = normalizeNonEmptyString(runtimeRoot?.Type);
      const rootTemplate = resolveTemplateByType(resolvedWorkspace, rootTypeFromPayload);
      if (rootTemplate) {
        rootTemplateId = rootTemplate.templateId;
      }
    }
  }

  if (!rootTemplateId && resolvedWorkspace) {
    const rootTypeFromPayload = normalizeNonEmptyString(runtimeRoot?.Type);
    if (rootTypeFromPayload) {
      const rootTemplate = resolveTemplateByType(resolvedWorkspace, rootTypeFromPayload);
      if (rootTemplate) {
        rootTemplateId = rootTemplate.templateId;
      }
    }
  }

  if (!rootTemplateId && resolvedWorkspace && resolvedRoot?.rootNodeType) {
    const selectorTemplate = resolveTemplateFromRootNodeType(resolvedWorkspace, resolvedRoot.rootNodeType);
    if (selectorTemplate) {
      rootTemplateId = selectorTemplate.templateId;
    }
  }

  return {
    workspaceId: resolvedWorkspace?.workspaceId,
    workspaceName: resolvedWorkspace?.workspaceName,
    rootId: resolvedRoot?.rootId,
    rootNodeType: resolvedRoot?.rootNodeType,
    rootMenuName: resolvedRoot?.menuName,
    rootTemplateId,
    source,
    diagnostics,
  };
}

function resolveTemplateFromRootNodeType(workspace, rootNodeType) {
  const selector = normalizeNonEmptyString(rootNodeType);
  if (!workspace || !selector) {
    return undefined;
  }

  const template = workspace.templates?.find((candidate) => candidate.templateId === selector);
  if (template) {
    return template;
  }

  const variant = workspace.variants?.find((candidate) => candidate.variantId === selector);
  if (!variant) {
    return undefined;
  }

  const firstTemplateId = Array.isArray(variant.templateIds) ? variant.templateIds[0] : undefined;
  if (!firstTemplateId) {
    return undefined;
  }

  return workspace.templates?.find((candidate) => candidate.templateId === firstTemplateId);
}

function findWorkspaceByPath(documentPath, workspaces) {
  const normalizedPath = normalizeDocumentPath(documentPath);
  if (!normalizedPath) {
    return undefined;
  }

  for (const rule of WORKSPACE_PATH_RULES) {
    if (!rule.includesAny.some((fragment) => normalizedPath.includes(fragment))) {
      continue;
    }

    const workspace = workspaces.find((candidate) => candidate.workspaceId === rule.workspaceId);
    if (!workspace) {
      continue;
    }

    const root = findRootById(workspace, rule.rootId) ?? workspace.roots?.[0];
    if (!root) {
      continue;
    }

    return {
      workspace,
      root,
    };
  }

  return undefined;
}

function findWorkspaceByMetadataWorkspaceId(metadataWorkspaceId, workspaces) {
  const normalizedWorkspaceId = normalizeNonEmptyString(metadataWorkspaceId);
  if (!normalizedWorkspaceId) {
    return undefined;
  }

  const target = normalizedWorkspaceId.toLowerCase();
  for (const workspace of workspaces) {
    const roots = Array.isArray(workspace.roots) ? workspace.roots : [];
    const matchingRoot = roots.find(
      (root) => normalizeNonEmptyString(root?.menuName)?.toLowerCase() === target
    );
    if (matchingRoot) {
      return {
        workspace,
        root: matchingRoot,
      };
    }
  }

  return undefined;
}

function findRootById(workspace, rootId) {
  const normalizedRootId = normalizeNonEmptyString(rootId);
  if (!workspace || !normalizedRootId) {
    return undefined;
  }

  const roots = Array.isArray(workspace.roots) ? workspace.roots : [];
  return roots.find((root) => root.rootId === normalizedRootId);
}

function normalizeDocumentPath(documentPath) {
  if (typeof documentPath !== 'string' || !documentPath.trim()) {
    return undefined;
  }

  return documentPath.replaceAll('\\', '/').toLowerCase();
}

function normalizeNonEmptyString(candidate) {
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}
