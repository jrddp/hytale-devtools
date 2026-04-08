import { describe, expect, test } from "vitest";
import { buildIssuesByFieldPath, buildNpcIssues } from "../../webview/hytale-npc-role-editor/src/issues";
import { buildParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import {
  buildNpcPropertyState,
  type NpcPropertySection,
} from "../../webview/hytale-npc-role-editor/src/propertyModel";
import { serializeNpcDocument } from "../../webview/hytale-npc-role-editor/src/parsing/serializeNpcDocument";
import type { NpcRoleJson } from "../../webview/hytale-npc-role-editor/src/parsing/documentTypes";

function createGenericDocument({
  roleAttributes = {},
  parameters = {},
}: {
  roleAttributes?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}): NpcRoleJson {
  return {
    Type: "Generic",
    Parameters: parameters,
    ...roleAttributes,
  };
}

function buildSections(document: NpcRoleJson): NpcPropertySection[] {
  return buildNpcPropertyState({
    document,
    topLevelKeyOrder: Object.keys(document),
    descriptors: [],
  }).sections;
}

describe("npc editor issues", () => {
  test("builds unused-parameter warnings", () => {
    const document = createGenericDocument({
      roleAttributes: {
        MaxHealth: {
          Compute: "UsedParameter",
        },
      },
      parameters: {
        Appearance: {
          Value: "",
        },
        UsedParameter: {
          Value: 10,
        },
      },
    });

    const issues = buildNpcIssues({
      roleType: "Generic",
      sections: buildSections(document),
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
    });

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
    const document = createGenericDocument({
      roleAttributes: {
        MaxHealth: {
          Compute: "max(",
        },
      },
      parameters: {
        ViewRange: {
          Value: {
            Compute: "MissingParameter + 1",
          },
        },
      },
    });

    const issues = buildNpcIssues({
      roleType: "Generic",
      sections: buildSections(document),
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
    });

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
