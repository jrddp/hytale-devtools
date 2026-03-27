import type { ConnectionState } from "@xyflow/system";
import type { FlowEdge } from "src/common";
import { pruneConflictingEdges } from "src/node-editor/utils/nodeUtils.svelte";
import { workspace } from "src/workspace.svelte";

type SourcePendingConnection = { source: string; sourceHandle: string };
type TargetPendingConnection = { target: string; targetHandle: string };

export class ConnectionPreviewController {
  pendingSourceConnection = $state<SourcePendingConnection | undefined>();
  pendingSourceConflictingEdges = $state.raw<FlowEdge[]>([]);
  pendingTargetConnection = $state<TargetPendingConnection | undefined>();
  pendingTargetConflictingEdges = $state.raw<FlowEdge[]>([]);
  private pendingConnectionPreviewKey = $state<string | undefined>();

  clearPendingConnection(
    type: "source" | "target" | "both",
    restoreConflicts: boolean,
  ): boolean {
    let hadConflicts = false;
    this.pendingConnectionPreviewKey = undefined;

    if (type === "source" || type === "both") {
      this.pendingSourceConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(this.pendingSourceConflictingEdges);
      }
      hadConflicts = this.pendingSourceConflictingEdges.length > 0;
      this.pendingSourceConflictingEdges = [];
    }

    if (type === "target" || type === "both") {
      this.pendingTargetConnection = undefined;
      if (restoreConflicts) {
        workspace.addEdges(this.pendingTargetConflictingEdges);
      }
      hadConflicts = hadConflicts || this.pendingTargetConflictingEdges.length > 0;
      this.pendingTargetConflictingEdges = [];
    }

    return hadConflicts;
  }

  handleConnectStart(nodeId: string, handleId: string, handleType: "source" | "target") {
    if (handleType === "source") {
      this.pendingSourceConnection = {
        source: nodeId,
        sourceHandle: handleId,
      };
      this.pendingSourceConflictingEdges = [];
      this.pendingTargetConnection = undefined;
      this.pendingTargetConflictingEdges = [];
      this.pendingConnectionPreviewKey = undefined;
      return;
    }

    this.pendingTargetConnection = {
      target: nodeId,
      targetHandle: handleId,
    };
    this.pendingTargetConflictingEdges = [];
    this.pendingSourceConnection = undefined;
    this.pendingSourceConflictingEdges = [];
    this.pendingConnectionPreviewKey = undefined;
  }

  syncPreview(currentConnection: ConnectionState) {
    if (!currentConnection.inProgress) {
      return;
    }

    const nextPreviewConnection = this.pendingSourceConnection
      ? {
          ...this.pendingSourceConnection,
          target: currentConnection.toNode?.id,
          targetHandle: currentConnection.toHandle?.id,
        }
      : this.pendingTargetConnection
        ? {
            ...this.pendingTargetConnection,
            source: currentConnection.toNode?.id,
            sourceHandle: currentConnection.toHandle?.id,
          }
        : undefined;

    if (!nextPreviewConnection) {
      return;
    }

    const nextPreviewKey = this.pendingSourceConnection
      ? [
          "source",
          nextPreviewConnection.source,
          nextPreviewConnection.sourceHandle,
          nextPreviewConnection.target ?? "",
          nextPreviewConnection.targetHandle ?? "",
        ].join(":")
      : [
          "target",
          nextPreviewConnection.source ?? "",
          nextPreviewConnection.sourceHandle ?? "",
          nextPreviewConnection.target,
          nextPreviewConnection.targetHandle,
        ].join(":");

    if (this.pendingSourceConflictingEdges.length > 0) {
      workspace.addEdges(this.pendingSourceConflictingEdges);
      this.pendingSourceConflictingEdges = [];
    }
    if (this.pendingTargetConflictingEdges.length > 0) {
      workspace.addEdges(this.pendingTargetConflictingEdges);
      this.pendingTargetConflictingEdges = [];
    }

    if (currentConnection.isValid !== true) {
      this.pendingConnectionPreviewKey = undefined;
      return;
    }

    if (nextPreviewKey === this.pendingConnectionPreviewKey) {
      return;
    }

    this.pendingConnectionPreviewKey = nextPreviewKey;
    if (this.pendingSourceConnection) {
      this.pendingSourceConflictingEdges = pruneConflictingEdges(nextPreviewConnection);
      return;
    }

    this.pendingTargetConflictingEdges = pruneConflictingEdges(nextPreviewConnection);
  }
}

export function createConnectionPreviewController() {
  return new ConnectionPreviewController();
}
