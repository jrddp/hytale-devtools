import {
  type ExtensionToWebviewMessage,
  type WebviewToExtensionMessage,
} from "@shared/node-editor/messageTypes";
import { type NodeEditorWorkspaceContext } from "@shared/node-editor/workspaceTypes";
import { type VSCodeApi, type FlowEdge, type FlowNode } from "src/common";
import { serializeDocument } from "src/node-editor/parsing/serialize/serializeDocument";

export interface WorkspaceState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  rootNodeId: string;
}

class Workspace {
  isInitialized = $state(false);
  context = $state<NodeEditorWorkspaceContext>();
  nodes = $state<FlowNode[]>([]);
  edges = $state<FlowEdge[]>([]);
  rootNodeId = $state<string>();
  vscode = $state<VSCodeApi>();
  sourceVersion = $state(-1);
}

export const workspace = new Workspace();

/** Serializes current document state and applies changes with VSCode.
 * This effectively marks the view as dirty and adds the serialization to the undo tree. */
export function applyDocumentState(reason?: string) {
  const serialized = serializeDocument();

  const payload: Extract<WebviewToExtensionMessage, { type: "apply" }> = {
    type: "apply",
    text: JSON.stringify(serialized, null, "\t"),
    sourceVersion: workspace.sourceVersion,
  };

  workspace.vscode.postMessage(payload);
}
