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

function createVariantDocument({
  reference = "Template_Base",
  modify = {},
  parameters = {},
}: {
  reference?: unknown;
  modify?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}): NpcRoleJson {
  return {
    Type: "Variant",
    Reference: reference as never,
    Modify: modify,
    Parameters: parameters,
  };
}

function buildSections(
  document: NpcRoleJson,
  descriptors: Parameters<typeof buildNpcPropertyState>[0]["descriptors"] = [],
): NpcPropertySection[] {
  return buildNpcPropertyState({
    document,
    topLevelKeyOrder: Object.keys(document),
    descriptors,
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

  test("builds missing required role attribute errors", () => {
    const document = createGenericDocument({});
    const sections = buildSections(document, [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "StartState",
            Type: "String",
            Required: "REQUIRED",
          },
        ],
      },
    ]);

    const issues = buildNpcIssues({
      roleType: "Generic",
      sections,
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "error",
          code: "required-role-attribute-missing",
          message: "Required role attribute is unset.",
          fieldPath: "StartState",
        }),
      ]),
    );
  });

  test("does not flag BusyStates as missing when runtime treats it as optional", () => {
    const document = createGenericDocument({});
    const sections = buildSections(document, [
      {
        Name: "Generic",
        Category: "Role",
        Attributes: [
          {
            Name: "BusyStates",
            Type: "StringList",
            Required: "REQUIRED",
          },
        ],
      },
    ]);

    const issues = buildNpcIssues({
      roleType: "Generic",
      sections,
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
    });

    expect(issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "required-role-attribute-missing",
          fieldPath: "BusyStates",
        }),
      ]),
    );
  });

  test("builds variant reference and modify warnings", () => {
    const parentDocument = createGenericDocument({
      parameters: {
        PublicParameter: {
          Value: 10,
        },
        PrivateParameter: {
          Value: false,
          Private: true,
        },
      },
    });
    const parentSections = buildNpcPropertyState({
      document: parentDocument,
      topLevelKeyOrder: Object.keys(parentDocument),
      descriptors: [],
    }).sections;
    const parentParameterFields =
      parentSections.find(section => section.id === "parameters")?.fields ?? [];

    const document = createVariantDocument({
      reference: "Template_Missing",
      modify: {
        MissingParameter: 1,
        PrivateParameter: {
          Compute: "LocalValue",
        },
      },
      parameters: {
        LocalValue: {
          Value: 2,
        },
      },
    });

    const sections = buildNpcPropertyState({
      document,
      topLevelKeyOrder: Object.keys(document),
      descriptors: [],
      variantReferenceParameters: parentParameterFields,
    }).sections;

    const issues = buildNpcIssues({
      roleType: "Variant",
      sections,
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
      variantReferenceState: {
        status: "loaded",
        referenceName: "Template_Missing",
      },
      variantReferenceParameters: parentParameterFields,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "variant-modify-missing-parameter",
          fieldPath: "Modify.MissingParameter",
        }),
        expect.objectContaining({
          severity: "warning",
          code: "variant-modify-private-parameter",
          fieldPath: "Modify.PrivateParameter",
        }),
      ]),
    );

    const unresolvedReferenceIssues = buildNpcIssues({
      roleType: "Variant",
      sections,
      parameterUsageIndex: buildParameterUsageIndex(serializeNpcDocument(document)),
      variantReferenceState: {
        status: "missing",
        referenceName: "Template_Missing",
      },
      variantReferenceParameters: [],
    });

    expect(unresolvedReferenceIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: "warning",
          code: "variant-reference-missing",
          fieldPath: "Reference",
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
