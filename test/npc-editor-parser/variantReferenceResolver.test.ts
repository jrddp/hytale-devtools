import { describe, expect, test } from "vitest";
import {
  buildVariantAppearancePreviewContext,
  filterNpcRoleReferenceNamesFromPaths,
  matchesNpcRoleReferenceCandidate,
  parseNpcRoleTypeFromText,
  type LoadedVariantReferenceDocument,
  type VariantReferenceDocumentLoadResult,
} from "../../src/npc-role-editor/variantReferenceResolver";
import type { NpcRoleJson } from "../../src/shared/npc-role-editor/documentTypes";

describe("variant reference resolver helpers", () => {
  test("filters likely component references out of role autocomplete names", () => {
    expect(
      filterNpcRoleReferenceNamesFromPaths([
        "_Core/Templates/Template_Intelligent",
        "_Core/Components/Selectors/Component_Instruction_Generic_Search",
        "/tmp/workspace/src/main/resources/Server/NPC/Roles/Animals/Cow.json",
      ]),
    ).toEqual(["Cow", "Template_Intelligent"]);
  });

  test("parses npc role type from raw document text", () => {
    expect(parseNpcRoleTypeFromText('{\"Type\":\"Variant\",\"Reference\":\"Template_Base\"}')).toBe(
      "Variant",
    );
    expect(parseNpcRoleTypeFromText("{")).toBeUndefined();
  });

  test("matches authored role references against full paths and basenames", () => {
    expect(
      matchesNpcRoleReferenceCandidate(
        "/tmp/workspace/Server/NPC/Roles/_Core/Templates/Template_Base.json",
        "_Core/Templates/Template_Base",
      ),
    ).toBe(true);
    expect(
      matchesNpcRoleReferenceCandidate(
        "Server/NPC/Roles/_Core/Templates/Template_Base",
        "Template_Base",
      ),
    ).toBe(true);
    expect(
      matchesNpcRoleReferenceCandidate(
        "Server/NPC/Roles/_Core/Templates/Template_Base",
        "_Core/Templates/Template_Other",
      ),
    ).toBe(false);
  });

  test("builds inherited appearance context from variant to generic chains", async () => {
    const context = await buildVariantAppearancePreviewContext({
      referenceName: "Variant_A",
      currentDocumentReferenceName: "CurrentVariant",
      loadReferenceDocument: createReferenceLoader({
        Variant_A: createLoadedReference("Variant_A", {
          Type: "Variant",
          Reference: "Template_Base",
          Modify: {
            Appearance: {
              Compute: "Appearance",
            },
          },
          Parameters: {
            Appearance: {
              Value: "VariantSheep",
            },
          },
        }),
        Template_Base: createLoadedReference("Template_Base", {
          Type: "Generic",
          Appearance: "BaseSheep",
          Parameters: {
            Appearance: {
              Value: "BaseSheep",
            },
            Speed: {
              Value: 1,
            },
          },
        }),
      }),
    });

    expect(context).toEqual({
      appearanceValue: {
        Compute: "Appearance",
      },
      effectiveParameters: {
        Appearance: "VariantSheep",
        Speed: 1,
      },
    });
  });

  test("lets descendant variants override inherited appearance source", async () => {
    const context = await buildVariantAppearancePreviewContext({
      referenceName: "Variant_Child",
      currentDocumentReferenceName: "CurrentVariant",
      loadReferenceDocument: createReferenceLoader({
        Variant_Child: createLoadedReference("Variant_Child", {
          Type: "Variant",
          Reference: "Variant_Parent",
          Modify: {
            Appearance: "ChildAppearance",
          },
        }),
        Variant_Parent: createLoadedReference("Variant_Parent", {
          Type: "Variant",
          Reference: "Template_Base",
          Modify: {
            Appearance: "ParentAppearance",
          },
        }),
        Template_Base: createLoadedReference("Template_Base", {
          Type: "Generic",
          Appearance: "BaseAppearance",
        }),
      }),
    });

    expect(context).toEqual({
      appearanceValue: "ChildAppearance",
    });
  });

  test("inherits appearance through variant-to-variant chains when descendants do not override it", async () => {
    const context = await buildVariantAppearancePreviewContext({
      referenceName: "Variant_Child",
      currentDocumentReferenceName: "CurrentVariant",
      loadReferenceDocument: createReferenceLoader({
        Variant_Child: createLoadedReference("Variant_Child", {
          Type: "Variant",
          Reference: "Variant_Parent",
        }),
        Variant_Parent: createLoadedReference("Variant_Parent", {
          Type: "Variant",
          Reference: "Template_Base",
          Modify: {
            Appearance: "ParentAppearance",
          },
        }),
        Template_Base: createLoadedReference("Template_Base", {
          Type: "Generic",
          Appearance: "BaseAppearance",
        }),
      }),
    });

    expect(context).toEqual({
      appearanceValue: "ParentAppearance",
    });
  });

  test("returns no preview context when the inherited chain is missing or cyclic", async () => {
    await expect(
      buildVariantAppearancePreviewContext({
        referenceName: "Variant_Missing",
        currentDocumentReferenceName: "CurrentVariant",
        loadReferenceDocument: createReferenceLoader({
          Variant_Missing: createLoadedReference("Variant_Missing", {
            Type: "Variant",
            Reference: "MissingTemplate",
          }),
        }),
      }),
    ).resolves.toBeUndefined();

    await expect(
      buildVariantAppearancePreviewContext({
        referenceName: "Variant_A",
        currentDocumentReferenceName: "CurrentVariant",
        loadReferenceDocument: createReferenceLoader({
          Variant_A: createLoadedReference("Variant_A", {
            Type: "Variant",
            Reference: "Variant_B",
          }),
          Variant_B: createLoadedReference("Variant_B", {
            Type: "Variant",
            Reference: "Variant_A",
          }),
        }),
      }),
    ).resolves.toBeUndefined();
  });
});

function createReferenceLoader(
  references: Record<string, LoadedVariantReferenceDocument>,
): (referenceName: string) => Promise<VariantReferenceDocumentLoadResult> {
  return async (referenceName: string) => {
    const loadedReference = references[referenceName];
    if (!loadedReference) {
      return { status: "missing" };
    }

    return {
      status: "loaded",
      reference: loadedReference,
    };
  };
}

function createLoadedReference(
  referenceName: string,
  document: NpcRoleJson,
): LoadedVariantReferenceDocument {
  return {
    referenceName,
    resolvedPath: `/tmp/${referenceName}.json`,
    text: JSON.stringify(document),
    document,
  };
}
