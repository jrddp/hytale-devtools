import type { NpcDescriptorDocument, NpcDescriptorSource } from "./descriptorTypes";
import type { NpcParameterValueJson, NpcParametersJson } from "./documentTypes";
import type { IndexReference } from "../indexTypes";
import type { NodeEditorClipboardSelection } from "../node-editor/clipboardTypes";
import type { NodeEditorGraphEdit } from "../node-editor/graphTypes";
import type {
  ActionRequest,
  NodeEditorGraphEditMessage,
  NodeEditorControlScheme,
  NodeEditorPlatform,
} from "../node-editor/messageTypes";
import type { NodeEditorWorkspaceContext } from "../node-editor/workspaceTypes";
import type {
  AnimationPreviewState,
  BaseModelPreviewState,
} from "../modelPreviewTypes";
import type { NpcGraphTargetWorkspaceRoot } from "./graphTargets";

export type NpcRoleEditorBootstrapMessage = {
  type: "bootstrap";
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
  isDevelopment: boolean;
  nodeEditorControlScheme: NodeEditorControlScheme;
  nodeEditorPlatform: NodeEditorPlatform;
  nodeEditorClipboard: NodeEditorClipboardSelection;
  npcBehaviorGraphContexts: Partial<
    Record<NpcGraphTargetWorkspaceRoot, NodeEditorWorkspaceContext>
  >;
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

export type NpcRoleEditorIndexValuesMessage = {
  type: "indexValues";
  requestId: string;
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
    | "logFieldInstance"
    | "setGraphRoot"
    | "setGraphFieldExplicitEmpty";
  parameterName?: string;
  fieldPath?: string;
  nodeEditorNodeId?: string;
  nodeEditorFieldSchemaKey?: string;
  nodeEditorListItemIndex?: number;
};

export type NpcRoleEditorGraphActionMessage = {
  type: "graphAction";
  request: ActionRequest;
  allowEditableTarget?: boolean;
};

export type NpcRoleEditorAssetIndexUpdateMessage = {
  type: "assetIndexUpdate";
  revision: number;
};

export type NpcRoleEditorAppearancePreviewBaseUpdateMessage = {
  type: "appearancePreviewBaseUpdate";
  assetName?: string;
  basePreview?: BaseModelPreviewState;
  animationIds?: string[];
  idleAnimationPreview?: AnimationPreviewState;
};

export type NpcRoleEditorAppearancePreviewAnimationUpdateMessage = {
  type: "appearancePreviewAnimationUpdate";
  assetName: string;
  animationSetId: string;
  animationPreview?: AnimationPreviewState;
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
  | NpcRoleEditorIndexValuesMessage
  | NpcRoleEditorVariantReferenceUpdateMessage
  | NpcRoleEditorComponentReferenceTargetUpdateMessage
  | NpcRoleEditorContextActionMessage
  | NpcRoleEditorGraphActionMessage
  | NpcRoleEditorAssetIndexUpdateMessage
  | NpcRoleEditorAppearancePreviewBaseUpdateMessage
  | NpcRoleEditorAppearancePreviewAnimationUpdateMessage;

export type NpcRoleEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "clipboard"; clipboard: NodeEditorClipboardSelection }
  | { type: "openKeybindings"; query?: string }
  | { type: "graphPageActive"; active: boolean }
  | { type: "update-setting"; setting: "controlScheme"; value: NodeEditorControlScheme }
  | { type: "resolveVariantReference"; referenceName: string }
  | { type: "resolveComponentReferenceTarget"; componentClass: string; referenceName: string }
  | { type: "resolveAppearancePreviewBase"; assetName?: string }
  | { type: "resolveAppearancePreviewAnimation"; assetName: string; animationSetId: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | { type: "indexValuesRequest"; symbolLookup: IndexReference; requestId: string }
  | NpcRoleEditorGraphEditMessage
  | NpcRoleEditorApplyMessage;
