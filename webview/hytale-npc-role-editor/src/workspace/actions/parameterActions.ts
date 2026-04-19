import type { Workspace } from "../../workspace.svelte";
import type { NpcStandardParameterEditorType } from "../../parsing/parameterEditorTypes";
import type { NpcPropertyField } from "../../propertyModel";
import { createVariantModifyOverrideFieldFromParent } from "../../propertyModel";
import {
  addStandardParameter,
  isStandardParameterField,
  removeStandardParameter,
  renameStandardParameter,
  reorderStandardParameters,
  updateStandardParameterDescription,
  updateStandardParameterEditorType,
} from "../../parsing/parameterMutations";
import { recomputeWorkspaceDerivedState } from "../derivedState";
import { findWorkspaceSection } from "../fieldLookup";

export function addWorkspaceStandardParameter(workspace: Workspace) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return null;
  }

  const nextName = addStandardParameter(section);
  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return nextName;
}

export function renameWorkspaceStandardParameter(
  workspace: Workspace,
  currentName: string,
  nextName: string,
) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return false;
  }

  const renamed = renameStandardParameter(section, currentName, nextName);
  if (!renamed) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStandardParameterDescription(
  workspace: Workspace,
  parameterName: string,
  description: string,
) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return false;
  }

  const updated = updateStandardParameterDescription(section, parameterName, description);
  if (!updated) {
    return false;
  }

  workspace.applyDocumentState();
  return true;
}

export function removeWorkspaceStandardParameter(workspace: Workspace, parameterName: string) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return false;
  }

  const removed = removeStandardParameter(section, parameterName);
  if (!removed) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function reorderWorkspaceStandardParameters(
  workspace: Workspace,
  parameterNames: string[],
) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return false;
  }

  const reordered = reorderStandardParameters(section, parameterNames);
  if (!reordered) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStandardParameterEditorType(
  workspace: Workspace,
  parameterName: string,
  editorType: NpcStandardParameterEditorType,
) {
  const section = findWorkspaceSection(workspace.propertySections, "parameters");
  if (!section) {
    return false;
  }

  const updated = updateStandardParameterEditorType(section, parameterName, editorType);
  if (!updated) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function addWorkspaceVariantModifyOverride(
  workspace: Workspace,
  parameterName: string,
): boolean {
  const modifySection = findWorkspaceSection(workspace.propertySections, "modify");
  const inheritedField = workspace.variantReferenceParameters.find(field => field.key === parameterName);
  if (!modifySection || !inheritedField || inheritedField.preservedData?.Private === true) {
    return false;
  }

  if (modifySection.fields.some(field => field.key === parameterName)) {
    return false;
  }

  const nextField = createVariantModifyOverrideFieldFromParent(inheritedField);
  const firstSpecialModifierIndex = modifySection.fields.findIndex(field => field.key.startsWith("_"));

  if (firstSpecialModifierIndex === -1) {
    modifySection.fields = [...modifySection.fields, nextField];
  } else {
    modifySection.fields = [
      ...modifySection.fields.slice(0, firstSpecialModifierIndex),
      nextField,
      ...modifySection.fields.slice(firstSpecialModifierIndex),
    ];
  }

  const nextKeyOrder = [...(modifySection.keyOrder ?? [])];
  const firstSpecialModifierKeyOrderIndex = nextKeyOrder.findIndex(key => key.startsWith("_"));
  if (firstSpecialModifierKeyOrderIndex === -1) {
    nextKeyOrder.push(parameterName);
  } else {
    nextKeyOrder.splice(firstSpecialModifierKeyOrderIndex, 0, parameterName);
  }
  modifySection.keyOrder = nextKeyOrder;

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function getWorkspaceStandardParameterFields(workspace: Workspace): NpcPropertyField[] {
  return (findWorkspaceSection(workspace.propertySections, "parameters")?.fields ?? []).filter(
    isStandardParameterField,
  );
}

export function getAvailableWorkspaceVariantModifyOverrideFields(
  workspace: Workspace,
): NpcPropertyField[] {
  const modifySection = findWorkspaceSection(workspace.propertySections, "modify");
  const overriddenKeys = new Set(
    (modifySection?.fields ?? [])
      .filter(field => !field.key.startsWith("_"))
      .map(field => field.key),
  );

  return workspace.variantReferenceParameters.filter(
    field => field.preservedData?.Private !== true && !overriddenKeys.has(field.key),
  );
}
