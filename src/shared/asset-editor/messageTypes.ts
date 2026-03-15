import { type AssetDefinition } from "../fieldTypes";

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

export type AssetEditorExtensionToWebviewMessage =
  | AssetEditorBootstrapMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
