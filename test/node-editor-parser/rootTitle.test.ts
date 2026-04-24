import { describe, expect, test } from "vitest";

import {
  formatRootNodeTitleText,
  shouldShowRootTitlePrefix,
} from "../../webview/hytale-node-editor/src/node-editor/utils/rootTitle";

describe("node editor root title display", () => {
  test("prefixes root node titles that do not already include the root marker", () => {
    expect(formatRootNodeTitleText("Instruction", true)).toBe("[ROOT] Instruction");
    expect(shouldShowRootTitlePrefix("Instruction", true)).toBe(true);
  });

  test("does not duplicate an existing root marker", () => {
    expect(formatRootNodeTitleText("[ROOT] Instruction", true)).toBe("[ROOT] Instruction");
    expect(shouldShowRootTitlePrefix("[ROOT] Instruction", true)).toBe(false);
  });

  test("does not duplicate an existing root marker after leading whitespace", () => {
    expect(formatRootNodeTitleText("  [ROOT] Instruction", true)).toBe("  [ROOT] Instruction");
    expect(shouldShowRootTitlePrefix("  [ROOT] Instruction", true)).toBe(false);
  });

  test("leaves non-root titles unchanged", () => {
    expect(formatRootNodeTitleText("Instruction", false)).toBe("Instruction");
    expect(shouldShowRootTitlePrefix("Instruction", false)).toBe(false);
  });
});
