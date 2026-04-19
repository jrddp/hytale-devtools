import type { Workspace } from "../../workspace.svelte";
import type { NpcFieldValue } from "../../propertyModel";
import {
  addStateTransition,
  addStateTransitionEdge,
  isStateTransitionsField,
  removeStateTransition,
  removeStateTransitionEdge,
  reorderStateTransitionEdges,
  reorderStateTransitions,
  updateStateTransitionComment,
  updateStateTransitionEdgeEnabled,
  updateStateTransitionEdgePriority,
  updateStateTransitionEdgeStates,
  updateStateTransitionEnabled,
} from "../../propertyModel";
import { recomputeWorkspaceDerivedState } from "../derivedState";
import { findWorkspaceField } from "../fieldLookup";

export function addWorkspaceStateTransition(workspace: Workspace, fieldPath: string) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const added = addStateTransition(field, workspace.descriptors);
  if (!added) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function removeWorkspaceStateTransition(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const removed = removeStateTransition(field, transitionId);
  if (!removed) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function reorderWorkspaceStateTransitions(
  workspace: Workspace,
  fieldPath: string,
  transitionIds: string[],
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const reordered = reorderStateTransitions(field, transitionIds);
  if (!reordered) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStateTransitionComment(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  comment: string,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const updated = updateStateTransitionComment(field, transitionId, comment);
  if (!updated) {
    return false;
  }

  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStateTransitionEnabled(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  value: NpcFieldValue | undefined,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const updated = updateStateTransitionEnabled(field, transitionId, value);
  if (!updated) {
    return false;
  }

  workspace.applyDocumentState();
  return true;
}

export function addWorkspaceStateTransitionEdge(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const added = addStateTransitionEdge(field, transitionId);
  if (!added) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function removeWorkspaceStateTransitionEdge(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  edgeId: string,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const removed = removeStateTransitionEdge(field, transitionId, edgeId);
  if (!removed) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function reorderWorkspaceStateTransitionEdges(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  edgeIds: string[],
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const reordered = reorderStateTransitionEdges(field, transitionId, edgeIds);
  if (!reordered) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStateTransitionEdgeStates(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  edgeId: string,
  direction: "from" | "to",
  values: string[],
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const updated = updateStateTransitionEdgeStates(field, transitionId, edgeId, direction, values);
  if (!updated) {
    return false;
  }

  recomputeWorkspaceDerivedState(workspace);
  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStateTransitionEdgePriority(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  edgeId: string,
  priority: number | undefined,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const updated = updateStateTransitionEdgePriority(field, transitionId, edgeId, priority);
  if (!updated) {
    return false;
  }

  workspace.applyDocumentState();
  return true;
}

export function updateWorkspaceStateTransitionEdgeEnabled(
  workspace: Workspace,
  fieldPath: string,
  transitionId: string,
  edgeId: string,
  value: NpcFieldValue | undefined,
) {
  const field = findWorkspaceField(workspace.propertySections, fieldPath);
  if (!field || !isStateTransitionsField(field)) {
    return false;
  }

  const updated = updateStateTransitionEdgeEnabled(field, transitionId, edgeId, value);
  if (!updated) {
    return false;
  }

  workspace.applyDocumentState();
  return true;
}
