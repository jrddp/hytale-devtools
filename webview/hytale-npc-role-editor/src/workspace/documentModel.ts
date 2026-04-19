import type { Workspace } from "../workspace.svelte";
import type { NpcRoleJson } from "../parsing/documentTypes";
import type { NpcPropertyField, NpcPropertyState } from "../propertyModel";
import { buildNpcPropertyState, serializeNpcPropertyState } from "../propertyModel";

export function applyWorkspacePropertyState(workspace: Workspace, state: NpcPropertyState) {
  workspace.roleType = state.roleType;
  workspace.componentClass = state.componentClass;
  workspace.propertySections = state.sections;
  workspace.preservedTopLevelFields = state.preservedTopLevelFields;
  workspace.topLevelKeyOrder = [...state.topLevelKeyOrder];
}

export function rebuildWorkspacePropertyStateFromParsedDocument(
  workspace: Workspace,
  document: NpcRoleJson,
  topLevelKeyOrder: string[],
  variantReferenceParameters: NpcPropertyField[] = [],
) {
  const propertyState = buildNpcPropertyState({
    document,
    topLevelKeyOrder,
    descriptors: workspace.descriptors,
    variantReferenceParameters,
  });
  applyWorkspacePropertyState(workspace, propertyState);
}

export function rebuildWorkspacePropertyStateFromCurrentState(
  workspace: Workspace,
  variantReferenceParameters: NpcPropertyField[] = [],
) {
  const document = serializeWorkspaceDocument(workspace);
  if (!document) {
    return false;
  }

  rebuildWorkspacePropertyStateFromParsedDocument(
    workspace,
    document,
    workspace.topLevelKeyOrder,
    variantReferenceParameters,
  );
  workspace.documentParseError = null;
  return true;
}

export function serializeWorkspaceDocument(workspace: Workspace): NpcRoleJson | null {
  if (!workspace.roleType) {
    return null;
  }

  return serializeNpcPropertyState({
    roleType: workspace.roleType,
    componentClass: workspace.componentClass,
    sections: workspace.propertySections,
    preservedTopLevelFields: workspace.preservedTopLevelFields,
    topLevelKeyOrder: workspace.topLevelKeyOrder,
  });
}
