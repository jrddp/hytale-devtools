import { type AssetDocumentShape } from "@shared/node-editor/assetTypes";
import { serializeGraphDocument } from "@shared/node-editor/graphDocument";
import { workspaceStateToGraphDocument } from "src/node-editor/utils/graphDocument";
import { workspace } from "src/workspace.svelte";

export function serializeDocument(): AssetDocumentShape {
  return serializeGraphDocument(
    workspaceStateToGraphDocument(
      {
        nodes: workspace.nodes,
        edges: workspace.edges,
        rootNodeId: workspace.rootNodeId,
      },
      workspace.context.rootMenuName,
    ),
  );
}
