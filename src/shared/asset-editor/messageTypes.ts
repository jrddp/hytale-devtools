import { type AssetInstance } from "../../asset-cache/assetCacheRuntime";
import { type AssetDefinition } from "../fieldTypes";
import type { IndexReference } from "../indexTypes";

export type AssetEditorBootstrapMessage = {
  type: "bootstrap";
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
  parentInstance?: AssetInstance;
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

export type AssetEditorAutocompletionValuesMessage = {
  type: "autocompletionValues";
  fieldId: string;
  values: string[];
};

export type AssetEditorExtensionToWebviewMessage =
  | AssetEditorBootstrapMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage
  | AssetEditorAutocompletionValuesMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
