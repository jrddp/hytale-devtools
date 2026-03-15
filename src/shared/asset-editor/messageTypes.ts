import { type AssetDefinition, type Field } from "../fieldTypes";

export type AssetEditorBootstrapMessage = {
  type: "bootstrap";
  assetDefinition: AssetDefinition;
};

export type AssetEditorDocumentUpdateMessage = {
  type: "update";
  documentPath: string;
  version: number;
  text: string;
};

export type AssetEditorErrorMessage = {
  type: "error";
  message: string;
};

export type AssetEditorResolvedRefMessage = {
  type: "resolvedRef";
  $ref: string;
  field: Field | null;
};

export type AssetEditorExtensionToWebviewMessage =
  | AssetEditorBootstrapMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage
  | AssetEditorResolvedRefMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "resolveRef"; $ref: string }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
