import type { NodeEditorGraphDocument, NodeEditorGraphEdit } from "@shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { applyNodeEditorGraphEdit } from "@shared/node-editor/graphEditUtils";
import { cloneJsonLike } from "@shared/jsonClone";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";
import {
  applyGraphEditToWorkspaceState,
  graphEditRequiresDocumentRefresh,
} from "./graphDocument";
import { syncSessionFromGraphDocument } from "./sessionSync";

type ReconcileSessionWithGraphUpdateOptions = {
  session: NodeEditorSession;
  workspaceContext: NodeEditorWorkspaceContext;
  getFallbackGraphDocument: () => NodeEditorGraphDocument;
  version: number;
  acknowledgedClientEditId?: number;
  appliedEdit?: NodeEditorGraphEdit;
  shouldQueueInitialFitView?: boolean;
};

export function reconcileSessionWithGraphUpdate({
  session,
  workspaceContext,
  getFallbackGraphDocument,
  version,
  acknowledgedClientEditId,
  appliedEdit,
  shouldQueueInitialFitView = false,
}: ReconcileSessionWithGraphUpdateOptions): boolean {
  if (
    typeof acknowledgedClientEditId === "number" &&
    acknowledgedClientEditId === session.pendingLocalEditId
  ) {
    session.sourceVersion = version;
    session.committedGraphDocument =
      session.committedGraphDocument
        ? cloneJsonLike(session.committedGraphDocument)
        : getFallbackGraphDocument();
    session.pendingLocalEditId = undefined;
    return false;
  }

  if (version === session.sourceVersion) {
    return false;
  }

  if (appliedEdit && applyIncomingGraphEditToSession(session, appliedEdit)) {
    session.sourceVersion = version;
    const nextCommittedGraphDocument = session.committedGraphDocument
      ? cloneJsonLike(session.committedGraphDocument)
      : getFallbackGraphDocument();
    applyNodeEditorGraphEdit(nextCommittedGraphDocument, cloneJsonLike(appliedEdit));
    session.committedGraphDocument = nextCommittedGraphDocument;
    session.pendingLocalEditId = undefined;
    return false;
  }

  const fallbackGraphDocument = getFallbackGraphDocument();
  syncSessionFromGraphDocument({
    session,
    workspaceContext,
    graphDocument: fallbackGraphDocument,
    sourceVersion: version,
    shouldQueueInitialFitView,
  });
  return true;
}

export function applyIncomingGraphEditToSession(
  session: NodeEditorSession,
  edit: NodeEditorGraphEdit,
): boolean {
  const nextState = applyGraphEditToWorkspaceState(
    {
      nodes: session.nodes,
      edges: session.edges,
      rootNodeId: session.rootNodeId,
    },
    edit,
  );

  session.nodes = nextState.nodes;
  session.edges = nextState.edges;
  session.rootNodeId = nextState.rootNodeId;
  if (edit.kind === "element-list-changed") {
    session.resetMeasurementTracking(nextState.nodes);
  }
  if (graphEditRequiresDocumentRefresh(edit)) {
    session.actionRequests.push({ type: "document-refresh" });
  }
  return true;
}
