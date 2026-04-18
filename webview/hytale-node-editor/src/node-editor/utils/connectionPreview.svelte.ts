import type { ConnectionState } from "@xyflow/system";
import {
  collectConflictingEdges,
  type PendingConnection,
} from "@node-editor/node-editor/utils/nodeUtils.svelte";
import type { NodeEditorSession, RemovedFlowEdge } from "@node-editor/workspace.svelte";

type SourcePendingConnection = { source: string; sourceHandle: string };
type TargetPendingConnection = { target: string; targetHandle: string };

export class ConnectionPreviewController {
  constructor(private readonly session: NodeEditorSession) {}

  pendingSourceConnection = $state<SourcePendingConnection | undefined>();
  pendingTargetConnection = $state<TargetPendingConnection | undefined>();
  private previewPrunedEdgesById = $state.raw<Map<string, RemovedFlowEdge>>(new Map());

  get hasPendingConnection(): boolean {
    return this.pendingSourceConnection !== undefined || this.pendingTargetConnection !== undefined;
  }

  beginSourceDrag(source: string, sourceHandle: string) {
    this.cancel();
    this.pendingSourceConnection = {
      source,
      sourceHandle,
    };
    this.pendingTargetConnection = undefined;
    this.syncDesiredPrunedEdges(this.getFixedPendingConnection());
  }

  beginTargetDrag(target: string, targetHandle: string) {
    this.cancel();
    this.pendingTargetConnection = {
      target,
      targetHandle,
    };
    this.pendingSourceConnection = undefined;
    this.syncDesiredPrunedEdges(this.getFixedPendingConnection());
  }

  previewFixedConflicts() {
    this.syncDesiredPrunedEdges(this.getFixedPendingConnection());
  }

  updateHover(currentConnection: ConnectionState) {
    if (!this.hasPendingConnection || !currentConnection.inProgress) {
      return;
    }

    this.syncDesiredPrunedEdges(this.buildPendingConnectionForHover(currentConnection));
  }

  cancel(): boolean {
    const hadConflicts = this.previewPrunedEdgesById.size > 0;
    this.restoreRemovedEdges(Array.from(this.previewPrunedEdgesById.values()));
    this.previewPrunedEdgesById = new Map();
    this.pendingSourceConnection = undefined;
    this.pendingTargetConnection = undefined;
    return hadConflicts;
  }

  commit(): boolean {
    const hadConflicts = this.previewPrunedEdgesById.size > 0;
    this.previewPrunedEdgesById = new Map();
    this.pendingSourceConnection = undefined;
    this.pendingTargetConnection = undefined;
    return hadConflicts;
  }

  private getFixedPendingConnection(): PendingConnection | undefined {
    if (this.pendingSourceConnection) {
      return { ...this.pendingSourceConnection };
    }

    if (this.pendingTargetConnection) {
      return { ...this.pendingTargetConnection };
    }

    return undefined;
  }

  private buildPendingConnectionForHover(currentConnection: ConnectionState): PendingConnection | undefined {
    if (this.pendingSourceConnection) {
      if (
        currentConnection.isValid === true &&
        currentConnection.toNode?.id &&
        currentConnection.toHandle?.id
      ) {
        return {
          ...this.pendingSourceConnection,
          target: currentConnection.toNode.id,
          targetHandle: currentConnection.toHandle.id,
        };
      }

      return { ...this.pendingSourceConnection };
    }

    if (this.pendingTargetConnection) {
      if (
        currentConnection.isValid === true &&
        currentConnection.toNode?.id &&
        currentConnection.toHandle?.id
      ) {
        return {
          source: currentConnection.toNode.id,
          sourceHandle: currentConnection.toHandle.id,
          ...this.pendingTargetConnection,
        };
      }

      return { ...this.pendingTargetConnection };
    }

    return undefined;
  }

  private syncDesiredPrunedEdges(connection: PendingConnection | undefined) {
    const previewPrunedEdges = Array.from(this.previewPrunedEdgesById.values()).map(
      removedEdge => removedEdge.edge,
    );
    const desiredConflictingEdges = connection
      ? collectConflictingEdges(connection, this.session, previewPrunedEdges)
      : [];
    const desiredEdgeIds = new Set(desiredConflictingEdges.map(edge => edge.id));

    if (this.previewPrunedEdgesById.size > 0) {
      const removedIdsToRestore = Array.from(this.previewPrunedEdgesById.keys()).filter(
        edgeId => !desiredEdgeIds.has(edgeId),
      );
      if (removedIdsToRestore.length > 0) {
        this.restoreRemovedEdges(
          removedIdsToRestore.flatMap(edgeId => {
            const removedEdge = this.previewPrunedEdgesById.get(edgeId);
            return removedEdge ? [removedEdge] : [];
          }),
        );

        const nextPrunedEdges = new Map(this.previewPrunedEdgesById);
        for (const removedId of removedIdsToRestore) {
          nextPrunedEdges.delete(removedId);
        }
        this.previewPrunedEdgesById = nextPrunedEdges;
      }
    }

    const edgesToPrune = desiredConflictingEdges.filter(
      edge => !this.previewPrunedEdgesById.has(edge.id),
    );
    if (edgesToPrune.length === 0) {
      return;
    }

    const removedEdges = this.session.removeEdgesByIds(edgesToPrune.map(edge => edge.id));
    if (removedEdges.length === 0) {
      return;
    }

    const nextPrunedEdges = new Map(this.previewPrunedEdgesById);
    for (const removedEdge of removedEdges) {
      nextPrunedEdges.set(removedEdge.edge.id, removedEdge);
    }
    this.previewPrunedEdgesById = nextPrunedEdges;
  }

  private restoreRemovedEdges(removedEdges: RemovedFlowEdge[]) {
    this.session.restoreRemovedEdges(removedEdges);
  }
}

export function createConnectionPreviewController(session: NodeEditorSession) {
  return new ConnectionPreviewController(session);
}
