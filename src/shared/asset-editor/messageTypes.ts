import { type AssetInstance } from "../../asset-cache/assetCacheRuntime";
import { type AssetDefinition } from "../fieldTypes";
import type { IndexReference } from "../indexTypes";

export type AssetEditorParentState = {
  status: "loading" | "none" | "loaded" | "missing";
  parentName?: string;
  parentInstance?: AssetInstance;
};

export type AssetEditorBootstrapMessage = {
  type: "bootstrap";
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
  parent: AssetEditorParentState;
};

export type AssetEditorParentUpdateMessage = {
  type: "parentUpdate";
  parent: AssetEditorParentState;
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
  | AssetEditorParentUpdateMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage
  | AssetEditorAutocompletionValuesMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "resolveParent"; parentName: string }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
