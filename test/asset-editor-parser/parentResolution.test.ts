import { describe, expect, test } from "vitest";

import {
  readParentName,
  resolveEffectiveParentData,
  resolveEffectiveParentDataByName,
} from "../../src/asset-editor/parentResolution";
import type { JsonAssetInstance } from "../../src/shared/fieldTypes";

function asset(name: string, rawJson: Record<string, unknown>): JsonAssetInstance {
  return {
    name,
    type: "Interaction",
    path: `Server/Item/Interactions/${name}.json`,
    package: "Hytale:Hytale",
    contentType: "json",
    rawJson,
  };
}

describe("asset editor parent resolution", () => {
  test("reads non-empty parent names", () => {
    expect(readParentName({ Parent: "Base" })).toBe("Base");
    expect(readParentName({ Parent: "" })).toBeUndefined();
    expect(readParentName({ Parent: 42 })).toBeUndefined();
  });

  test("merges ancestors before nearer parents", () => {
    const assets = new Map([
      ["Grandparent", asset("Grandparent", { Type: "Simple", Shared: "old", Grand: true })],
      ["Parent", asset("Parent", { Parent: "Grandparent", Shared: "new", ParentOnly: true })],
    ]);

    expect(
      resolveEffectiveParentData({
        assetType: "Interaction",
        parentName: "Parent",
        lookupParentAsset: (_assetType, name) => assets.get(name),
      }),
    ).toEqual({
      Type: "Simple",
      Shared: "new",
      Grand: true,
      Parent: "Grandparent",
      ParentOnly: true,
    });
  });

  test("stops on parent cycles", () => {
    const assets = new Map([
      ["A", asset("A", { Parent: "B", A: true })],
      ["B", asset("B", { Parent: "A", B: true })],
    ]);

    expect(
      resolveEffectiveParentData({
        assetType: "Interaction",
        parentName: "A",
        lookupParentAsset: (_assetType, name) => assets.get(name),
      }),
    ).toEqual({ Parent: "B", B: true, A: true });
  });

  test("resolves every parent reference found in a document", () => {
    const assets = new Map([
      ["ConditionParent", asset("ConditionParent", { Type: "Condition", Value: 1 })],
      ["NestedParent", asset("NestedParent", { Type: "Simple", RunTime: 2 })],
    ]);

    expect(
      resolveEffectiveParentDataByName({
        assetType: "Interaction",
        documentJson: {
          Parent: "ConditionParent",
          Next: [{ Parent: "NestedParent" }],
        },
        lookupParentAsset: (_assetType, name) => assets.get(name),
      }),
    ).toEqual({
      ConditionParent: { Type: "Condition", Value: 1 },
      NestedParent: { Type: "Simple", RunTime: 2 },
    });
  });
});
