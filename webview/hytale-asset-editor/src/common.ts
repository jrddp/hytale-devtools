import { type AssetEditorWebviewToExtensionMessage } from "@shared/asset-editor/messageTypes";
import { type FieldInstance } from "src/parsing/fieldInstances";
import type { Snippet } from "svelte";

export type VSCodeApi = {
  postMessage: (message: AssetEditorWebviewToExtensionMessage) => void;
  getState?: () => Record<string, unknown> | undefined;
  setState?: (state: Record<string, unknown>) => unknown;
  isDevEnv?: boolean;
};

export type FieldPanelOverrides = {
  minimal?: boolean;
  title?: Snippet;
};

export type RenderFieldProps<TField extends FieldInstance = FieldInstance> = {
  field: TField;
  depth: number;
  readOnly?: boolean;
  readOnlyMessage?: string;
  applyDocumentStateOnCommit?: boolean;
  fieldPanelOverrides?: FieldPanelOverrides;
  summary?: string;
  onunset?: () => void;
  /** For inline fields, render to the right of children. For collapsable fields, render next to title. */
  // TODO implement
  actions?: Snippet;
  children?: Snippet;
  /** Render to the right of the title. */
  glyphs?: Snippet;
};
