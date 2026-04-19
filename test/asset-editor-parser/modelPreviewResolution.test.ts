import { describe, expect, test } from "vitest";
import type { AssetCacheRuntime } from "../../src/asset-cache/assetCacheRuntime";
import type { JsonAssetInstance } from "../../src/shared/fieldTypes";
import {
  resolveModelAnimationSetIdsFromModelAsset,
  resolveModelPreviewFromModelAsset,
} from "../../src/shared/modelPreviewResolution";

describe("shared ModelAsset preview resolution", () => {
  test("resolves direct idle animation metadata", async () => {
    const runtime = createRuntime(
      {
        "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
      },
      {
        "Common/Textures/Sheep.png": [1, 2, 3],
        "Common/Animations/Idle.blockyanim": blockyanimAsset({
          formatVersion: 1,
          duration: 60,
          holdLastKeyframe: false,
          nodeAnimations: {},
        }),
      },
    );

    const preview = await resolveModelPreviewFromModelAsset(
      {
        Model: "Common/Models/Sheep.blockymodel",
        Texture: "Common/Textures/Sheep.png",
        AnimationSets: {
          Idle: {
            Animations: [
              {
                Animation: "Common/Animations/Idle.blockyanim",
                Speed: 1.25,
                Looping: false,
              },
            ],
          },
        },
      },
      runtime,
      async () => undefined,
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: [1, 2, 3],
      animation: {
        formatVersion: 1,
        duration: 60,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
      animationSpeed: 1.25,
      animationLooping: false,
    });
  });

  test("inherits parent idle animation but lets child idle override it", async () => {
    const runtime = createRuntime(
      {
        "Common/Models/Parent.blockymodel": jsonAsset({ name: "ParentModel" }),
      },
      {
        "Common/Animations/ParentIdle.blockyanim": blockyanimAsset({
          formatVersion: 1,
          duration: 60,
          holdLastKeyframe: false,
          nodeAnimations: {
            Parent: {},
          },
        }),
        "Common/Animations/ChildIdle.blockyanim": blockyanimAsset({
          formatVersion: 1,
          duration: 30,
          holdLastKeyframe: true,
          nodeAnimations: {
            Child: {},
          },
        }),
      },
    );

    const preview = await resolveModelPreviewFromModelAsset(
      {
        Parent: "Parent",
        AnimationSets: {
          Idle: {
            Animations: [
              {
                Animation: "Common/Animations/ChildIdle.blockyanim",
              },
            ],
          },
        },
      },
      runtime,
      async assetName =>
        assetName === "Parent"
          ? {
              Model: "Common/Models/Parent.blockymodel",
              AnimationSets: {
                Idle: {
                  Animations: [
                    {
                      Animation: "Common/Animations/ParentIdle.blockyanim",
                    },
                  ],
                },
              },
            }
          : undefined,
    );

    expect(preview.model).toEqual({ name: "ParentModel" });
    expect(preview.animation).toEqual({
      formatVersion: 1,
      duration: 30,
      holdLastKeyframe: true,
      nodeAnimations: {
        Child: {},
      },
    });
  });

  test("keeps previews static when idle is missing or invalid", async () => {
    const runtime = createRuntime(
      {
        "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
      },
      {
        "Common/Animations/BrokenIdle.blockyanim": [123, 34, 98, 97, 100, 34],
      },
    );

    await expect(
      resolveModelPreviewFromModelAsset(
        {
          Model: "Common/Models/Sheep.blockymodel",
        },
        runtime,
        async () => undefined,
      ),
    ).resolves.toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: undefined,
    });

    await expect(
      resolveModelPreviewFromModelAsset(
        {
          Model: "Common/Models/Sheep.blockymodel",
          AnimationSets: {
            Idle: {
              Animations: [
                {
                  Animation: "Common/Animations/BrokenIdle.blockyanim",
                },
              ],
            },
          },
        },
        runtime,
        async () => undefined,
      ),
    ).resolves.toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: undefined,
    });
  });

  test("merges animation set ids across the parent chain", async () => {
    const animationIds = await resolveModelAnimationSetIdsFromModelAsset(
      {
        Parent: "Parent",
        AnimationSets: {
          Hurt: {
            Animations: [{ Animation: "Common/Animations/ChildHurt.blockyanim" }],
          },
          Idle: {
            Animations: [{ Animation: "Common/Animations/ChildIdle.blockyanim" }],
          },
        },
      },
      async assetName =>
        assetName === "Parent"
          ? {
              AnimationSets: {
                Attack: {
                  Animations: [{ Animation: "Common/Animations/Attack.blockyanim" }],
                },
                Idle: {
                  Animations: [{ Animation: "Common/Animations/ParentIdle.blockyanim" }],
                },
              },
            }
          : undefined,
    );

    expect(animationIds).toEqual(["Attack", "Hurt", "Idle"]);
  });
});

function createRuntime(
  assetsByPath: Record<string, JsonAssetInstance>,
  bytesByPath: Record<string, number[]>,
): AssetCacheRuntime {
  return {
    loadAssetByPath: async (assetPath: string) => assetsByPath[assetPath],
    readAssetBytesByPath: async (assetPath: string) =>
      bytesByPath[assetPath] ? Buffer.from(bytesByPath[assetPath]) : undefined,
  } as unknown as AssetCacheRuntime;
}

function jsonAsset(rawJson: Record<string, unknown>): JsonAssetInstance {
  return {
    name: "Test",
    type: "ModelAsset",
    path: "Test.json",
    package: "Hytale:Hytale",
    contentType: "json",
    rawJson,
  };
}

function blockyanimAsset(rawJson: Record<string, unknown>): number[] {
  return Array.from(Buffer.from(JSON.stringify(rawJson), "utf8"));
}
