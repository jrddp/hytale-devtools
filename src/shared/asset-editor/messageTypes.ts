import { type AssetDefinition, type Field } from "../fieldTypes";
import type { IndexReference } from "../indexTypes";

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

export type AssetEditorAutocompletionValuesMessage = {
  type: "autocompletionValues";
  fieldId: string;
  values: string[];
};

export type AssetEditorExtensionToWebviewMessage =
  | AssetEditorBootstrapMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage
  | AssetEditorResolvedRefMessage
  | AssetEditorAutocompletionValuesMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "resolveRef"; $ref: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
