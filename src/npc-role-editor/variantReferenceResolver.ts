import { parseNpcDocumentText } from "../shared/npc-role-editor/documentParsing";
import type {
  NpcJsonValue,
  NpcParameterDefinitionJson,
  NpcParameterValueJson,
  NpcRoleJson,
} from "../shared/npc-role-editor/documentTypes";
import { isNpcComputeJson } from "../shared/npc-role-editor/documentTypes";
import {
  getNpcRoleReferenceName,
  matchesNpcRoleReferenceCandidate,
} from "./npcReferenceResolver";

export const VARIANT_REFERENCE_ROLE_TYPES = [
  "Generic",
  "Abstract",
  "Variant",
] as const;

export type VariantReferenceRoleType = (typeof VARIANT_REFERENCE_ROLE_TYPES)[number];

export function isVariantReferenceRoleType(value: unknown): value is VariantReferenceRoleType {
  return (
    value === "Generic" ||
    value === "Abstract" ||
    value === "Variant"
  );
}

export {
  filterNpcRoleReferenceNamesFromPaths,
  matchesNpcRoleReferenceCandidate,
  parseNpcRoleTypeFromText,
} from "./npcReferenceResolver";

export type LoadedVariantReferenceDocument = {
  referenceName: string;
  resolvedPath: string;
  text: string;
  document: NpcRoleJson;
};

export type VariantReferenceDocumentLoadResult =
  | {
      status: "loaded";
      reference: LoadedVariantReferenceDocument;
    }
  | {
      status: "missing";
    }
  | {
      status: "error";
      message: string;
    };

export type VariantAppearancePreviewContext = {
  appearanceValue?: NpcParameterValueJson;
  effectiveParameters?: Record<string, NpcParameterValueJson>;
};

export function parseLoadedVariantReferenceDocument({
  referenceName,
  resolvedPath,
  text,
}: {
  referenceName: string;
  resolvedPath: string;
  text: string;
}): LoadedVariantReferenceDocument | undefined {
  const result = parseNpcDocumentText(text);
  if (result.status !== "ready" || !isVariantReferenceRoleType(result.document.Type)) {
    return undefined;
  }

  return {
    referenceName,
    resolvedPath,
    text,
    document: result.document,
  };
}

export async function buildVariantAppearancePreviewContext({
  referenceName,
  currentDocumentReferenceName,
  loadReferenceDocument,
  visitedReferenceNames = new Set<string>(),
}: {
  referenceName: string;
  currentDocumentReferenceName?: string;
  loadReferenceDocument: (referenceName: string) => Promise<VariantReferenceDocumentLoadResult>;
  visitedReferenceNames?: Set<string>;
}): Promise<VariantAppearancePreviewContext | undefined> {
  const trimmedReferenceName = referenceName.trim();
  if (!trimmedReferenceName) {
    return undefined;
  }

  if (
    visitedReferenceNames.has(trimmedReferenceName) ||
    (currentDocumentReferenceName && trimmedReferenceName === currentDocumentReferenceName)
  ) {
    return undefined;
  }

  const nextVisitedReferenceNames = new Set(visitedReferenceNames);
  nextVisitedReferenceNames.add(trimmedReferenceName);

  const loadedReference = await loadReferenceDocument(trimmedReferenceName);
  if (loadedReference.status !== "loaded") {
    return undefined;
  }

  const { document } = loadedReference.reference;
  let inheritedContext: VariantAppearancePreviewContext | undefined;

  if (document.Type === "Variant" && typeof document.Reference === "string") {
    const trimmedParentReference = document.Reference.trim();
    if (trimmedParentReference) {
      inheritedContext = await buildVariantAppearancePreviewContext({
        referenceName: trimmedParentReference,
        currentDocumentReferenceName,
        loadReferenceDocument,
        visitedReferenceNames: nextVisitedReferenceNames,
      });
      if (!inheritedContext) {
        return undefined;
      }
    }
  }

  const effectiveParameters = {
    ...(inheritedContext?.effectiveParameters ?? {}),
    ...collectParameterValues(document),
  };
  const appearanceValue = extractAppearanceValueFromRole(document) ?? inheritedContext?.appearanceValue;
  const nextContext: VariantAppearancePreviewContext = {};
  if (appearanceValue !== undefined) {
    nextContext.appearanceValue = appearanceValue;
  }
  if (Object.keys(effectiveParameters).length > 0) {
    nextContext.effectiveParameters = effectiveParameters;
  }
  return nextContext;
}

function collectParameterValues(document: NpcRoleJson): Record<string, NpcParameterValueJson> {
  const parameters = isRecord(document.Parameters) ? document.Parameters : undefined;
  if (!parameters) {
    return {};
  }

  const collectedValues: Record<string, NpcParameterValueJson> = {};
  for (const [parameterName, parameterDefinition] of Object.entries(parameters)) {
    if (parameterName.startsWith("_") || !isRecord(parameterDefinition) || !("Value" in parameterDefinition)) {
      continue;
    }

    const value = (parameterDefinition as NpcParameterDefinitionJson).Value;
    if (isNpcParameterValue(value)) {
      collectedValues[parameterName] = structuredClone(value);
    }
  }

  return collectedValues;
}

function extractAppearanceValueFromRole(document: NpcRoleJson): NpcParameterValueJson | undefined {
  if (document.Type === "Generic" || document.Type === "Abstract") {
    return cloneNpcParameterValue((document as Record<string, unknown>).Appearance);
  }

  const modify = document.Type === "Variant" && isRecord(document.Modify) ? document.Modify : undefined;
  if (!modify) {
    return undefined;
  }

  return cloneNpcParameterValue(modify.Appearance);
}

function cloneNpcParameterValue(value: unknown): NpcParameterValueJson | undefined {
  return isNpcParameterValue(value) ? structuredClone(value) : undefined;
}

function isNpcParameterValue(value: unknown): value is NpcParameterValueJson {
  return isNpcComputeJson(value) || isNpcJsonValue(value);
}

function isNpcJsonValue(value: unknown): value is NpcJsonValue {
  if (value === null) {
    return true;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(item => isNpcJsonValue(item));
  }

  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value as Record<string, unknown>).every(child => isNpcJsonValue(child));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
