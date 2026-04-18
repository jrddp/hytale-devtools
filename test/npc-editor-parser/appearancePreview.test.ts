import { describe, expect, test } from "vitest";
import type { ParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import { resolveEffectiveAppearanceAssetName } from "../../webview/hytale-npc-role-editor/src/appearancePreview";
import type { NpcPropertyField } from "../../webview/hytale-npc-role-editor/src/propertyModel";

describe("npc appearance preview resolution", () => {
  test("resolves a literal appearance asset name directly", () => {
    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Generic",
        appearanceField: createField("Appearance", "Appearance", {
          kind: "literal",
          value: "Sheep",
        }),
        variantAppearanceField: null,
        parameterUsageIndex: emptyParameterUsageIndex(),
        standardParameterFields: [],
      }),
    ).toBe("Sheep");
  });

  test("resolves a direct-translation compute through a literal parameter", () => {
    const usageIndex = emptyParameterUsageIndex();
    usageIndex.directTranslationByFieldPath.set("Appearance", "Appearance");

    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Generic",
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: "Appearance",
        }),
        variantAppearanceField: null,
        parameterUsageIndex: usageIndex,
        standardParameterFields: [
          createField("Appearance", "Parameters.Appearance.Value", {
            kind: "literal",
            value: "Trork",
          }),
        ],
      }),
    ).toBe("Trork");
  });

  test("does not resolve non-direct compute expressions", () => {
    const usageIndex = emptyParameterUsageIndex();

    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Generic",
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: 'isEmpty("Appearance") ? "A" : "B"',
        }),
        variantAppearanceField: null,
        parameterUsageIndex: usageIndex,
        standardParameterFields: [
          createField("Appearance", "Parameters.Appearance.Value", {
            kind: "literal",
            value: "Sheep",
          }),
        ],
      }),
    ).toBeUndefined();
  });

  test("does not resolve computed parameter values", () => {
    const usageIndex = emptyParameterUsageIndex();
    usageIndex.directTranslationByFieldPath.set("Appearance", "Appearance");

    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Generic",
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: "Appearance",
        }),
        variantAppearanceField: null,
        parameterUsageIndex: usageIndex,
        standardParameterFields: [
          createField("Appearance", "Parameters.Appearance.Value", {
            kind: "compute",
            expression: "SomeOtherParameter",
          }),
        ],
      }),
    ).toBeUndefined();
  });

  test("prefers variant modify appearance overrides over inherited appearance", () => {
    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Variant",
        appearanceField: null,
        variantAppearanceField: createField("Appearance", "Modify.Appearance", {
          kind: "literal",
          value: "ChildSheep",
        }),
        parameterUsageIndex: emptyParameterUsageIndex(),
        standardParameterFields: [],
        inheritedAppearanceValue: "ParentSheep",
      }),
    ).toBe("ChildSheep");
  });

  test("resolves inherited computed appearance values through merged variant parameters", () => {
    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Variant",
        appearanceField: null,
        variantAppearanceField: null,
        parameterUsageIndex: emptyParameterUsageIndex(),
        standardParameterFields: [
          createField("Appearance", "Parameters.Appearance.Value", {
            kind: "literal",
            value: "LocalSheep",
          }),
        ],
        inheritedAppearanceValue: {
          Compute: "Appearance",
        },
        inheritedEffectiveParameters: {
          Appearance: "ParentSheep",
        },
      }),
    ).toBe("LocalSheep");
  });

  test("does not resolve inherited non-direct compute expressions", () => {
    expect(
      resolveEffectiveAppearanceAssetName({
        roleType: "Variant",
        appearanceField: null,
        variantAppearanceField: null,
        parameterUsageIndex: emptyParameterUsageIndex(),
        standardParameterFields: [],
        inheritedAppearanceValue: {
          Compute: 'isEmpty("Appearance") ? "A" : "B"',
        },
        inheritedEffectiveParameters: {
          Appearance: "ParentSheep",
        },
      }),
    ).toBeUndefined();
  });
});

function emptyParameterUsageIndex(): ParameterUsageIndex {
  return {
    usagesByParameter: new Map(),
    directTranslationByFieldPath: new Map(),
  };
}

function createField(
  key: string,
  fieldPath: string,
  value: NpcPropertyField["value"],
): NpcPropertyField {
  return {
    id: fieldPath,
    key,
    label: key,
    fieldPath,
    kind: "string",
    value,
  };
}
