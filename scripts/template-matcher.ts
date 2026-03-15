#!/usr/bin/env node

const {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(outputText, filename);
};

const {
  WorkspaceRuntime,
  getNodeEditorWorkspaceSupplementPath,
  getNodeEditorWorkspaceSupplementsRootPath,
} = require("../src/node-editor/workspaceResolver.ts");
const { SchemaRuntime } = require("../src/schema/schemaLoader.ts");
const { safeParseJSONFile } = require("../src/shared/fileUtils.ts");

const SCHEMAS_DIR = path.resolve(__dirname, "../default-data/export-data/schemas");
const WORKSPACES_DIR = path.resolve(
  __dirname,
  "../default-data/node-editor-workspace-definitions",
);
const WORKSPACE_SUPPLEMENTS_DIR = getNodeEditorWorkspaceSupplementsRootPath(WORKSPACES_DIR);

const ROOT_SCHEMA_BY_WORKSPACE_AND_ROOT = {
  "HytaleGenerator (Java)::Biome": "BiomeAsset.json",
  "HytaleGenerator (Java)::Density": "DensityAsset.json",
  "HytaleGenerator (Java)::BlockMask": "BlockMaskAsset.json",
  "HytaleGenerator (Java)::Assignments": "AssignmentsAsset.json",
  "Scriptable Brushes::DropList": "ScriptedBrushAsset.json",
};

const PREFERRED_SCHEMA_REF_OVERRIDES = {
  BoxProp: "common.json#/definitions/BoxPropAsset",
  UnionPositions: "common.json#/definitions/UnionPositionProviderAsset",
  PCNDistanceFunction: "common.json#/definitions/PositionsCellNoiseDensityAsset/properties/DistanceFunction",
  "Max.Curve": "common.json#/definitions/Positions3DDensityAsset/properties/DistanceCurve",
};

const QUIET_LOGGER = {
  error() {},
  warn() {},
  info() {},
};

function main() {
  const schemaRuntime = new SchemaRuntime(SCHEMAS_DIR);
  const workspaceRuntime = new WorkspaceRuntime(WORKSPACES_DIR, schemaRuntime, QUIET_LOGGER);
  const rootSchemaRefs = loadRootSchemaRefs(schemaRuntime.schemaDir);
  const workspaceDirectoriesByName = loadWorkspaceDirectoriesByName(WORKSPACES_DIR);
  const objectRefsByField = buildObjectRefsByField(schemaRuntime);

  let totalConflicts = 0;
  let totalPinnedVariantFallbacks = 0;

  for (const [workspaceName, workspace] of Object.entries(workspaceRuntime.nodeEditorWorkspaces)) {
    const workspaceDirectory = workspaceDirectoriesByName[workspaceName];
    if (!workspaceDirectory) {
      console.warn(`[template-matcher] workspace directory not found: ${workspaceName}`);
      continue;
    }

    const outcome = resolveWorkspaceMappings(
      schemaRuntime,
      objectRefsByField,
      rootSchemaRefs,
      workspaceName,
      workspace,
      PREFERRED_SCHEMA_REF_OVERRIDES,
    );

    assertMappingsShape(workspaceName, outcome.mappings);

    const supplementPath = getNodeEditorWorkspaceSupplementPath(
      WORKSPACE_SUPPLEMENTS_DIR,
      workspaceDirectory.directoryName,
    );
    const nextSupplements = existsSync(supplementPath)
      ? updateWorkspaceTemplateSupplementRefs(
          loadWorkspaceTemplateSupplements(supplementPath),
          outcome.mappings,
        )
      : createWorkspaceTemplateSupplements(outcome.mappings);
    mkdirSync(path.dirname(supplementPath), { recursive: true });
    writeFileSync(supplementPath, JSON.stringify(nextSupplements, null, 2));

    const unresolvedCount = Object.values(outcome.mappings).filter(ref => ref === null).length;
    totalConflicts += outcome.conflicts;
    totalPinnedVariantFallbacks += outcome.pinnedVariantFallbacks;

    console.log(
      `[template-matcher] ${workspaceName}: wrote ${path.basename(supplementPath)} (${Object.keys(outcome.mappings).length} templates, unresolved=${unresolvedCount}, conflicts=${outcome.conflicts}, pinned-variant-fallbacks=${outcome.pinnedVariantFallbacks})`,
    );
  }

  console.log(
    `[template-matcher] done: conflicts=${totalConflicts}, pinned-variant-fallbacks=${totalPinnedVariantFallbacks}`,
  );
}

function loadRootSchemaRefs(schemaDir) {
  const rootSchemaRefs = {};

  for (const fileName of readdirSync(schemaDir)) {
    if (!fileName.endsWith(".json") || fileName === "common.json") {
      continue;
    }

    const schemaFile = safeParseJSONFile(path.join(schemaDir, fileName));
    if (typeof schemaFile?.$id !== "string" || schemaFile.$id.length === 0) {
      continue;
    }

    const ref = `${schemaFile.$id}#`;
    rootSchemaRefs[fileName] = ref;
    rootSchemaRefs[schemaFile.$id] = ref;
  }

  return rootSchemaRefs;
}

function loadWorkspaceDirectoriesByName(workspacesRootPath) {
  const workspacesByName = {};

  for (const entry of readdirSync(workspacesRootPath)) {
    const directoryPath = path.join(workspacesRootPath, entry);
    if (!statSync(directoryPath).isDirectory()) {
      continue;
    }

    const workspacePath = path.join(directoryPath, "_Workspace.json");
    if (!existsSync(workspacePath)) {
      continue;
    }

    const workspaceDefinition = safeParseJSONFile(workspacePath);
    const workspaceName = normalizeNonEmptyString(workspaceDefinition?.WorkspaceName);
    if (!workspaceName) {
      continue;
    }

    if (workspaceName in workspacesByName) {
      throw new Error(`Duplicate workspace name found: ${workspaceName}`);
    }

    workspacesByName[workspaceName] = {
      directoryName: entry,
      directoryPath,
    };
  }

  return workspacesByName;
}

function loadWorkspaceTemplateSupplements(supplementPath) {
  if (!existsSync(supplementPath)) {
    return {};
  }

  const parsed = safeParseJSONFile(supplementPath);
  return isRecord(parsed) ? parsed : {};
}

function createWorkspaceTemplateSupplements(mappings) {
  const supplements = {};

  for (const templateId of Object.keys(mappings).sort((a, b) => a.localeCompare(b))) {
    const mappingRef = mappings[templateId];
    if (typeof mappingRef !== "string") {
      continue;
    }
    supplements[templateId] = { $ref: mappingRef };
  }

  return supplements;
}

function updateWorkspaceTemplateSupplementRefs(existingSupplements, mappings) {
  const nextSupplements = structuredClone(existingSupplements);

  for (const [templateId, mappingRef] of Object.entries(mappings)) {
    const supplement = isRecord(nextSupplements[templateId]) ? nextSupplements[templateId] : {};
    if (typeof mappingRef === "string") {
      supplement.$ref = mappingRef;
    } else {
      delete supplement.$ref;
    }

    if (Object.keys(supplement).length > 0) {
      nextSupplements[templateId] = supplement;
    } else {
      delete nextSupplements[templateId];
    }
  }

  return nextSupplements;
}

function buildObjectRefsByField(schemaRuntime) {
  const objectRefsByField = new Map();

  for (const [ref, assetDefinition] of schemaRuntime.assetsByRef) {
    if (assetDefinition.rootField.type === "object") {
      objectRefsByField.set(assetDefinition.rootField, ref);
    }
  }

  return objectRefsByField;
}

function resolveWorkspaceMappings(
  schemaRuntime,
  objectRefsByField,
  rootSchemaRefs,
  workspaceName,
  workspace,
  preferredRefs,
) {
  const resolvedRefsByTemplateId = {};
  const seen = new Set();
  const warnedTemplateConflicts = new Set();
  let conflicts = 0;
  let pinnedVariantFallbacks = 0;

  const walkTemplate = (schemaRef, variantOrTemplateId) => {
    const seenKey = `${variantOrTemplateId}::${schemaRef}`;
    if (seen.has(seenKey)) {
      return;
    }
    seen.add(seenKey);

    const variantKind = workspace.variantKindsById[variantOrTemplateId];
    if (variantKind?.Variants) {
      for (const templateId of Object.values(variantKind.Variants)) {
        walkTemplate(schemaRef, templateId);
      }
      return;
    }

    const template = workspace.nodeTemplatesById[variantOrTemplateId];
    if (!template) {
      console.warn(`[template-matcher] template missing: ${workspaceName}/${variantOrTemplateId}`);
      return;
    }

    const resolution = resolveTemplateMapping(
      schemaRuntime,
      objectRefsByField,
      schemaRef,
      template,
      variantOrTemplateId,
      preferredRefs[variantOrTemplateId],
    );
    if (resolution.unresolvedPinnedVariant) {
      pinnedVariantFallbacks += 1;
    }

    const didConflict = mergeResolvedRef(
      resolvedRefsByTemplateId,
      variantOrTemplateId,
      resolution.mappingRef,
      preferredRefs[variantOrTemplateId],
      warnedTemplateConflicts,
      workspaceName,
      schemaRef,
    );
    if (didConflict) {
      conflicts += 1;
    }

    if (!resolution.canTraverseChildren) {
      return;
    }

    for (const [schemaKey, childVariantOrTemplateId] of Object.entries(template.childTypes)) {
      walkTemplate(
        appendSchemaReference(resolution.traversalRef, schemaKey),
        childVariantOrTemplateId,
      );
    }
  };

  for (const [rootId, rootDefinition] of Object.entries(workspace.roots)) {
    const rootTemplateOrVariantId = normalizeNonEmptyString(rootDefinition?.RootNodeType);
    if (!rootTemplateOrVariantId) {
      console.warn(`[template-matcher] missing RootNodeType for ${workspaceName}/${rootId}`);
      continue;
    }

    const rootSchemaFile = ROOT_SCHEMA_BY_WORKSPACE_AND_ROOT[`${workspaceName}::${rootId}`];
    if (!rootSchemaFile) {
      console.warn(`[template-matcher] missing root schema mapping for ${workspaceName}/${rootId}`);
      continue;
    }

    const rootSchemaRef = rootSchemaRefs[rootSchemaFile];
    if (!rootSchemaRef) {
      console.warn(
        `[template-matcher] root schema ref not found for ${workspaceName}/${rootId}: ${rootSchemaFile}`,
      );
      continue;
    }

    walkTemplate(rootSchemaRef, rootTemplateOrVariantId);
  }

  const mappings = {};
  for (const templateId of Object.keys(workspace.nodeTemplatesById).sort((a, b) => a.localeCompare(b))) {
    mappings[templateId] = resolvedRefsByTemplateId[templateId] ?? null;
  }

  return {
    mappings,
    conflicts,
    pinnedVariantFallbacks,
  };
}

function resolveTemplateMapping(
  schemaRuntime,
  objectRefsByField,
  schemaRef,
  template,
  templateId,
  preferredRef,
) {
  const field = resolveStructuredField(schemaRuntime, schemaRef);
  if (!field) {
    console.error(
      `[template-matcher] schema reference not resolved for template ${templateId}: ${schemaRef}`,
    );
    return {
      mappingRef: null,
      traversalRef: schemaRef,
      canTraverseChildren: false,
      unresolvedPinnedVariant: false,
    };
  }

  if (field.type === "object") {
    const ref = objectRefsByField.get(field);
    if (!ref) {
      console.error(
        `[template-matcher] canonical object ref not found for template ${templateId}: ${schemaRef}`,
      );
      return {
        mappingRef: null,
        traversalRef: schemaRef,
        canTraverseChildren: false,
        unresolvedPinnedVariant: false,
      };
    }

    return {
      mappingRef: ref,
      traversalRef: ref,
      canTraverseChildren: true,
      unresolvedPinnedVariant: false,
    };
  }

  if (field.type === "variant") {
    const identityKey = field.identityField.schemaKey;
    const constantValue = template.schemaConstants[identityKey];
    if (!constantValue) {
      return mappingFromPreferredRef(schemaRuntime, preferredRef) ?? {
        mappingRef: schemaRef,
        traversalRef: schemaRef,
        canTraverseChildren: false,
        unresolvedPinnedVariant: false,
      };
    }

    const objectField = field.variantsByIdentity[constantValue];
    const concreteRef = objectField ? objectRefsByField.get(objectField) : undefined;
    if (concreteRef && isTrustworthyVariantMatch(objectField, identityKey, constantValue)) {
      return {
        mappingRef: concreteRef,
        traversalRef: concreteRef,
        canTraverseChildren: true,
        unresolvedPinnedVariant: false,
      };
    }

    const candidateRef = resolveVariantCandidateRef(
      schemaRuntime,
      objectRefsByField,
      field,
      template,
      templateId,
      constantValue,
      preferredRef,
    );
    if (candidateRef) {
      return {
        mappingRef: candidateRef,
        traversalRef: candidateRef,
        canTraverseChildren: true,
        unresolvedPinnedVariant: false,
      };
    }

    const preferredMapping = mappingFromPreferredRef(schemaRuntime, preferredRef);
    if (preferredMapping) {
      return preferredMapping;
    }

    console.warn(
      `[template-matcher] pinned variant not resolved for ${templateId}: ${identityKey}=${constantValue} at ${schemaRef}`,
    );
    return {
      mappingRef: schemaRef,
      traversalRef: schemaRef,
      canTraverseChildren: false,
      unresolvedPinnedVariant: true,
    };
  }

  console.warn(
    `[template-matcher] schema reference ${schemaRef} resolved to ${field.type}, not an object field or variant field, for template ${templateId}`,
  );
  return {
    mappingRef: null,
    traversalRef: schemaRef,
    canTraverseChildren: false,
    unresolvedPinnedVariant: false,
  };
}

function resolveStructuredField(schemaRuntime, schemaRef) {
  let field = schemaRuntime.resolveFieldByReferencePointer(schemaRef);

  while (field) {
    if (field.type === "array" && !Array.isArray(field.items)) {
      field = field.items;
      continue;
    }
    if (field.type === "map") {
      field = field.valueField;
      continue;
    }
    if (field.type === "ref") {
      field = schemaRuntime.assetsByRef.get(field.$ref)?.rootField;
      continue;
    }
    if (field.type === "inlineOrReference") {
      field =
        field.inlineField.type === "ref"
          ? schemaRuntime.assetsByRef.get(field.inlineField.$ref)?.rootField
          : field.inlineField;
      continue;
    }
    break;
  }

  return field;
}

function resolveVariantCandidateRef(
  schemaRuntime,
  objectRefsByField,
  variantField,
  template,
  templateId,
  constantValue,
  preferredRef,
) {
  const candidates = [];

  for (const unmappedField of variantField.unmappedFields ?? []) {
    if (unmappedField.type === "ref") {
      const candidateField = schemaRuntime.assetsByRef.get(unmappedField.$ref)?.rootField;
      if (candidateField?.type !== "object") {
        continue;
      }
      candidates.push({
        ref: unmappedField.$ref,
        objectField: candidateField,
      });
    } else if (unmappedField.type === "object") {
      candidates.push({
        ref: objectRefsByField.get(unmappedField),
        objectField: unmappedField,
      });
    }
  }

  const matchingCandidates = candidates.filter(candidate =>
    templateMatchesCandidate(template, candidate.objectField),
  );
  if (matchingCandidates.length === 0) {
    return undefined;
  }

  if (preferredRef) {
    const preferredCandidate = matchingCandidates.find(candidate => candidate.ref === preferredRef);
    if (preferredCandidate?.ref) {
      return preferredCandidate.ref;
    }
  }

  if (matchingCandidates.length === 1) {
    return matchingCandidates[0].ref;
  }

  const normalizedConstant = normalizeIdentifier(constantValue);
  const normalizedTemplateId = normalizeIdentifier(templateId);
  let bestCandidate;
  let bestScore = 0;
  let bestScoreCount = 0;

  for (const candidate of matchingCandidates) {
    if (!candidate.ref) {
      continue;
    }
    const normalizedRef = normalizeIdentifier(candidate.ref);
    let score = 0;
    if (normalizedConstant && normalizedRef.includes(normalizedConstant)) {
      score += 2;
    }
    if (normalizedTemplateId && normalizedRef.includes(normalizedTemplateId)) {
      score += 1;
    }
    if (score === 0) {
      continue;
    }
    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
      bestScoreCount = 1;
    } else if (score === bestScore) {
      bestScoreCount += 1;
    }
  }

  if (bestCandidate?.ref && bestScoreCount === 1) {
    return bestCandidate.ref;
  }

  return undefined;
}

function templateMatchesCandidate(template, objectField) {
  for (const schemaKey of Object.keys(template.fieldsBySchemaKey)) {
    if (!(schemaKey in objectField.properties)) {
      return false;
    }
  }
  for (const schemaKey of Object.keys(template.childTypes)) {
    if (!(schemaKey in objectField.properties)) {
      return false;
    }
  }
  return true;
}

function mappingFromPreferredRef(schemaRuntime, preferredRef) {
  if (!preferredRef) {
    return undefined;
  }

  const preferredField = resolveStructuredField(schemaRuntime, preferredRef);
  if (preferredField?.type === "object") {
    return {
      mappingRef: preferredRef,
      traversalRef: preferredRef,
      canTraverseChildren: true,
      unresolvedPinnedVariant: false,
    };
  }
  if (preferredField?.type === "variant") {
    return {
      mappingRef: preferredRef,
      traversalRef: preferredRef,
      canTraverseChildren: false,
      unresolvedPinnedVariant: false,
    };
  }

  return undefined;
}

function isTrustworthyVariantMatch(objectField, identityKey, constantValue) {
  const identityField = objectField?.properties?.[identityKey];
  if (identityField?.type !== "string") {
    return false;
  }
  if (identityField.const === constantValue) {
    return true;
  }
  return Array.isArray(identityField.bannedValues) && identityField.bannedValues.length > 0;
}

function mergeResolvedRef(
  resolvedRefsByTemplateId,
  templateId,
  nextRef,
  preferredRef,
  warnedTemplateConflicts,
  workspaceName,
  schemaRef,
) {
  const existingRef = resolvedRefsByTemplateId[templateId];
  if (existingRef === undefined || existingRef === nextRef) {
    resolvedRefsByTemplateId[templateId] = nextRef;
    return false;
  }

  if (existingRef === null) {
    resolvedRefsByTemplateId[templateId] = nextRef;
    return false;
  }
  if (nextRef === null) {
    return false;
  }
  if (preferredRef === nextRef) {
    resolvedRefsByTemplateId[templateId] = nextRef;
    return false;
  }
  if (preferredRef === existingRef) {
    return false;
  }

  if (!warnedTemplateConflicts.has(templateId)) {
    warnedTemplateConflicts.add(templateId);
    console.warn(
      `[template-matcher] conflicting refs for ${workspaceName}/${templateId}: keeping ${existingRef}, skipping ${nextRef} at ${schemaRef}`,
    );
  }
  return true;
}

function appendSchemaReference(schemaRef, schemaKey) {
  return `${schemaRef}/properties/${schemaKey}`;
}

function assertMappingsShape(workspaceName, mappings) {
  for (const [templateId, ref] of Object.entries(mappings)) {
    if (typeof ref === "string" && ref.includes("/anyOf/")) {
      throw new Error(
        `[template-matcher] ${workspaceName}/${templateId} resolved to unsupported branch pointer ${ref}`,
      );
    }
  }
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeIdentifier(value) {
  return typeof value === "string" ? value.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() : "";
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[template-matcher] ${message}\n`);
  process.exit(1);
}
