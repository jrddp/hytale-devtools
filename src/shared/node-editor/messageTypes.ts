import { type Selection } from "vscode";
import { type IndexReference } from "../indexTypes";
import { type NodeEditorClipboardSelection } from "./clipboardTypes";
import {
  type NodeEditorGraphDocument,
  type NodeEditorGraphEdit,
} from "./graphTypes";
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
  graphDocument: NodeEditorGraphDocument;
  version: number;
  documentPath: string;
  acknowledgedClientEditId?: number;
  appliedEdit?: NodeEditorGraphEdit;
}

export type NodeEditorGraphEditMessage =
  | {
      type: "edit";
      kind: "element-list-changed";
      addedNodes: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["addedNodes"];
      removedNodes: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["removedNodes"];
      addedEdges: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["addedEdges"];
      removedEdges: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["removedEdges"];
      beforeRootNodeId?: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["beforeRootNodeId"];
      afterRootNodeId?: Extract<
        NodeEditorGraphEdit,
        { kind: "element-list-changed" }
      >["afterRootNodeId"];
      sourceVersion?: number;
      clientEditId: number;
    }
  | {
      type: "edit";
      kind: "nodes-moved";
      changes: Extract<NodeEditorGraphEdit, { kind: "nodes-moved" }>["changes"];
      sourceVersion?: number;
      clientEditId: number;
    }
  | {
      type: "edit";
      kind: "node-renamed";
      changes: Extract<NodeEditorGraphEdit, { kind: "node-renamed" }>["changes"];
      sourceVersion?: number;
      clientEditId: number;
    }
  | {
      type: "edit";
      kind: "node-resized";
      changes: Extract<NodeEditorGraphEdit, { kind: "node-resized" }>["changes"];
      sourceVersion?: number;
      clientEditId: number;
    }
  | {
      type: "edit";
      kind: "node-properties-updated";
      propertyChanges: Extract<
        NodeEditorGraphEdit,
        { kind: "node-properties-updated" }
      >["propertyChanges"];
      resizeChanges?: Extract<NodeEditorGraphEdit, { kind: "node-properties-updated" }>["resizeChanges"];
      sourceVersion?: number;
      clientEditId: number;
    };

export type ExtensionToWebviewMessage =
  | NodeEditorDocumentUpdateMessage
  | NodeEditorBootstrapPayload
  | { type: "action"; request: ActionRequest; allowEditableTarget?: boolean }
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "autocompletionValues"; fieldId: string; values: string[] }
  | { type: "error"; message: string };

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | NodeEditorGraphEditMessage
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "openRawJson" }
  | { type: "openKeybindings"; query?: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme };
