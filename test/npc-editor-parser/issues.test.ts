import { describe, expect, test } from "vitest";
import { buildNpcIssues, buildIssuesByFieldPath } from "../../webview/hytale-npc-role-editor/src/issues";
import type { NpcDocument, NpcStandardParameterEntry } from "../../webview/hytale-npc-role-editor/src/parsing/documentTypes";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";

function createParameterEntry(
  name: string,
  value: NpcStandardParameterEntry["value"],
): NpcStandardParameterEntry {
  return {
    name,
    value,
    keyOrder: ["Value"],
    extraFields: {},
  };
}

describe("npc editor issues", () => {
  test("builds unused-parameter warnings", () => {
    const document: NpcDocument = {
      roleType: "Generic",
      rawRoot: {
        Type: "Generic",
        Parameters: {
          Appearance: {
            Value: "",
          },
          UsedParameter: {
            Value: 10,
          },
        },
        MaxHealth: {
          Compute: "UsedParameter",
        },
      },
      parameters: {
        entries: [
          createParameterEntry("Appearance", { kind: "literal", value: "" }),
          createParameterEntry("UsedParameter", { kind: "literal", value: 10 }),
        ],
        importStates: null,
        excludedEntries: {},
        keyOrder: ["Appearance", "UsedParameter"],
      },
    };

    const issues = buildNpcIssues(document, buildParameterUsageIndex(document.rawRoot));

    expect(issues).toEqual([
      {
        severity: "warning",
        code: "unused-parameter",
        message: 'Parameter "Appearance" is currently unused.',
        fieldPath: "Parameters.Appearance.Value",
      },
    ]);
  });

  test("builds compute validation errors for parameters and role attributes", () => {
    const document: NpcDocument = {
      roleType: "Generic",
      rawRoot: {
        Type: "Generic",
        MaxHealth: {
          Compute: "max(",
        },
        Parameters: {
          ViewRange: {
            Value: {
              Compute: "MissingParameter + 1",
            },
          },
        },
      },
      parameters: {
        entries: [
          createParameterEntry("ViewRange", {
            kind: "compute",
            expression: "MissingParameter + 1",
          }),
        ],
        importStates: null,
        excludedEntries: {},
        keyOrder: ["ViewRange"],
      },
    };

    const issues = buildNpcIssues(document, buildParameterUsageIndex(document.rawRoot));

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "compute-unresolved-variable",
          message: "Unknown parameter.",
          fieldPath: "Parameters.ViewRange.Value",
        }),
        expect.objectContaining({
          severity: "error",
          code: "compute-parse-error",
          message: "Invalid expression.",
          fieldPath: "MaxHealth",
        }),
      ]),
    );
  });

  test("indexes issues by field path", () => {
    const issuesByFieldPath = buildIssuesByFieldPath([
      {
        severity: "warning",
        code: "unused-parameter",
        message: 'Parameter "Appearance" is currently unused.',
        fieldPath: "Parameters.Appearance.Value",
      },
      {
        severity: "warning",
        code: "unused-parameter",
        message: 'Parameter "MaxHealth" is currently unused.',
        fieldPath: "Parameters.MaxHealth.Value",
      },
    ]);

    expect(issuesByFieldPath.get("Parameters.Appearance.Value")).toEqual([
      expect.objectContaining({
        code: "unused-parameter",
      }),
    ]);
    expect(issuesByFieldPath.get("Parameters.MaxHealth.Value")).toEqual([
      expect.objectContaining({
        code: "unused-parameter",
      }),
    ]);
  });
});
