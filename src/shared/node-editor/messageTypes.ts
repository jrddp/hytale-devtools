import { type Selection } from "vscode";
import type { ResolveSchemaDefinitionResult } from "../companion/types";
import { type NodeEditorWorkspaceContext } from "./workspaceTypes";

export type NodeEditorControlScheme = "mouse" | "trackpad";
export type NodeEditorPlatform = "win" | "linux" | "mac";

export type ActionRequest =
  | { type: "reveal-node"; nodeId?: string } // if nodeId is not provided, does go-to-root
  | { type: "fit-view"; maxDistanceToRoot?: number; duration?: number }
  | { type: "search-nodes"; withQuery?: string }
  | { type: "auto-position-nodes"; seedNodeIds?: string[] }
  | { type: "view-raw-json" }
  | { type: "help-and-hotkeys" }
  | { type: "customize-keybinds"; query?: string }
  | { type: "reveal-selection"; selection: Selection }
  | { type: "document-refresh" }; // recalculates groups, resets pending connections, etc

export type ActionType = ActionRequest["type"];

export interface NodeEditorBootstrapPayload {
  type: "bootstrap";
  workspaceContext?: NodeEditorWorkspaceContext;
  controlScheme: NodeEditorControlScheme;
  platform: NodeEditorPlatform;
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
export type ExtensionToWebviewMessage =
  | NodeEditorDocumentUpdateMessage
  | NodeEditorBootstrapPayload
  | { type: "action"; request: ActionRequest }
  | { type: "error"; message: string };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "apply"; text: string; sourceVersion?: number }
  | { type: "openRawJson" }
  | { type: "openKeybindings"; query?: string }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme };
