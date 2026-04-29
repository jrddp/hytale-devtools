import { describe, expect, test } from "vitest";

import { resolveNodeEditorQuickActionCommand } from "../../src/shared/node-editor/quickActions";

const PREFIX = "hytale-devtools.nodeEditor.quickAction.";

describe("node editor quick actions", () => {
  test("maps command suffixes to action requests", () => {
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}go-to-root`, PREFIX)).toEqual({
      request: { type: "reveal-node" },
    });
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}fit-view`, PREFIX)).toEqual({
      request: { type: "fit-view" },
    });
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}select-all`, PREFIX)).toEqual({
      request: { type: "select-all" },
    });
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}auto-position-nodes`, PREFIX)).toEqual({
      request: { type: "auto-position-nodes" },
    });
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}view-raw-json`, PREFIX)).toEqual({
      request: { type: "view-raw-json" },
    });
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}help-and-hotkeys`, PREFIX)).toEqual({
      request: { type: "help-and-hotkeys" },
    });
  });

  test("allows search to run from editable targets", () => {
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}search-nodes`, PREFIX)).toEqual({
      request: { type: "search-nodes" },
      allowEditableTarget: true,
    });
  });

  test("ignores unrelated or unknown commands", () => {
    expect(resolveNodeEditorQuickActionCommand("other.search-nodes", PREFIX)).toBeUndefined();
    expect(resolveNodeEditorQuickActionCommand(`${PREFIX}unknown`, PREFIX)).toBeUndefined();
  });
});
