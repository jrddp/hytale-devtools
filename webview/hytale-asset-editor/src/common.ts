import { type AssetEditorWebviewToExtensionMessage } from "@shared/asset-editor/messageTypes";
import { type FieldInstance } from "src/parsing/fieldInstances";

export type VSCodeApi = {
  postMessage: (message: AssetEditorWebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
  isDevEnv?: boolean
};

export type RenderFieldProps<TField extends FieldInstance = FieldInstance> = {
  field: TField;
  depth: number;
  onunset?: () => void;
};
