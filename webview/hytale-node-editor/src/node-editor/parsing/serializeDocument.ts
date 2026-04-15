import { type AssetDocumentShape } from "@shared/node-editor/assetTypes";
import { serializeGraphDocument } from "@shared/node-editor/graphDocument";
import { workspaceStateToGraphDocument } from "@node-editor/node-editor/utils/graphDocument";
import type { NodeEditorSession, WorkspaceState } from "../../workspace.svelte";

export function serializeWorkspaceState(
  state: WorkspaceState,
  workspaceId?: string,
): AssetDocumentShape {
  return serializeGraphDocument(workspaceStateToGraphDocument(state, workspaceId));
}

export function serializeDocument(session: NodeEditorSession): AssetDocumentShape {
  return serializeWorkspaceState(
    {
      nodes: session.nodes,
      edges: session.edges,
      rootNodeId: session.rootNodeId,
    },
    session.context.rootMenuName,
  );
}
