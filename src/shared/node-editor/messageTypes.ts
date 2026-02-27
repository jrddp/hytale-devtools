import { type Selection } from "vscode";
import type { ResolveSchemaDefinitionResult } from "../companion/types";
import { type NodeEditorWorkspaceContext } from "./workspaceTypes";

export type NodeEditorControlScheme = "mouse" | "trackpad";

export interface NodeEditorBootstrapPayload {
  type: "bootstrap";
  workspaceContext?: NodeEditorWorkspaceContext;
  controlScheme: NodeEditorControlScheme;
}

export interface NodeEditorDocumentUpdateMessage {
  type: "update";
  text: string;
  version: number;
  documentPath: string;
}

export interface NodeEditorHydrateNodeSchemasResultMessage {
  type: "hydrateNodeSchemasResult";
  requestId: number;
  results?: ResolveSchemaDefinitionResult[];
}

export interface NodeEditorRevealSelectionMessage {
  type: "revealSelection";
  selection: Selection;
}

export type ExtensionToWebviewMessage =
  | NodeEditorDocumentUpdateMessage
  | NodeEditorBootstrapPayload
  | NodeEditorHydrateNodeSchemasResultMessage
  | NodeEditorRevealSelectionMessage
  | { type: "triggerQuickAction"; commandId: string; actionId?: string }
  | { type: "error"; message: string };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "apply"; text: string; sourceVersion?: number }
  | { type: "openRawJson" }
  | { type: "openKeybindings"; query?: string }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme };
