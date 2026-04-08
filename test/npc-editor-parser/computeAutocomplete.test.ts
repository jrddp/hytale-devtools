import { describe, expect, test } from "vitest";
import {
  applyComputeAutocompleteOption,
  extractComputeAutocompleteQuery,
  filterComputeAutocompleteOptions,
  getComputeAutocompleteContext,
  resolveSatisfiedComputeAutocomplete,
} from "../../webview/shared/components/computeAutocomplete";
import { buildNpcComputeAutocompleteOptions } from "../../webview/hytale-npc-role-editor/src/compute/computeAutocomplete";
import type { NpcPropertyField } from "../../webview/hytale-npc-role-editor/src/propertyModel";

function createParameterField(
  key: string,
  overrides: Partial<NpcPropertyField> = {},
): NpcPropertyField {
  return {
    id: `parameter-${key}`,
    key,
    label: key,
    fieldPath: `Parameters.${key}.Value`,
    kind: "string",
    value: { kind: "literal", value: "" },
    canRename: true,
    canChangeType: true,
    canUnset: true,
    isDescriptionEditable: true,
    computable: true,
    isSet: true,
    ...overrides,
  };
}

describe("npc compute autocomplete", () => {
  test("builds standard suggestions from parameters, functions, and constants", () => {
    const options = buildNpcComputeAutocompleteOptions({
      parameters: [
        createParameterField("ViewRange", {
          kind: "number",
          value: { kind: "literal", value: 15 },
        }),
        createParameterField("DisplayName", {
          description: "Display name for the NPC.",
        }),
      ],
    });

    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "ViewRange",
          insertText: "ViewRange",
          kind: "parameter",
          detail: "Parameter",
          description: "Number parameter.",
        }),
        expect.objectContaining({
          label: "DisplayName",
          kind: "parameter",
          description: "Display name for the NPC.",
        }),
        expect.objectContaining({
          label: "randomInRange()",
          insertText: "randomInRange(",
          kind: "function",
          detail: "Function",
        }),
        expect.objectContaining({
          label: "PI",
          insertText: "PI",
          kind: "constant",
          detail: "Constant",
        }),
      ]),
    );
  });

  test("adds sensor eval identifiers only for sensor-eval scope", () => {
    const standardOptions = buildNpcComputeAutocompleteOptions({ scope: "standard" });
    const sensorEvalOptions = buildNpcComputeAutocompleteOptions({ scope: "sensorEval" });

    expect(standardOptions.some(option => option.label === "health")).toBe(false);
    expect(standardOptions.some(option => option.label === "blocked")).toBe(false);
    expect(sensorEvalOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "health", detail: "Sensor" }),
        expect.objectContaining({ label: "blocked", detail: "Sensor" }),
      ]),
    );
  });

  test("filters by substring of the active identifier", () => {
    const filtered = filterComputeAutocompleteOptions(
      [
        { label: "ViewRange", insertText: "ViewRange", kind: "parameter", detail: "Parameter" },
        {
          label: "randomInRange()",
          insertText: "randomInRange(",
          kind: "function",
          detail: "Function",
        },
      ],
      "range",
    );

    expect(filtered.map(option => option.label)).toEqual(["ViewRange", "randomInRange()"]);
  });

  test("filters to the exact active function while inside its parameters", () => {
    const filtered = filterComputeAutocompleteOptions(
      [
        {
          label: "min()",
          insertText: "min(",
          kind: "function",
          detail: "Function",
        },
        {
          label: "randomInRange()",
          insertText: "randomInRange(",
          kind: "function",
          detail: "Function",
        },
      ],
      "min",
      "min",
    );

    expect(filtered.map(option => option.label)).toEqual(["min()"]);
  });

  test("extracts the identifier fragment at the cursor", () => {
    expect(extractComputeAutocompleteQuery("max(ViewR", 9)).toBe("ViewR");
    expect(extractComputeAutocompleteQuery("random()", 8)).toBe("");
  });

  test("keeps function context active while the cursor is inside its arguments", () => {
    expect(getComputeAutocompleteContext("min(1, Appearance)", 6, ["min", "max"])).toEqual({
      query: "min",
      activeFunctionName: "min",
      shouldShow: true,
    });
  });

  test("keeps function context active immediately after the closing parenthesis", () => {
    expect(getComputeAutocompleteContext("min(1, 2)", 9, ["min", "max"])).toEqual({
      query: "min",
      activeFunctionName: "min",
      shouldShow: true,
    });
  });

  test("does not keep function context after whitespace beyond the closing parenthesis", () => {
    expect(getComputeAutocompleteContext("min(1, 2) ", 10, ["min", "max"])).toEqual({
      query: "",
      shouldShow: false,
    });
  });

  test("prefers the active identifier over the surrounding function name", () => {
    expect(getComputeAutocompleteContext("min(1, Ap)", 9, ["min", "max"])).toEqual({
      query: "Ap",
      shouldShow: true,
    });
  });

  test("applies a suggestion by replacing only the trailing identifier fragment", () => {
    const result = applyComputeAutocompleteOption("max(ViewR + 2)", 9, {
      insertText: "ViewRange",
    });

    expect(result).toEqual({
      value: "max(ViewRange + 2)",
      cursorPos: 13,
    });
  });

  test("treats a fully matched parameter as satisfied and moves to its end", () => {
    expect(
      resolveSatisfiedComputeAutocomplete(
        "Appearance",
        4,
        {
          kind: "parameter",
          insertText: "Appearance",
        },
        ["min", "max"],
      ),
    ).toEqual({
      cursorPos: 10,
    });
  });

  test("treats a fully matched function call as satisfied and moves to the closing paren", () => {
    expect(
      resolveSatisfiedComputeAutocomplete(
        "min(1, 2)",
        6,
        {
          kind: "function",
          insertText: "min(",
        },
        ["min", "max"],
      ),
    ).toEqual({
      cursorPos: 9,
    });
  });

  test("keeps the cursor inside an incomplete function call when it is already past the opening paren", () => {
    expect(
      resolveSatisfiedComputeAutocomplete(
        "min(1, 2",
        8,
        {
          kind: "function",
          insertText: "min(",
        },
        ["min", "max"],
      ),
    ).toEqual({
      cursorPos: 8,
    });
  });
});
