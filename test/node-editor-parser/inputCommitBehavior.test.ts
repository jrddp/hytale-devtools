import { describe, expect, test } from "vitest";

import {
  getCommitInputKeyAction,
  parseNumberText,
  sanitizeNumberText,
} from "../../webview/shared/components/inputs/inputCommitBehavior";

describe("shared input commit behavior", () => {
  test("sanitizes decimal and integer number input", () => {
    expect(sanitizeNumberText(" 12.3px ")).toBe("12.3");
    expect(sanitizeNumberText("-1.2.3", { integer: false })).toBe("-1.23");
    expect(sanitizeNumberText("1.9", { integer: true })).toBe("19");
    expect(sanitizeNumberText("--12", { integer: true })).toBe("-12");
  });

  test("clamps numeric input when bounds are supplied", () => {
    expect(sanitizeNumberText("20", { maximum: 10 })).toBe("10");
    expect(sanitizeNumberText("-5", { minimum: 0 })).toBe("0");
    expect(sanitizeNumberText("-", { minimum: 0 })).toBe("-");
  });

  test("classifies empty, invalid, and valid number commits", () => {
    expect(parseNumberText("")).toEqual({ kind: "empty" });
    expect(parseNumberText("-")).toEqual({ kind: "invalid" });
    expect(parseNumberText("1.8", { integer: true })).toEqual({
      kind: "number",
      value: 18,
    });
    expect(parseNumberText("1.8")).toEqual({
      kind: "number",
      value: 1.8,
    });
  });

  test("resolves escape and enter key actions", () => {
    const baseEvent = {
      isComposing: false,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    };

    expect(getCommitInputKeyAction({ ...baseEvent, key: "Escape" })).toBe("escape-blur");
    expect(getCommitInputKeyAction({ ...baseEvent, key: "Enter" })).toBe("enter-commit-blur");
    expect(getCommitInputKeyAction({ ...baseEvent, key: "Enter" }, "focus-next")).toBe(
      "enter-commit-focus-next",
    );
    expect(getCommitInputKeyAction({ ...baseEvent, key: "Enter", shiftKey: true })).toBe("none");
  });
});
