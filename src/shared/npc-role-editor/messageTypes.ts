import type { NpcDescriptorDocument, NpcDescriptorSource } from "./descriptorTypes";

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

export type NpcRoleEditorExtensionToWebviewMessage =
  | NpcRoleEditorBootstrapMessage
  | NpcRoleEditorDocumentUpdateMessage
  | NpcRoleEditorErrorMessage;

export type NpcRoleEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" };
