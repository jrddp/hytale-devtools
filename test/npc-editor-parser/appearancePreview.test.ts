import { describe, expect, test } from "vitest";
import type { ParameterUsageIndex } from "../../webview/hytale-npc-role-editor/src/compute/parameterUsageIndex";
import { resolveEffectiveAppearanceAssetName } from "../../webview/hytale-npc-role-editor/src/appearancePreview";
import type { NpcPropertyField } from "../../webview/hytale-npc-role-editor/src/propertyModel";

describe("npc appearance preview resolution", () => {
  test("resolves a literal appearance asset name directly", () => {
    expect(
      resolveEffectiveAppearanceAssetName({
        appearanceField: createField("Appearance", "Appearance", {
          kind: "literal",
          value: "Sheep",
        }),
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
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: "Appearance",
        }),
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
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: 'isEmpty("Appearance") ? "A" : "B"',
        }),
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
        appearanceField: createField("Appearance", "Appearance", {
          kind: "compute",
          expression: "Appearance",
        }),
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
