import type { NpcDescriptorDocument } from "@shared/npc-role-editor/descriptorTypes";
import type { NpcRoleEditorGraphUpdateMessage } from "@shared/npc-role-editor/messageTypes";
import type { NodeEditorGraphDocument } from "@shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { reconcileSessionWithGraphUpdate } from "@node-editor/node-editor/utils/documentUpdates";
import { syncSessionFromGraphDocument } from "@node-editor/node-editor/utils/sessionSync";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";
import { hydrateComponentReferenceNodes } from "./componentReferenceNodeHydration";

export function hydrateNpcGraphSessionNodes({
  session,
  descriptors,
  discoveredStates,
}: {
  session: NodeEditorSession;
  descriptors: NpcDescriptorDocument;
  discoveredStates: string[];
}): void {
  if (!session.isInitialized) {
    return;
  }

  const hydratedNodes = hydrateComponentReferenceNodes({
    nodes: session.nodes,
    descriptors,
    discoveredStates,
  });
  if (hydratedNodes !== session.nodes) {
    session.nodes = hydratedNodes;
  }
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
