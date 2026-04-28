import { describe, expect, test } from "vitest";

import { formatNodeFieldPlaceholder } from "../../webview/hytale-node-editor/src/node-editor/utils/fieldPlaceholders";

describe("node editor field placeholders", () => {
  test("formats Number.MAX_VALUE as infinity in placeholders", () => {
    expect(formatNodeFieldPlaceholder(Number.MAX_VALUE)).toBe("∞");
    expect(formatNodeFieldPlaceholder(-Number.MAX_VALUE)).toBe("-∞");
  });

  test("formats array placeholders compactly", () => {
    expect(formatNodeFieldPlaceholder([Number.MAX_VALUE, Number.MAX_VALUE])).toBe("[∞, ∞]");
  });
});
