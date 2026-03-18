import type { AssetEditorWebviewToExtensionMessage } from "@shared/asset-editor/messageTypes";
import type { AssetDefinition, Field } from "@shared/fieldTypes";
import type { VSCodeApi } from "./common";
import type {
  FieldInstance,
  ObjectFieldInstance,
  RootFieldInstance,
  VariantFieldInstance,
} from "./parsing/fieldInstances";
import {
  createEmptyFieldInstance as createEmptyFieldInstanceFromSchema,
  parseDocumentText,
} from "./parsing/parseDocument";
import { serializeDocument, serializeDocumentText } from "./parsing/serializeDocument";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  assetDefinition = $state<AssetDefinition | null>(null);
  rootFieldInstance = $state<ObjectFieldInstance | VariantFieldInstance | null>(null);

  documentPath = $state("");
  documentVersion = $state(0);
  documentRootField = $state<RootFieldInstance | null>(null);
  documentParseError = $state<string | null>(null);

  assetsByRef = $state<Record<string, AssetDefinition> | null>(null);
  autocompleteField = $state<string>();
  autocompleteValues = $state<string[]>([]);

  collapseAllVersion = $state(0);
  collapseAllTarget = $state<boolean | null>(null);
  hideUnsetFields = $state(false);

  setAssetDefinition(assetDefinition: AssetDefinition | null) {
    this.assetDefinition = assetDefinition;
    this.documentPath = "";
    this.documentVersion = 0;
    this.documentRootField = null;
    this.documentParseError = null;
    this.autocompleteField = undefined;
    this.autocompleteValues = [];
  }

  setDocument({
    documentPath,
    text,
    version,
  }: {
    documentPath: string;
    text: string;
    version: number;
  }) {
    this.documentPath = documentPath;
    this.documentVersion = version;
    this.reparseDocument(text);
  }

  setAutocompleteValues(fieldId: string, values: string[]) {
    this.autocompleteField = fieldId;
    this.autocompleteValues = sortAssetVariantsToBottom(values);
  }

  setAllPanelsCollapsed(collapsed: boolean) {
    this.collapseAllTarget = collapsed;
    this.collapseAllVersion += 1;
  }

  expandAllPanels() {
    this.setAllPanelsCollapsed(false);
  }

  collapseAllPanels() {
    this.setAllPanelsCollapsed(true);
  }

  toggleHideUnsetFields() {
    this.hideUnsetFields = !this.hideUnsetFields;
  }

  serializeDocument() {
    if (!this.documentRootField) {
      return null;
    }

    return serializeDocument($state.snapshot(this.documentRootField));
  }

  serializeDocumentText() {
    if (!this.documentRootField) {
      return null;
    }

    return serializeDocumentText($state.snapshot(this.documentRootField));
  }

  applyDocumentState() {
    console.log("Applying document state", this.documentRootField);
    const text = this.serializeDocumentText();
    if (!text) {
      return;
    }

    const payload: Extract<AssetEditorWebviewToExtensionMessage, { type: "apply" }> = {
      type: "apply",
      text,
      sourceVersion: this.documentVersion,
    };
    this.vscode.postMessage(payload);
  }

  createEmptyFieldInstance<TField extends Field>(field: TField): TField & FieldInstance {
    return createEmptyFieldInstanceFromSchema(
      $state.snapshot(field) as TField,
      $state.snapshot(this.assetsByRef) as Record<string, AssetDefinition>,
    );
  }

  reparseDocument(text: string) {
    if (!this.assetDefinition || !this.documentPath) {
      this.documentParseError = null;
      return;
    }

    const result = parseDocumentText({
      text: text,
      assetDefinition: $state.snapshot(this.assetDefinition) as AssetDefinition,
      assetsByRef: $state.snapshot(this.assetsByRef) as Record<string, AssetDefinition>,
    });

    switch (result.status) {
      case "ready":
        this.documentRootField = result.rootField;
        this.documentParseError = null;
        return;
      case "error":
        this.documentParseError = result.error;
        if (!this.documentRootField) {
          this.documentRootField = null;
        }
        return;
      default:
        return;
    }
  }
}

export const workspace = new Workspace();

function sortAssetVariantsToBottom(sourceValues: string[]): string[] {
  return [...sourceValues].sort((left, right) => {
    const leftStartsWithStar = left.startsWith("*");
    const rightStartsWithStar = right.startsWith("*");

    if (leftStartsWithStar !== rightStartsWithStar) {
      return leftStartsWithStar ? 1 : -1;
    }

    return left.localeCompare(right);
  });
}
