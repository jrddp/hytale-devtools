import type { AssetDefinition, Field } from "@shared/fieldTypes";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { VSCodeApi } from "./common";
import { parseDocumentText } from "./parsing/parseDocument.svelte";
import type { RootFieldInstance } from "./parsing/fieldInstances";

export type DocumentParseStatus = "idle" | "waiting-for-refs" | "ready" | "error";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  assetDefinition = $state<AssetDefinition | null>(null);
  documentPath = $state("");
  documentText = $state("");
  documentVersion = $state(0);
  documentRootField = $state<RootFieldInstance | null>(null);
  documentParseStatus = $state<DocumentParseStatus>("idle");
  documentParseError = $state<string | null>(null);
  resolvedRefsByRef = new SvelteMap<string, Field | null>();
  pendingRefs = new SvelteSet<string>();
  collapseAllVersion = $state(0);
  collapseAllTarget = $state<boolean | null>(null);

  requestRef(refId: string) {
    if (!refId || this.resolvedRefsByRef.has(refId) || this.pendingRefs.has(refId)) {
      return;
    }

    this.pendingRefs.add(refId);
    this.vscode.postMessage({
      type: "resolveRef",
      $ref: refId,
    });
  }

  setAssetDefinition(assetDefinition: AssetDefinition | null) {
    this.assetDefinition = assetDefinition;
    this.documentPath = "";
    this.documentText = "";
    this.documentVersion = 0;
    this.resetResolvedRefs();
    this.documentRootField = null;
    this.documentParseStatus = "idle";
    this.documentParseError = null;
    this.reparseDocument();
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
    this.documentText = text;
    this.documentVersion = version;
    this.reparseDocument();
  }

  setResolvedRef(refId: string, field: Field | null) {
    this.pendingRefs.delete(refId);
    this.resolvedRefsByRef.set(refId, field);
    this.reparseDocument();
  }

  resetResolvedRefs() {
    this.resolvedRefsByRef.clear();
    this.pendingRefs.clear();
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

  private reparseDocument() {
    if (!this.assetDefinition || !this.documentPath) {
      this.documentParseStatus = "idle";
      this.documentParseError = null;
      return;
    }

    const result = parseDocumentText({
      text: this.documentText,
      rootField: this.assetDefinition.rootField,
      resolvedRefsByRef: this.resolvedRefsByRef,
    });

    switch (result.status) {
      case "ready":
        this.documentRootField = result.rootField;
        this.documentParseStatus = "ready";
        this.documentParseError = null;
        return;
      case "waiting-for-refs":
        for (const refId of result.missingRefs) {
          this.requestRef(refId);
        }
        this.documentParseStatus = "waiting-for-refs";
        this.documentParseError = null;
        if (!this.documentRootField) {
          this.documentRootField = null;
        }
        return;
      case "error":
        this.documentParseStatus = "error";
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
