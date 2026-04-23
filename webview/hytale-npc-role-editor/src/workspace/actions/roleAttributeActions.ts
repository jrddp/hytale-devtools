import type { Workspace } from "../../workspace.svelte";
import type { NpcPropertyField } from "../../propertyModel";
import { getAvailableRoleAttributeFields } from "../../roleAttributeFields";
import { recomputeWorkspaceDerivedState } from "../derivedState";
import { serializeWorkspaceDocument } from "../documentModel";
import { findWorkspaceSection } from "../fieldLookup";

export function addWorkspaceRoleAttribute(
  workspace: Workspace,
  attributeKey: string,
): boolean {
  const section = findWorkspaceSection(workspace.propertySections, "roleAttributes");
  const nextField = getAvailableWorkspaceRoleAttributeFields(workspace).find(
    field => field.key === attributeKey,
  );
  if (!section || !nextField) {
    return false;
  }

  section.fields = [...section.fields, nextField];
  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState(`Add ${nextField.label}`);
  return true;
}

export function getAvailableWorkspaceRoleAttributeFields(
  workspace: Workspace,
): NpcPropertyField[] {
  const section = findWorkspaceSection(workspace.propertySections, "roleAttributes");
  const document = serializeWorkspaceDocument(workspace);

  return getAvailableRoleAttributeFields({
    roleType: workspace.roleType,
    descriptors: workspace.descriptors,
    parameters: document?.Parameters,
    includedKeys: (section?.fields ?? []).map(field => field.key),
  });
}
