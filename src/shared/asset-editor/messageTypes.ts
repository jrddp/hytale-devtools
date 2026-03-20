import type { AssetPreviewType, AssetDefinition, JsonAssetInstance } from "../fieldTypes";
import type { IndexReference } from "../indexTypes";

export type AssetEditorPreview =
  | { type: Exclude<AssetPreviewType, "Item" | "Model"> | "none"; loading?: boolean }
  | {
      type: "Item";
      icon?: number[];
      loading?: boolean;
    }
  | {
      type: "Model";
      model?: Record<string, unknown>;
      texture?: number[];
      loading?: boolean;
    };

export type AssetEditorPreviewRequest =
  | {
      type: "Item";
      iconPath?: string;
    }
  | {
      type: "Model";
      modelPath?: string;
      texturePath?: string;
    };

export type AssetEditorParentState = {
  status: "loading" | "none" | "loaded" | "missing";
  parentName?: string;
  parentInstance?: JsonAssetInstance;
};

export type AssetEditorBootstrapMessage = {
  type: "bootstrap";
  assetDefinition: AssetDefinition;
  assetsByRef: Record<string, AssetDefinition>;
  parent: AssetEditorParentState;
  preview?: AssetEditorPreview;
};

export type AssetEditorParentUpdateMessage = {
  type: "parentUpdate";
  parent: AssetEditorParentState;
};

export type AssetEditorPreviewUpdateMessage = {
  type: "previewUpdate";
  preview?: AssetEditorPreview;
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
  | AssetEditorPreviewUpdateMessage
  | AssetEditorDocumentUpdateMessage
  | AssetEditorErrorMessage
  | AssetEditorAutocompletionValuesMessage;

export type AssetEditorWebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "openRawJson" }
  | { type: "resolveParent"; parentName: string }
  | { type: "resolvePreview"; request: AssetEditorPreviewRequest }
  | { type: "autocompleteRequest"; symbolLookup: IndexReference; fieldId: string }
  | {
      type: "apply";
      text: string;
      sourceVersion?: number;
    };
