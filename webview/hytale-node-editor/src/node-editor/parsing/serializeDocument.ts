import { type AssetDocumentShape } from "@shared/node-editor/assetTypes";
import { serializeGraphDocument } from "@shared/node-editor/graphDocument";
import { workspaceStateToGraphDocument } from "src/node-editor/utils/graphDocument";
import { workspace } from "src/workspace.svelte";
import type { WorkspaceState } from "../../workspace.svelte";

export function serializeWorkspaceState(
  state: WorkspaceState,
  workspaceId?: string,
): AssetDocumentShape {
  return serializeGraphDocument(workspaceStateToGraphDocument(state, workspaceId));
}

export function serializeDocument(): AssetDocumentShape {
  return serializeWorkspaceState(
    {
      nodes: workspace.nodes,
      edges: workspace.edges,
      rootNodeId: workspace.rootNodeId,
    },
    workspace.context.rootMenuName,
  );
}
