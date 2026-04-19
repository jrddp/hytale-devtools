import type { Workspace } from "../workspace.svelte";
import type { NpcRoleEditorVariantReferenceState } from "@shared/npc-role-editor/messageTypes";
import type { NpcParameterValueJson, NpcRoleJson } from "../parsing/documentTypes";
import type { NpcPropertyField } from "../propertyModel";
import { buildNpcPropertyState } from "../propertyModel";
import { parseNpcDocumentText } from "../parsing/parseNpcDocument";
import { isStandardParameterField } from "../parsing/parameterMutations";
import { applyNpcDerivedPropertyMetadata } from "../derivedPropertyMetadata";
import { recomputeWorkspaceDerivedState } from "./derivedState";
import { rebuildWorkspacePropertyStateFromCurrentState, serializeWorkspaceDocument } from "./documentModel";

export type ResolvedVariantReferencePreviewContext = {
  appearanceValue?: NpcParameterValueJson;
  effectiveParameters?: Record<string, NpcParameterValueJson>;
};

export function setWorkspaceVariantReferenceState(
  workspace: Workspace,
  reference: NpcRoleEditorVariantReferenceState,
) {
  const currentReferenceName = getCurrentWorkspaceVariantReferenceName(workspace);
  if (reference.referenceName && reference.referenceName !== currentReferenceName) {
    return;
  }

  let nextState = reference;
  let nextParameters: NpcPropertyField[] = [];

  if (reference.status === "loaded" && typeof reference.text === "string") {
    const result = parseNpcDocumentText(reference.text);
    if (result.status === "ready") {
      const parentState = buildNpcPropertyState({
        document: result.document,
        topLevelKeyOrder: result.topLevelKeyOrder,
        descriptors: workspace.descriptors,
      });
      applyNpcDerivedPropertyMetadata({
        sections: parentState.sections,
        document: result.document,
        topLevelKeyOrder: result.topLevelKeyOrder,
        descriptors: workspace.descriptors,
      });
      nextParameters = parentState.sections
        .find(section => section.id === "parameters")
        ?.fields.filter(isStandardParameterField)
        .map(field => structuredClone(field)) ?? [];
    } else {
      nextState = {
        status: "error",
        referenceName: reference.referenceName,
        resolvedPath: reference.resolvedPath,
        message: result.error,
      };
    }
  }

  workspace.variantReferenceState = nextState;
  workspace.variantReferenceParameters = nextParameters;
  const currentDocument = serializeWorkspaceDocument(workspace);
  const variantReferenceParameters = currentDocument
    ? getResolvedVariantReferenceParametersForDocument(workspace, currentDocument)
    : [];
  rebuildWorkspacePropertyStateFromCurrentState(workspace, variantReferenceParameters);
  recomputeWorkspaceDerivedState(workspace);
}

export function getResolvedVariantReferenceParametersForDocument(
  workspace: Workspace,
  document: NpcRoleJson,
): NpcPropertyField[] {
  if (document.Type !== "Variant" || typeof document.Reference !== "string") {
    return [];
  }

  const trimmedReference = document.Reference.trim();
  if (
    !trimmedReference ||
    workspace.variantReferenceState.status !== "loaded" ||
    workspace.variantReferenceState.referenceName !== trimmedReference
  ) {
    return [];
  }

  return workspace.variantReferenceParameters;
}

export function getResolvedVariantReferencePreviewContext(
  workspace: Workspace,
): ResolvedVariantReferencePreviewContext | null {
  const currentReferenceName = getCurrentWorkspaceVariantReferenceName(workspace);
  if (
    !currentReferenceName ||
    workspace.variantReferenceState.status !== "loaded" ||
    workspace.variantReferenceState.referenceName !== currentReferenceName
  ) {
    return null;
  }

  return {
    appearanceValue: workspace.variantReferenceState.appearanceValue,
    effectiveParameters: workspace.variantReferenceState.effectiveParameters,
  };
}

export function refreshWorkspaceVariantReferenceResolution(
  workspace: Workspace,
  document: NpcRoleJson,
) {
  if (document.Type !== "Variant") {
    workspace.variantReferenceState = { status: "none" };
    workspace.variantReferenceParameters = [];
    return;
  }

  if (typeof document.Reference !== "string") {
    workspace.variantReferenceState =
      document.Reference === undefined
        ? { status: "none" }
        : {
            status: "error",
            message: "Variant reference must be a static role name.",
          };
    workspace.variantReferenceParameters = [];
    return;
  }

  const trimmedReference = document.Reference.trim();
  if (!trimmedReference) {
    workspace.variantReferenceState = { status: "none" };
    workspace.variantReferenceParameters = [];
    return;
  }

  if (
    workspace.variantReferenceState.referenceName === trimmedReference &&
    ["loading", "loaded", "missing", "error"].includes(workspace.variantReferenceState.status)
  ) {
    return;
  }

  workspace.variantReferenceState = {
    status: "loading",
    referenceName: trimmedReference,
  };
  workspace.variantReferenceParameters = [];
  workspace.vscode.postMessage({
    type: "resolveVariantReference",
    referenceName: trimmedReference,
  });
}

export function refreshWorkspaceVariantReferenceResolutionFromCurrentState(workspace: Workspace) {
  const document = serializeWorkspaceDocument(workspace);
  if (!document) {
    workspace.variantReferenceState = { status: "none" };
    workspace.variantReferenceParameters = [];
    return;
  }

  refreshWorkspaceVariantReferenceResolution(workspace, document);
  const variantReferenceParameters = getResolvedVariantReferenceParametersForDocument(workspace, document);
  rebuildWorkspacePropertyStateFromCurrentState(workspace, variantReferenceParameters);
  recomputeWorkspaceDerivedState(workspace);
}

export function getCurrentWorkspaceVariantReferenceName(workspace: Workspace): string | undefined {
  const document = serializeWorkspaceDocument(workspace);
  if (document?.Type !== "Variant" || typeof document.Reference !== "string") {
    return undefined;
  }

  const trimmedValue = document.Reference.trim();
  return trimmedValue || undefined;
}
