import { type AssetDocumentShape } from "@shared/node-editor/assetTypes";
import { parseAssetDocumentToGraphDocument } from "@shared/node-editor/graphDocument";
import { type NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { workspace } from "src/workspace.svelte";
import { type WorkspaceState } from "../../workspace.svelte";
import { graphDocumentToWorkspaceState } from "../utils/graphDocument";

export function parseDocumentText(
  text: string,
  workspaceContext: NodeEditorWorkspaceContext = workspace.context,
): WorkspaceState {
  return parseDocument(JSON.parse(text) as AssetDocumentShape, workspaceContext);
}

export function parseDocument(
  documentRoot: AssetDocumentShape,
  workspaceContext: NodeEditorWorkspaceContext = workspace.context,
): WorkspaceState {
  if (!workspaceContext) {
    throw new Error(
      "Workspace context was not set before parsing document text. This should not happen.",
    );
  }

  return graphDocumentToWorkspaceState(
    parseAssetDocumentToGraphDocument(documentRoot, workspaceContext),
  );
}
