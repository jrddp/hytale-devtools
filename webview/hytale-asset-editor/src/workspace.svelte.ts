import type { Field } from "@shared/fieldTypes";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import type { VSCodeApi } from "./common";

export class Workspace {
  vscode = $state<VSCodeApi>() as VSCodeApi;
  resolvedRefsByRef = new SvelteMap<string, Field | null>();
  pendingRefs = new SvelteSet<string>();
  collapseAllVersion = $state(0);
  collapseAllTarget = $state<boolean | null>(null);

  requestRef($ref: string) {
    if (!$ref || this.resolvedRefsByRef.has($ref) || this.pendingRefs.has($ref)) {
      return;
    }

    this.pendingRefs.add($ref);
    this.vscode.postMessage({
      type: "resolveRef",
      $ref,
    });
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
}

export const workspace = new Workspace();
