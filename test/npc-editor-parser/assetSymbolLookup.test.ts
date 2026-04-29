import { describe, expect, test } from "vitest";

import { resolveNpcDescriptorAssetSymbolLookup } from "../../src/shared/npc-role-editor/assetSymbolLookup";

describe("resolveNpcDescriptorAssetSymbolLookup", () => {
  test("maps supported NPC descriptor asset domains to registered assets", () => {
    expect(
      resolveNpcDescriptorAssetSymbolLookup({
        Type: "Asset",
        Domain: "Model",
      }),
    ).toEqual({
      indexKind: "registeredAssets",
      key: "ModelAsset",
    });

    expect(
      resolveNpcDescriptorAssetSymbolLookup({
        Type: "Asset",
        Domain: "Interaction",
      }),
    ).toEqual({
      indexKind: "registeredAssets",
      key: "RootInteraction",
    });

    expect(
      resolveNpcDescriptorAssetSymbolLookup({
        Type: "AssetArray",
        Domain: "TagSet",
      }),
    ).toEqual({
      indexKind: "registeredAssets",
      key: "NPCGroup",
    });
  });

  test("returns undefined for unsupported descriptor domains or types", () => {
    expect(
      resolveNpcDescriptorAssetSymbolLookup({
        Type: "String",
        Domain: "Model",
      }),
    ).toBeUndefined();

    expect(
      resolveNpcDescriptorAssetSymbolLookup({
        Type: "Asset",
        Domain: "UnknownThing",
      }),
    ).toBeUndefined();
  });
});
