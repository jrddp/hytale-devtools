import { describe, expect, test } from "vitest";

import type { NpcPropertySection } from "../../webview/hytale-npc-role-editor/src/propertyModel";
import {
  applyCollapsedFieldPathsToSections,
  ensureWebviewStateForDocument,
  resolveRestoredActivePage,
  updateCollapsedFieldPaths,
  type NpcRoleEditorWebviewState,
} from "../../webview/hytale-npc-role-editor/src/webviewState";

describe("NPC editor webview state", () => {
  test("restores a saved graph page only when the graph section still exists", () => {
    expect(
      resolveRestoredActivePage(
        {
          activePage: {
            kind: "graph",
            sectionId: "instructions",
          },
        },
        ["instructions", "stateTransitions"],
      ),
    ).toEqual({
      kind: "graph",
      sectionId: "instructions",
    });

    expect(
      resolveRestoredActivePage(
        {
          activePage: {
            kind: "graph",
            sectionId: "instructions",
          },
        },
        ["stateTransitions"],
      ),
    ).toEqual({ kind: "main" });
  });

  test("preserves legacy state for the same document and resets stale document state", () => {
    const state: NpcRoleEditorWebviewState = {
      graphViewports: {
        instructions: {
          x: 1,
          y: 2,
          zoom: 3,
        },
      },
      activePage: {
        kind: "main",
      },
      mainScrollTop: 42,
      collapsedFieldPaths: ["Parameters.Range.Value"],
    };

    expect(ensureWebviewStateForDocument(state, "/workspace/NPC.json")).toEqual({
      ...state,
      documentPath: "/workspace/NPC.json",
    });
    expect(
      ensureWebviewStateForDocument(
        {
          ...state,
          documentPath: "/workspace/Old.json",
        },
        "/workspace/NPC.json",
      ),
    ).toEqual({
      documentPath: "/workspace/NPC.json",
    });
  });

  test("stores collapsed fields as a sorted path list", () => {
    expect(updateCollapsedFieldPaths(undefined, "RoleAttributes.Model", true)).toEqual([
      "RoleAttributes.Model",
    ]);
    expect(
      updateCollapsedFieldPaths(
        ["RoleAttributes.Model", "Parameters.Range.Value"],
        "RoleAttributes.Model",
        false,
      ),
    ).toEqual(["Parameters.Range.Value"]);
    expect(updateCollapsedFieldPaths(["RoleAttributes.Model"], "RoleAttributes.Model", false)).toBeUndefined();
  });

  test("applies collapsed field paths recursively by fieldPath", () => {
    const sections = [
      {
        id: "parameters",
        name: "Parameters",
        fields: [
          {
            id: "parameter-root",
            key: "Root",
            label: "Root",
            fieldPath: "Parameters.Root.Value",
            kind: "richObject",
            value: { kind: "literal", value: {} },
            childFields: [
              {
                id: "parameter-child",
                key: "Child",
                label: "Child",
                fieldPath: "Parameters.Root.Value.Child",
                kind: "list",
                value: { kind: "literal", value: [] },
                ui: { collapsed: false },
              },
            ],
            ui: { collapsed: false },
          },
        ],
      },
    ] satisfies NpcPropertySection[];

    applyCollapsedFieldPathsToSections(sections, ["Parameters.Root.Value.Child"]);

    expect(sections[0].fields[0].ui?.collapsed).toBe(false);
    expect(sections[0].fields[0].childFields?.[0].ui?.collapsed).toBe(true);
  });
});
