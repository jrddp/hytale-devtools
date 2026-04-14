import type { NpcDescriptorDocument, NpcDescriptorSource } from "./descriptorTypes";
import type { IndexReference } from "../indexTypes";

export type NpcRoleEditorBootstrapMessage = {
  type: "bootstrap";
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
  isDevelopment: boolean;
};

export type NpcRoleEditorDocumentUpdateMessage = {
  type: "update";
  documentPath: string;
  version: number;
  text: string;
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
};

export type NpcRoleEditorVariantReferenceUpdateMessage = {
  type: "referenceUpdate";
  reference: NpcRoleEditorVariantReferenceState;
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

export type NpcRoleEditorApplyMessage = {
  type: "apply";
  text: string;
  sourceVersion: number;
  label: string;
};

export type NpcRoleEditorExtensionToWebviewMessage =
  | NpcRoleEditorBootstrapMessage
  | NpcRoleEditorDocumentUpdateMessage
  | NpcRoleEditorErrorMessage
  | NpcRoleEditorAutocompletionValuesMessage
  | NpcRoleEditorVariantReferenceUpdateMessage
  | NpcRoleEditorContextActionMessage;

export type NpcRoleEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "resolveVariantReference"; referenceName: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | NpcRoleEditorApplyMessage;
