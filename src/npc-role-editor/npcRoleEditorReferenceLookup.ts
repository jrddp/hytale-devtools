import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { assetCacheRuntime, indexes } from "../extension";
import { getValuesByIndexReference } from "../schema/symbolResolver";
import type { RegisteredAssetsIndexShard } from "../shared/indexTypes";
import { parseNpcDocumentText } from "../shared/npc-role-editor/documentParsing";
import type {
  NpcRoleEditorComponentReferenceTargetState,
  NpcRoleEditorVariantReferenceState,
  NpcRoleEditorWebviewToExtensionMessage,
} from "../shared/npc-role-editor/messageTypes";
import { isRecord, type NpcParametersJson } from "../shared/npc-role-editor/documentTypes";
import {
  filterNpcRoleReferenceNamesFromPaths,
  getNpcRoleReferenceName,
  matchesNpcRoleReferenceCandidate,
  parseNpcComponentClassFromText,
  parseNpcRoleTypeFromText,
} from "./npcReferenceResolver";
import {
  buildVariantAppearancePreviewContext,
  isVariantReferenceRoleType,
  parseLoadedVariantReferenceDocument,
  type LoadedVariantReferenceDocument,
  type VariantReferenceDocumentLoadResult,
} from "./variantReferenceResolver";

const WORKSPACE_NPC_ROLE_GLOB = "**/Server/NPC/Roles/**/*.json";
const WORKSPACE_NPC_ROLE_EXCLUDE_GLOB = "**/{node_modules,.git,dist,build,.svelte-kit}/**";

type LoadedNpcReferenceDocumentInfo = {
  roleType: string;
  componentClass?: string;
};

export async function resolveNpcAutocompleteValues(
  symbolLookup: Extract<
    NpcRoleEditorWebviewToExtensionMessage,
    { type: "autocompleteRequest" }
  >["symbolLookup"],
  documentUri: vscode.Uri,
): Promise<string[]> {
  if (symbolLookup.indexKind !== "registeredAssets" || symbolLookup.key !== "NPCRole") {
    return getValuesByIndexReference(symbolLookup);
  }

  const requestedRoleTypes = symbolLookup.filter?.npcRoleTypes ?? [];
  const requestedComponentClasses = new Set(symbolLookup.filter?.npcComponentClasses ?? []);
  if (requestedRoleTypes.length === 0 && requestedComponentClasses.size === 0) {
    return getValuesByIndexReference(symbolLookup);
  }

  const candidatePaths = new Set<string>();
  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  if (registeredShard?.indexKind === "registeredAssets") {
    for (const assetName of Object.keys((registeredShard as RegisteredAssetsIndexShard).values)) {
      candidatePaths.add(assetName);
    }
  }

  for (const openDocument of vscode.workspace.textDocuments) {
    if (openDocument.uri.scheme !== "file" || !openDocument.fileName.endsWith(".json")) {
      continue;
    }

    candidatePaths.add(openDocument.uri.fsPath);
  }

  const workspaceRoleUris = await vscode.workspace.findFiles(
    WORKSPACE_NPC_ROLE_GLOB,
    WORKSPACE_NPC_ROLE_EXCLUDE_GLOB,
    5000,
  );
  for (const roleUri of workspaceRoleUris) {
    candidatePaths.add(roleUri.fsPath);
  }

  candidatePaths.add(documentUri.fsPath);

  if (requestedComponentClasses.size === 0) {
    return filterNpcRoleReferenceNamesFromPaths(candidatePaths, requestedRoleTypes);
  }

  const matchedReferenceNames = new Set<string>();
  for (const candidatePath of candidatePaths) {
    const candidateInfo = await loadNpcReferenceDocumentInfo(candidatePath, documentUri);
    if (!candidateInfo) {
      continue;
    }

    if (requestedRoleTypes.length > 0 && !requestedRoleTypes.includes(candidateInfo.roleType)) {
      continue;
    }

    if (
      requestedComponentClasses.size > 0 &&
      (!candidateInfo.componentClass || !requestedComponentClasses.has(candidateInfo.componentClass))
    ) {
      continue;
    }

    matchedReferenceNames.add(getNpcRoleReferenceName(candidatePath));
  }

  if (requestedComponentClasses.size > 0) {
    return [...matchedReferenceNames].sort((left, right) => left.localeCompare(right));
  }

  return filterNpcRoleReferenceNamesFromPaths(matchedReferenceNames, requestedRoleTypes);
}

export async function resolveVariantReferenceState(
  referenceName: string,
  documentUri: vscode.Uri,
): Promise<NpcRoleEditorVariantReferenceState> {
  const trimmedReferenceName = referenceName.trim();
  if (!trimmedReferenceName) {
    return { status: "none" };
  }

  const currentDocumentReferenceName = getNpcRoleReferenceName(documentUri.fsPath);
  if (trimmedReferenceName === currentDocumentReferenceName) {
    return {
      status: "error",
      referenceName: trimmedReferenceName,
      message: "Variants cannot reference themselves.",
    };
  }

  const loadReferenceDocument = createVariantReferenceDocumentLoader(documentUri);
  const loadedReference = await loadReferenceDocument(trimmedReferenceName);
  if (loadedReference.status === "missing") {
    return {
      status: "missing",
      referenceName: trimmedReferenceName,
    };
  }

  if (loadedReference.status === "error") {
    return {
      status: "error",
      referenceName: trimmedReferenceName,
      message: loadedReference.message,
    };
  }

  const previewContext = await buildVariantAppearancePreviewContext({
    referenceName: trimmedReferenceName,
    currentDocumentReferenceName,
    loadReferenceDocument,
  });

  return {
    status: "loaded",
    referenceName: trimmedReferenceName,
    resolvedPath: loadedReference.reference.resolvedPath,
    text: loadedReference.reference.text,
    appearanceValue: previewContext?.appearanceValue,
    effectiveParameters: previewContext?.effectiveParameters,
  };
}

export async function resolveComponentReferenceTargetState(
  componentClass: string,
  referenceName: string,
  documentUri: vscode.Uri,
): Promise<NpcRoleEditorComponentReferenceTargetState> {
  const loadedReference = await loadComponentReferenceDocument(referenceName, componentClass, documentUri);
  if (loadedReference.status === "missing") {
    return {
      status: "missing",
      componentClass,
      referenceName,
    };
  }

  if (loadedReference.status === "error") {
    return {
      status: "error",
      componentClass,
      referenceName,
      message: loadedReference.message,
    };
  }

  return {
    status: "loaded",
    componentClass,
    referenceName,
    resolvedPath: loadedReference.resolvedPath,
    parameters: loadedReference.parameters,
  };
}

async function loadComponentReferenceDocument(
  referenceName: string,
  componentClass: string,
  documentUri: vscode.Uri,
):
  Promise<
    | { status: "loaded"; resolvedPath: string; parameters: NpcParametersJson | undefined }
    | { status: "missing" }
    | { status: "error"; message: string }
  > {
  const openDocumentMatch = vscode.workspace.textDocuments.find(candidate => {
    return (
      candidate.uri.scheme === "file" &&
      candidate.uri.fsPath !== documentUri.fsPath &&
      matchesNpcRoleReferenceCandidate(candidate.uri.fsPath, referenceName)
    );
  });

  if (openDocumentMatch) {
    const text = openDocumentMatch.getText();
    if (parseNpcComponentClassFromText(text) === componentClass) {
      return toLoadedComponentReferenceResult(openDocumentMatch.uri.fsPath, text);
    }
  }

  const workspaceMatches = await vscode.workspace.findFiles(
    `**/${referenceName}.json`,
    WORKSPACE_NPC_ROLE_EXCLUDE_GLOB,
    100,
  );

  for (const match of workspaceMatches) {
    if (match.fsPath === documentUri.fsPath) {
      continue;
    }

    if (!matchesNpcRoleReferenceCandidate(match.fsPath, referenceName)) {
      continue;
    }

    try {
      const text = fs.readFileSync(match.fsPath, "utf8");
      if (parseNpcComponentClassFromText(text) !== componentClass) {
        continue;
      }

      return toLoadedComponentReferenceResult(match.fsPath, text);
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  if (registeredShard?.indexKind === "registeredAssets") {
    for (const [assetName, metadata] of Object.entries((registeredShard as RegisteredAssetsIndexShard).values)) {
      if (!matchesNpcRoleReferenceCandidate(assetName, referenceName)) {
        continue;
      }

      if (!metadata.sourcedFromFile) {
        continue;
      }

      try {
        const bytes = await assetCacheRuntime.readAssetBytesByPath(metadata.sourcedFromFile);
        if (!bytes) {
          continue;
        }

        const text = bytes.toString("utf8");
        if (parseNpcComponentClassFromText(text) !== componentClass) {
          continue;
        }

        return toLoadedComponentReferenceResult(metadata.sourcedFromFile, text);
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    status: "missing",
  };
}

function toLoadedComponentReferenceResult(
  resolvedPath: string,
  text: string,
):
  | { status: "loaded"; resolvedPath: string; parameters: NpcParametersJson | undefined }
  | { status: "error"; message: string } {
  const parseResult = parseNpcDocumentText(text);
  if (parseResult.status !== "ready" || parseResult.document.Type !== "Component") {
    return {
      status: "error",
      message: `NPC component reference ${resolvedPath} could not be parsed.`,
    };
  }

  return {
    status: "loaded",
    resolvedPath,
    parameters: isRecord(parseResult.document.Parameters)
      ? (structuredClone(parseResult.document.Parameters) as NpcParametersJson)
      : undefined,
  };
}

async function loadNpcReferenceDocumentInfo(
  referencePath: string,
  documentUri: vscode.Uri,
): Promise<LoadedNpcReferenceDocumentInfo | undefined> {
  const openDocument = vscode.workspace.textDocuments.find(candidate => {
    return candidate.uri.scheme === "file" && candidate.uri.fsPath === referencePath;
  });

  if (openDocument) {
    const text = openDocument.getText();
    const roleType = parseNpcRoleTypeFromText(text);
    if (!roleType) {
      return undefined;
    }

    return {
      roleType,
      componentClass: parseNpcComponentClassFromText(text),
    };
  }

  if (path.isAbsolute(referencePath)) {
    try {
      const text = fs.readFileSync(referencePath, "utf8");
      const roleType = parseNpcRoleTypeFromText(text);
      if (!roleType) {
        return undefined;
      }

      return {
        roleType,
        componentClass: parseNpcComponentClassFromText(text),
      };
    } catch {
      return undefined;
    }
  }

  if (referencePath === documentUri.fsPath) {
    return undefined;
  }

  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  const metadata =
    registeredShard?.indexKind === "registeredAssets"
      ? (registeredShard as RegisteredAssetsIndexShard).values[referencePath]
      : undefined;
  if (!metadata?.sourcedFromFile) {
    return undefined;
  }

  try {
    const bytes = await assetCacheRuntime.readAssetBytesByPath(metadata.sourcedFromFile);
    if (!bytes) {
      return undefined;
    }

    const text = bytes.toString("utf8");
    const roleType = parseNpcRoleTypeFromText(text);
    if (!roleType) {
      return undefined;
    }

    return {
      roleType,
      componentClass: parseNpcComponentClassFromText(text),
    };
  } catch {
    return undefined;
  }
}

function createVariantReferenceDocumentLoader(
  documentUri: vscode.Uri,
): (referenceName: string) => Promise<VariantReferenceDocumentLoadResult> {
  const cache = new Map<string, Promise<VariantReferenceDocumentLoadResult>>();

  return async (referenceName: string) => {
    const trimmedReferenceName = referenceName.trim();
    if (!trimmedReferenceName) {
      return { status: "missing" };
    }

    let cached = cache.get(trimmedReferenceName);
    if (!cached) {
      cached = loadVariantReferenceDocument(trimmedReferenceName, documentUri);
      cache.set(trimmedReferenceName, cached);
    }

    return await cached;
  };
}

async function loadVariantReferenceDocument(
  trimmedReferenceName: string,
  documentUri: vscode.Uri,
): Promise<VariantReferenceDocumentLoadResult> {
  const openDocumentMatch = vscode.workspace.textDocuments.find(candidate => {
    return (
      candidate.uri.scheme === "file" &&
      candidate.uri.fsPath !== documentUri.fsPath &&
      matchesNpcRoleReferenceCandidate(candidate.uri.fsPath, trimmedReferenceName)
    );
  });

  if (openDocumentMatch) {
    const text = openDocumentMatch.getText();
    const parsedType = parseNpcRoleTypeFromText(text);
    if (isVariantReferenceRoleType(parsedType)) {
      return toLoadedVariantReferenceResult({
        referenceName: trimmedReferenceName,
        resolvedPath: openDocumentMatch.uri.fsPath,
        text,
      });
    }
  }

  const workspaceMatches = await vscode.workspace.findFiles(
    `**/${trimmedReferenceName}.json`,
    WORKSPACE_NPC_ROLE_EXCLUDE_GLOB,
    50,
  );

  for (const match of workspaceMatches) {
    if (match.fsPath === documentUri.fsPath) {
      continue;
    }

    if (!matchesNpcRoleReferenceCandidate(match.fsPath, trimmedReferenceName)) {
      continue;
    }

    try {
      const text = fs.readFileSync(match.fsPath, "utf8");
      const parsedType = parseNpcRoleTypeFromText(text);
      if (!isVariantReferenceRoleType(parsedType)) {
        continue;
      }

      return toLoadedVariantReferenceResult({
        referenceName: trimmedReferenceName,
        resolvedPath: match.fsPath,
        text,
      });
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const registeredShard = indexes.get("registeredAssets")?.get("NPCRole");
  if (registeredShard?.indexKind === "registeredAssets") {
    for (const [assetName, metadata] of Object.entries((registeredShard as RegisteredAssetsIndexShard).values)) {
      if (!matchesNpcRoleReferenceCandidate(assetName, trimmedReferenceName)) {
        continue;
      }

      if (!metadata.sourcedFromFile) {
        continue;
      }

      try {
        const bytes = await assetCacheRuntime.readAssetBytesByPath(metadata.sourcedFromFile);
        if (!bytes) {
          continue;
        }

        const text = bytes.toString("utf8");
        const parsedType = parseNpcRoleTypeFromText(text);
        if (!isVariantReferenceRoleType(parsedType)) {
          continue;
        }

        return toLoadedVariantReferenceResult({
          referenceName: trimmedReferenceName,
          resolvedPath: metadata.sourcedFromFile,
          text,
        });
      } catch (error) {
        return {
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  }

  return {
    status: "missing",
  };
}

function toLoadedVariantReferenceResult(
  loadedReference: Omit<LoadedVariantReferenceDocument, "document">,
): VariantReferenceDocumentLoadResult {
  const parsedReference = parseLoadedVariantReferenceDocument(loadedReference);
  if (!parsedReference) {
    return {
      status: "error",
      message: `NPC role reference ${loadedReference.referenceName} could not be parsed.`,
    };
  }

  return {
    status: "loaded",
    reference: parsedReference,
  };
}
