import { createEmptyNpcDiscoveredStateInfo } from "@shared/npc-role-editor/stateAutocomplete";
import type { Workspace } from "../workspace.svelte";
import type { NpcRoleEditorApplyMessage } from "@shared/npc-role-editor/messageTypes";
import type { NpcRoleJson } from "../parsing/documentTypes";
import type { NpcPropertyField } from "../propertyModel";
import { parseNpcDocumentText } from "../parsing/parseNpcDocument";
import { serializeNpcDocumentText } from "../parsing/serializeNpcDocument";
import { emptyParameterUsageIndex, recomputeWorkspaceDerivedState } from "./derivedState";
import {
  rebuildWorkspacePropertyStateFromParsedDocument,
  serializeWorkspaceDocument,
} from "./documentModel";

const DEFAULT_EDIT_LABEL = "Edit NPC Role";

export function setWorkspaceDocument(
  workspace: Workspace,
  {
    documentPath,
    text,
    version,
  }: {
    documentPath: string;
    text: string;
    version: number;
  },
) {
  workspace.documentPath = documentPath;
  workspace.documentVersion = version;
  if (workspace.documentText === text) {
    return false;
  }

  workspace.documentText = text;
  return true;
}

export function setWorkspaceDeferredDocument(
  workspace: Workspace,
  {
    documentPath,
    text,
    version,
  }: {
    documentPath: string;
    text: string;
    version: number;
  },
) {
  const changed = setWorkspaceDocument(workspace, {
    documentPath,
    text,
    version,
  });
  if (!changed) {
    return false;
  }

  workspace.hasDeferredDocumentRefresh = true;
  return true;
}

export function flushWorkspaceDeferredDocumentState(workspace: Workspace) {
  if (
    !workspace.hasDeferredDocumentRefresh ||
    workspace.parsedDocumentVersion === workspace.documentVersion
  ) {
    workspace.hasDeferredDocumentRefresh = false;
    return false;
  }

  return true;
}

export function applyWorkspaceDocumentState(workspace: Workspace, label = DEFAULT_EDIT_LABEL) {
  const document = serializeWorkspaceDocument(workspace);
  if (!document) {
    return;
  }

  const text = serializeNpcDocumentText(document, workspace.topLevelKeyOrder);
  workspace.documentText = text;
  const payload: NpcRoleEditorApplyMessage = {
    type: "apply",
    text,
    sourceVersion: workspace.documentVersion,
    label,
  };
  workspace.vscode.postMessage(payload);
}

export function reparseWorkspaceDocument(
  workspace: Workspace,
  resolveVariantReferenceParameters: (document: NpcRoleJson) => NpcPropertyField[] = () => [],
): NpcRoleJson | null {
  if (workspace.documentText === null) {
    clearWorkspaceDocumentState(workspace);
    return null;
  }

  const result = parseNpcDocumentText(workspace.documentText);
  if (result.status === "error") {
    clearWorkspaceDocumentState(workspace);
    workspace.documentParseError = result.error;
    return null;
  }

  rebuildWorkspacePropertyStateFromParsedDocument(
    workspace,
    result.document,
    result.topLevelKeyOrder,
    resolveVariantReferenceParameters(result.document),
  );
  workspace.documentParseError = null;
  workspace.parsedDocumentVersion = workspace.documentVersion;
  workspace.hasDeferredDocumentRefresh = false;
  recomputeWorkspaceDerivedState(workspace);
  return result.document;
}

export function clearWorkspaceDocumentState(workspace: Workspace) {
  workspace.roleType = null;
  workspace.componentClass = null;
  workspace.propertySections = [];
  workspace.preservedTopLevelFields = {};
  workspace.topLevelKeyOrder = [];
  workspace.parsedDocumentVersion = workspace.documentVersion;
  workspace.hasDeferredDocumentRefresh = false;
  workspace.variantReferenceState = { status: "none" };
  workspace.variantReferenceParameters = [];
  workspace.parameterUsageIndex = emptyParameterUsageIndex();
  workspace.issues = [];
  workspace.issuesByFieldPath = new Map();
  workspace.discoveredStateInfo = createEmptyNpcDiscoveredStateInfo();
  workspace.clearAppearancePreviewState();
  workspace.documentParseError = null;
}
