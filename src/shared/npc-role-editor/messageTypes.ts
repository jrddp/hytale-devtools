import type { NpcDescriptorDocument, NpcDescriptorSource } from "./descriptorTypes";
import type { NpcParameterValueJson, NpcParametersJson } from "./documentTypes";
import type { IndexReference } from "../indexTypes";
import type { NodeEditorClipboardSelection } from "../node-editor/clipboardTypes";
import type { NodeEditorGraphEdit } from "../node-editor/graphTypes";
import type {
  NodeEditorGraphEditMessage,
  NodeEditorControlScheme,
  NodeEditorPlatform,
} from "../node-editor/messageTypes";
import type { NodeEditorWorkspaceContext } from "../node-editor/workspaceTypes";
import type { ModelPreviewState } from "../modelPreviewTypes";

export type NpcRoleEditorBootstrapMessage = {
  type: "bootstrap";
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
  isDevelopment: boolean;
  nodeEditorControlScheme: NodeEditorControlScheme;
  nodeEditorPlatform: NodeEditorPlatform;
  nodeEditorClipboard: NodeEditorClipboardSelection;
  npcBehaviorGraphContexts: Partial<Record<"Instructions" | "Instruction" | "Sensor", NodeEditorWorkspaceContext>>;
};

export type NpcRoleEditorDocumentUpdateMessage = {
  type: "update";
  documentPath: string;
  version: number;
  text: string;
};

export type NpcRoleEditorGraphUpdateMessage = {
  type: "graphUpdate";
  documentPath: string;
  version: number;
  text: string;
  fieldPath: string;
  acknowledgedClientEditId?: number;
  appliedEdit?: NodeEditorGraphEdit;
};

export type NpcRoleEditorErrorMessage = {
  type: "error";
  message: string;
};

export type NpcRoleEditorAutocompletionValuesMessage = {
  type: "autocompletionValues";
  fieldId: string;
  values: string[];
};

export type NpcRoleEditorVariantReferenceState = {
  status: "none" | "loading" | "loaded" | "missing" | "error";
  referenceName?: string;
  resolvedPath?: string;
  text?: string;
  message?: string;
  appearanceValue?: NpcParameterValueJson;
  effectiveParameters?: Record<string, NpcParameterValueJson>;
};

export type NpcRoleEditorVariantReferenceUpdateMessage = {
  type: "referenceUpdate";
  reference: NpcRoleEditorVariantReferenceState;
};

export type NpcRoleEditorComponentReferenceTargetState = {
  status: "loading" | "loaded" | "missing" | "error";
  componentClass: string;
  referenceName: string;
  resolvedPath?: string;
  parameters?: NpcParametersJson;
  message?: string;
};

export type NpcRoleEditorComponentReferenceTargetUpdateMessage = {
  type: "componentReferenceTargetUpdate";
  target: NpcRoleEditorComponentReferenceTargetState;
};

export type NpcRoleEditorContextActionMessage = {
  type: "contextAction";
  action:
    | "renameParameter"
    | "deleteParameter"
    | "deleteField"
    | "changeParameterType"
    | "editParameterDescription"
    | "logFieldInstance";
  parameterName?: string;
  fieldPath?: string;
};

export type NpcRoleEditorPreviewUpdateMessage = {
  type: "previewUpdate";
  assetName?: string;
  preview?: ModelPreviewState;
  animationIds?: string[];
};

export type NpcRoleEditorApplyMessage = {
  type: "apply";
  text: string;
  sourceVersion: number;
  label: string;
};

export type NpcRoleEditorGraphEditMessage = NodeEditorGraphEditMessage & {
  fieldPath: string;
};

export type NpcRoleEditorExtensionToWebviewMessage =
  | NpcRoleEditorBootstrapMessage
  | NpcRoleEditorDocumentUpdateMessage
  | NpcRoleEditorGraphUpdateMessage
  | NpcRoleEditorErrorMessage
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | NpcRoleEditorAutocompletionValuesMessage
  | NpcRoleEditorVariantReferenceUpdateMessage
  | NpcRoleEditorComponentReferenceTargetUpdateMessage
  | NpcRoleEditorContextActionMessage
  | NpcRoleEditorPreviewUpdateMessage;

export type NpcRoleEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "openKeybindings"; query?: string }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme }
  | { type: "resolveVariantReference"; referenceName: string }
  | { type: "resolveComponentReferenceTarget"; componentClass: string; referenceName: string }
  | { type: "resolveAppearancePreview"; assetName?: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | NpcRoleEditorGraphEditMessage
  | NpcRoleEditorApplyMessage;
