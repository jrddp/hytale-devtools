import { type Selection } from "vscode";
import { type IndexReference } from "../indexTypes";
import { type NodeEditorClipboardSelection } from "./clipboardTypes";
import { type NodeEditorWorkspaceContext } from "./workspaceTypes";

export type NodeEditorControlScheme = "mouse" | "trackpad";
export type NodeEditorPlatform = "win" | "linux" | "mac";

export type ActionRequest =
  | { type: "reveal-node"; nodeId?: string; duration?: number } // if nodeId is not provided, does go-to-root
  | { type: "select-all" }
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
  clipboard: NodeEditorClipboardSelection;
  isDevelopment: boolean;
}

export interface NodeEditorDocumentUpdateMessage {
  type: "update";
  text: string;
  version: number;
  documentPath: string;
}

export type ExtensionToWebviewMessage =
  | NodeEditorDocumentUpdateMessage
  | NodeEditorBootstrapPayload
  | { type: "action"; request: ActionRequest; allowEditableTarget?: boolean }
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "autocompletionValues"; fieldId: string; values: string[] }
  | { type: "error"; message: string };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "apply"; text: string; sourceVersion?: number }
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "openRawJson" }
  | { type: "openKeybindings"; query?: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme };
