import type { NodeEditorGraphDocument } from "@shared/node-editor/graphTypes";
import type { NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { graphDocumentToWorkspaceState, workspaceStateNeedsAutoLayout } from "./graphDocument";
import type { NodeEditorSession } from "@node-editor/workspace.svelte";

type SyncSessionGraphDocumentOptions = {
  session: NodeEditorSession;
  workspaceContext: NodeEditorWorkspaceContext;
  graphDocument: NodeEditorGraphDocument;
  sourceVersion: number;
  shouldQueueInitialFitView?: boolean;
};

export function syncSessionFromGraphDocument({
  session,
  workspaceContext,
  graphDocument,
  sourceVersion,
  shouldQueueInitialFitView = false,
}: SyncSessionGraphDocumentOptions): void {
  const { nodes, edges, rootNodeId } = graphDocumentToWorkspaceState(graphDocument);

  session.context = workspaceContext;
  session.nodes = nodes;
  session.edges = edges;
  session.rootNodeId = rootNodeId;
  session.resetMeasurementTracking(nodes, true);
  session.sourceVersion = sourceVersion;
  session.committedGraphDocument = graphDocument;
  session.pendingLocalEditId = undefined;
  session.actionRequests = [];
  session.isInitialized = true;

  if (shouldQueueInitialFitView) {
    session.actionRequests.push({
      type: "fit-view",
      duration: 0,
      maxDistanceToRoot: 10_000,
    });
  }
  if (workspaceStateNeedsAutoLayout(nodes)) {
    session.actionRequests.push({ type: "auto-position-nodes" });
  }
}
