import type {
  NpcDiscoveredStateInfo,
  NpcStateAutocompleteKind,
} from "@shared/npc-role-editor/stateAutocomplete";
import type { NpcDescriptorDocument } from "@shared/npc-role-editor/descriptorTypes";
import type { NpcRoleType } from "./parsing/documentTypes";
import type { NpcRoleEditorGraphUpdateMessage } from "@shared/npc-role-editor/messageTypes";
import type { NodeEditorGraphDocument } from "@shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { reconcileSessionWithGraphUpdate } from "@node-editor/node-editor/utils/documentUpdates";
import { syncSessionFromGraphDocument } from "@node-editor/node-editor/utils/sessionSync";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";
import {
  hydrateComponentReferenceNodes,
  overrideNodeFieldAutocomplete,
} from "./componentReferenceNodeHydration";

export function hydrateNpcGraphSessionNodes({
  session,
  descriptors,
  discoveredStateInfo,
  appearanceAnimationIds,
  roleType,
}: {
  session: NodeEditorSession;
  descriptors: NpcDescriptorDocument;
  discoveredStateInfo: NpcDiscoveredStateInfo;
  appearanceAnimationIds: string[];
  roleType: NpcRoleType | null;
}): void {
  if (!session.isInitialized) {
    return;
  }

  const autocompleteHydratedNodes = hydrateNpcNodeStateAutocomplete({
    nodes: session.nodes,
    discoveredStateInfo,
    appearanceAnimationIds,
    roleType,
  });
  const hydratedNodes = hydrateComponentReferenceNodes({
    nodes: autocompleteHydratedNodes,
    descriptors,
    discoveredStateInfo,
  });
  if (hydratedNodes !== session.nodes) {
    session.nodes = hydratedNodes;
  }
}

export function resolveFocusedNodePreviewOverride(
  nodes: NodeEditorSession["nodes"],
): string | null {
  const selectedNodes = nodes.filter(node => node.selected);
  if (selectedNodes.length !== 1) {
    return null;
  }

  const [selectedNode] = selectedNodes;
  if (!selectedNode || selectedNode.type !== "datanode") {
    return null;
  }

  for (const field of Object.values(selectedNode.data.fieldsBySchemaKey)) {
    if (field.previewFeatureKind !== "animation" || typeof field.value !== "string") {
      continue;
    }

    const animationSetId = field.value.trim();
    if (animationSetId.length > 0) {
      return animationSetId;
    }
  }

  return null;
}

function hydrateNpcNodeStateAutocomplete({
  nodes,
  discoveredStateInfo,
  appearanceAnimationIds,
  roleType,
}: {
  nodes: NodeEditorSession["nodes"];
  discoveredStateInfo: NpcDiscoveredStateInfo;
  appearanceAnimationIds: string[];
  roleType: NpcRoleType | null;
}) {
  let didChange = false;

  const nextNodes = nodes.map(node => {
    if (node.type !== "datanode") {
      return node;
    }

    let nextFieldsBySchemaKey = node.data.fieldsBySchemaKey;
    let didNodeChange = false;

    for (const [schemaKey, field] of Object.entries(node.data.fieldsBySchemaKey)) {
      const autocompleteKind = resolveNodeFieldStateAutocompleteKind(
        node.data.templateId,
        schemaKey,
        field.stateAutocompleteKind,
        roleType,
      );
      const animationAutocompleteKind = field.animationAutocompleteKind;
      if (
        autocompleteKind === undefined &&
        field.stateAutocompleteKind === undefined &&
        animationAutocompleteKind === undefined
      ) {
        continue;
      }
      const nextField = overrideNodeFieldAutocomplete(
        field,
        autocompleteKind,
        discoveredStateInfo,
        animationAutocompleteKind,
        appearanceAnimationIds,
      );
      if (nextField === field) {
        continue;
      }
      if (!didNodeChange) {
        nextFieldsBySchemaKey = { ...node.data.fieldsBySchemaKey };
        didNodeChange = true;
      }
      nextFieldsBySchemaKey[schemaKey] = nextField;
    }

    if (!didNodeChange) {
      return node;
    }

    didChange = true;
    return {
      ...node,
      data: {
        ...node.data,
        fieldsBySchemaKey: nextFieldsBySchemaKey,
      },
    };
  });

  return didChange ? nextNodes : nodes;
}

function resolveNodeFieldStateAutocompleteKind(
  templateId: string,
  schemaKey: string,
  baseKind: NpcStateAutocompleteKind | undefined,
  roleType: NpcRoleType | null,
): NpcStateAutocompleteKind | undefined {
  if (schemaKey !== "State") {
    return baseKind;
  }

  if (templateId === "Action.ParentState") {
    return roleType === "Component" ? "component-parent-alias" : undefined;
  }

  if (templateId === "Action.State" || templateId === "Sensor.State") {
    return roleType === "Component" ? "component-local" : "role-full";
  }

  return baseKind;
}

export function applyNpcGraphUpdateToSession({
  session,
  workspaceContext,
  graphUpdate,
  getFallbackGraphDocument,
  shouldQueueInitialFitView,
}: {
  session: NodeEditorSession;
  workspaceContext: NodeEditorWorkspaceContext;
  graphUpdate: NpcRoleEditorGraphUpdateMessage;
  getFallbackGraphDocument: () => NodeEditorGraphDocument;
  shouldQueueInitialFitView: boolean;
}): boolean {
  return reconcileSessionWithGraphUpdate({
    session,
    workspaceContext,
    getFallbackGraphDocument,
    version: graphUpdate.version,
    acknowledgedClientEditId: graphUpdate.acknowledgedClientEditId,
    appliedEdit: graphUpdate.appliedEdit,
    shouldQueueInitialFitView,
  });
}

export function syncNpcGraphSessionFromDocument({
  session,
  workspaceContext,
  fieldPath,
  documentText,
  documentVersion,
  lastSyncedGraphFieldPath,
  getFallbackGraphDocument,
  shouldQueueInitialFitView,
}: {
  session: NodeEditorSession;
  workspaceContext: NodeEditorWorkspaceContext;
  fieldPath: string;
  documentText: string | null;
  documentVersion: number;
  lastSyncedGraphFieldPath: string | null;
  getFallbackGraphDocument: (text: string | null) => NodeEditorGraphDocument;
  shouldQueueInitialFitView: boolean;
}): boolean {
  const isSameGraphField = lastSyncedGraphFieldPath === fieldPath;

  if (!isSameGraphField) {
    syncSessionFromGraphDocument({
      session,
      workspaceContext,
      graphDocument: getFallbackGraphDocument(documentText),
      sourceVersion: documentVersion,
      shouldQueueInitialFitView,
    });
    return true;
  }

  return reconcileSessionWithGraphUpdate({
    session,
    workspaceContext,
    getFallbackGraphDocument: () => getFallbackGraphDocument(documentText),
    version: documentVersion,
    shouldQueueInitialFitView,
  });
}
