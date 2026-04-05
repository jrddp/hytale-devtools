import * as assert from "assert";
import { getCommonAssetPathValues } from "../schema/symbolResolver";
import { type CommonAssetPathsIndexShard } from "../shared/indexTypes";

suite("Symbol Resolver Test Suite", () => {
  test("matches common asset roots with trailing slash requests", () => {
    const shard: CommonAssetPathsIndexShard = {
      hytaleVersion: "test",
      generatedAt: "test",
      indexKind: "commonAssetPaths",
      key: "all",
      values: {
        BlockTextures: {
          png: ["RootTexture.png"],
        },
        "BlockTextures/Decor": {
          png: ["NestedTexture.png"],
        },
        Blocks: {
          png: ["BlockTexture.png"],
        },
      },
    };

    const values = getCommonAssetPathValues(shard, {
      indexKind: "commonAssetPaths",
      key: "all",
      folders: ["BlockTextures/"],
      extension: "png",
    });

    assert.deepStrictEqual(values, [
      "BlockTextures/RootTexture.png",
      "BlockTextures/Decor/NestedTexture.png",
    ]);
  });

  test("does not match sibling roots by raw prefix", () => {
    const shard: CommonAssetPathsIndexShard = {
      hytaleVersion: "test",
      generatedAt: "test",
      indexKind: "commonAssetPaths",
      key: "all",
      values: {
        Items: {
          png: ["Expected.png"],
        },
        ItemsGenerated: {
          png: ["Unexpected.png"],
        },
      },
    };

    const values = getCommonAssetPathValues(shard, {
      indexKind: "commonAssetPaths",
      key: "all",
      folders: ["Items"],
      extension: "png",
    });

    assert.deepStrictEqual(values, ["Items/Expected.png"]);
  });

  test("normalizes Windows-style folder separators to slash-delimited internal paths", () => {
    const shard: CommonAssetPathsIndexShard = {
      hytaleVersion: "test",
      generatedAt: "test",
      indexKind: "commonAssetPaths",
      key: "all",
      values: {
        "Common\\BlockTextures\\Decor": {
          png: ["NestedTexture.png"],
        },
      },
    };

    const values = getCommonAssetPathValues(shard, {
      indexKind: "commonAssetPaths",
      key: "all",
      folders: ["BlockTextures\\"],
      extension: "png",
    });

    assert.deepStrictEqual(values, ["BlockTextures/Decor/NestedTexture.png"]);
  });
});
