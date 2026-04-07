import type { NpcDescriptorDocument, NpcDescriptorSource } from "./descriptorTypes";
import type { IndexReference } from "../indexTypes";

export type NpcRoleEditorBootstrapMessage = {
  type: "bootstrap";
  descriptors: NpcDescriptorDocument;
  descriptorPath: string;
  descriptorSource: NpcDescriptorSource;
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

export type NpcRoleEditorContextActionMessage = {
  type: "contextAction";
  action: "renameParameter" | "deleteParameter" | "changeParameterType";
  parameterName: string;
};

export type NpcRoleEditorApplyMessage = {
  type: "apply";
  text: string;
  sourceVersion?: number;
};

export type NpcRoleEditorExtensionToWebviewMessage =
  | NpcRoleEditorBootstrapMessage
  | NpcRoleEditorDocumentUpdateMessage
  | NpcRoleEditorErrorMessage
  | NpcRoleEditorAutocompletionValuesMessage
  | NpcRoleEditorContextActionMessage;

export type NpcRoleEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | NpcRoleEditorApplyMessage;
