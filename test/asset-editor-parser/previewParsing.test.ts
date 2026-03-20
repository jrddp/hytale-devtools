import { describe, expect, test } from "vitest";
import { resolveCachedZipAsset } from "../../src/asset-cache/assetCacheRuntime";
import type { SchemaDefinition } from "../../src/schema/schemaDefinitionTypes";
import { schemaDefinitionToAssetDefinition } from "../../src/schema/schemaToFieldResolver";

describe("asset editor preview metadata", () => {
  test("maps uiEditorPreview onto asset definitions", () => {
    const definition: SchemaDefinition = {
      $id: "PreviewTest.json",
      title: "PreviewTest",
      type: "object",
      hytale: {
        mergesProperties: true,
        uiEditorPreview: "Model",
      },
      properties: {},
    };

    const asset = schemaDefinitionToAssetDefinition(definition, [], console);

    expect(asset).not.toBeNull();
    expect(asset?.preview).toBe("Model");
  });
});

describe("asset cache runtime descriptors", () => {
  const schemaRuntime = {
    getAssetDefinitionForPath(assetPath: string) {
      if (assetPath === "Server/Item/Block/Blocks/Stone.json") {
        return { title: "BlockType" };
      }
      return undefined;
    },
  };

  test("normalizes blockymodel paths as Model assets", () => {
    expect(resolveCachedZipAsset("Common/Blocks/Benches/Alchemy.blockymodel", schemaRuntime)).toEqual(
      {
        assetType: "Model",
        assetName: "Blocks/Benches/Alchemy",
        contentType: "json",
      },
    );
  });

  test("normalizes png paths as Texture assets", () => {
    expect(resolveCachedZipAsset("Common/BlockTextures/Bone_Side.png", schemaRuntime)).toEqual({
      assetType: "Texture",
      assetName: "BlockTextures/Bone_Side",
      contentType: "image",
    });
  });

  test("keeps schema-backed json assets keyed by filename", () => {
    expect(resolveCachedZipAsset("Server/Item/Block/Blocks/Stone.json", schemaRuntime)).toEqual({
      assetType: "BlockType",
      assetName: "Stone",
      contentType: "json",
    });
  });
});
