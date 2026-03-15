import { type AssetEditorWebviewToExtensionMessage } from "@shared/asset-editor/messageTypes";

export type VSCodeApi = {
  postMessage: (message: AssetEditorWebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
};
