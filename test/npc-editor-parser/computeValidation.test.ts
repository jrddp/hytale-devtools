import { describe, expect, test } from "vitest";
import {
  extractNpcComputeVariableReferences,
  validateNpcComputeExpression,
} from "../../webview/hytale-npc-role-editor/src/compute/computeValidation";

describe("npc compute validation", () => {
  test("accepts built-ins and known parameters", () => {
    const validation = validateNpcComputeExpression(
      "max(ViewRange, PI)",
      new Set(["ViewRange"]),
    );

    expect(validation).toMatchObject({
      valid: true,
      unresolvedVariables: [],
      referencedVariables: ["ViewRange"],
    });
  });

  test("reports parse errors", () => {
    const validation = validateNpcComputeExpression("max(", new Set());

    expect(validation.valid).toBe(false);
    expect(validation.errors).toEqual([expect.stringContaining("Parse error:")]);
  });

  test("reports unresolved variables", () => {
    const validation = validateNpcComputeExpression(
      "UnknownParameter + 1",
      new Set(["ViewRange"]),
    );

    expect(validation.valid).toBe(false);
    expect(validation.unresolvedVariables).toEqual(["UnknownParameter"]);
    expect(validation.errors).toContain("Unresolved variables: UnknownParameter");
  });

  test("ignores identifiers inside quoted strings", () => {
    expect(extractNpcComputeVariableReferences('isEmpty("Appearance")')).toEqual([]);
  });
});
