import { describe, expect, test } from "vitest";
import type { AssetCacheRuntime } from "../../src/asset-cache/assetCacheRuntime";
import type { JsonAssetInstance } from "../../src/shared/fieldTypes";
import {
  resolveNpcAppearanceAnimationPreview,
  resolveNpcAppearanceBaseState,
  resolveNpcAppearancePreview,
  resolveNpcAppearanceState,
} from "../../src/npc-role-editor/appearancePreviewRuntime";
import type { RegisteredAssetsIndexShard } from "../../src/shared/indexTypes";

describe("npc appearance preview runtime", () => {
  test("resolves a direct model and texture", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
        Texture: "Common/Textures/Sheep.png",
        AnimationSets: {
          Idle: {
            Animations: [
              {
                Animation: "Common/Animations/Idle.blockyanim",
                Speed: 1.5,
                Looping: false,
              },
            ],
          },
        },
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {
      "Common/Textures/Sheep.png": [1, 2, 3],
      "Common/Animations/Idle.blockyanim": blockyanimAsset({
        formatVersion: 1,
        duration: 60,
        holdLastKeyframe: false,
        nodeAnimations: {},
      }),
    });

    const preview = await resolveNpcAppearancePreview(
      "Sheep",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
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
      animationSpeed: 1.5,
      animationLooping: false,
    });
  });

  test("resolves an explicitly requested non-idle animation when available", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
        Texture: "Common/Textures/Sheep.png",
        AnimationSets: {
          Idle: {
            Animations: [
              {
                Animation: "Common/Animations/Idle.blockyanim",
                Speed: 1,
                Looping: true,
              },
            ],
          },
          Wake: {
            Animations: [
              {
                Animation: "Common/Animations/Wake.blockyanim",
                Speed: 2,
                Looping: false,
              },
            ],
          },
        },
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {
      "Common/Textures/Sheep.png": [1, 2, 3],
      "Common/Animations/Idle.blockyanim": blockyanimAsset({
        formatVersion: 1,
        duration: 60,
        holdLastKeyframe: false,
        nodeAnimations: {},
      }),
      "Common/Animations/Wake.blockyanim": blockyanimAsset({
        formatVersion: 1,
        duration: 20,
        holdLastKeyframe: true,
        nodeAnimations: {
          Root: [],
        },
      }),
    });

    const preview = await resolveNpcAppearancePreview(
      "Sheep",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
      "Wake",
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: [1, 2, 3],
      animation: {
        formatVersion: 1,
        duration: 20,
        holdLastKeyframe: true,
        nodeAnimations: {
          Root: [],
        },
      },
      animationSpeed: 2,
      animationLooping: false,
    });
  });

  test("falls back to a parent model and inherits parent texture when needed", async () => {
    const runtime = createRuntime({
      "Server/Models/Child.json": jsonAsset({
        Parent: "Parent",
      }),
      "Server/Models/Parent.json": jsonAsset({
        Model: "Common/Models/Parent.blockymodel",
        Texture: "Common/Textures/Parent.png",
      }),
      "Common/Models/Parent.blockymodel": jsonAsset({ name: "ParentModel" }),
    }, {
      "Common/Textures/Parent.png": [9, 9],
    });

    const preview = await resolveNpcAppearancePreview(
      "Child",
      runtime,
      createModelAssetIndex({
        Child: { sourcedFromFile: "Server/Models/Child.json" },
        Parent: { sourcedFromFile: "Server/Models/Parent.json" },
      }),
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "ParentModel" },
      texture: [9, 9],
    });
  });

  test("preserves a child texture override over a parent model", async () => {
    const runtime = createRuntime({
      "Server/Models/Child.json": jsonAsset({
        Parent: "Parent",
        Texture: "Common/Textures/Child.png",
      }),
      "Server/Models/Parent.json": jsonAsset({
        Model: "Common/Models/Parent.blockymodel",
        Texture: "Common/Textures/Parent.png",
      }),
      "Common/Models/Parent.blockymodel": jsonAsset({ name: "ParentModel" }),
    }, {
      "Common/Textures/Child.png": [4, 5],
      "Common/Textures/Parent.png": [7, 8],
    });

    const preview = await resolveNpcAppearancePreview(
      "Child",
      runtime,
      createModelAssetIndex({
        Child: { sourcedFromFile: "Server/Models/Child.json" },
        Parent: { sourcedFromFile: "Server/Models/Parent.json" },
      }),
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "ParentModel" },
      texture: [4, 5],
    });
  });

  test("falls back from blockymodel to png when no texture is declared", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {
      "Common/Models/Sheep.png": [6, 6],
    });

    const preview = await resolveNpcAppearancePreview(
      "Sheep",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: [6, 6],
    });
  });

  test("returns none for missing assets, broken chains, or cycles", async () => {
    const runtime = createRuntime({
      "Server/Models/CycleA.json": jsonAsset({
        Parent: "CycleB",
      }),
      "Server/Models/CycleB.json": jsonAsset({
        Parent: "CycleA",
      }),
    }, {});

    await expect(
      resolveNpcAppearancePreview(
        "Missing",
        runtime,
        createModelAssetIndex({}),
      ),
    ).resolves.toEqual({ type: "none" });

    await expect(
      resolveNpcAppearancePreview(
        "CycleA",
        runtime,
        createModelAssetIndex({
          CycleA: { sourcedFromFile: "Server/Models/CycleA.json" },
          CycleB: { sourcedFromFile: "Server/Models/CycleB.json" },
        }),
      ),
    ).resolves.toEqual({ type: "none" });
  });

  test("keeps appearance previews static when idle is missing", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {});

    const preview = await resolveNpcAppearancePreview(
      "Sheep",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: undefined,
    });
  });

  test("resolves merged animation ids from the effective appearance model", async () => {
    const runtime = createRuntime({
      "Server/Models/Child.json": jsonAsset({
        Parent: "Parent",
        Model: "Common/Models/Child.blockymodel",
        AnimationSets: {
          Hurt: {
            Animations: [{ Animation: "Common/Animations/Hurt.blockyanim" }],
          },
          Idle: {
            Animations: [{ Animation: "Common/Animations/ChildIdle.blockyanim" }],
          },
        },
      }),
      "Server/Models/Parent.json": jsonAsset({
        Model: "Common/Models/Parent.blockymodel",
        AnimationSets: {
          Attack: {
            Animations: [{ Animation: "Common/Animations/Attack.blockyanim" }],
          },
          Idle: {
            Animations: [{ Animation: "Common/Animations/ParentIdle.blockyanim" }],
          },
        },
      }),
      "Common/Models/Child.blockymodel": jsonAsset({ name: "ChildModel" }),
    }, {});

    const appearanceState = await resolveNpcAppearanceState(
      "Child",
      runtime,
      createModelAssetIndex({
        Child: { sourcedFromFile: "Server/Models/Child.json" },
        Parent: { sourcedFromFile: "Server/Models/Parent.json" },
      }),
    );

    expect(appearanceState.preview).toEqual({
      type: "Model",
      model: { name: "ChildModel" },
      texture: undefined,
    });
    expect(appearanceState.animationIds).toEqual(["Attack", "Hurt", "Idle"]);
  });

  test("base preview resolution splits static preview data from idle animation", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
        Texture: "Common/Textures/Sheep.png",
        AnimationSets: {
          Idle: {
            Animations: [
              {
                Animation: "Common/Animations/Idle.blockyanim",
                Speed: 1.25,
                Looping: true,
              },
            ],
          },
        },
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {
      "Common/Textures/Sheep.png": [7, 7],
      "Common/Animations/Idle.blockyanim": blockyanimAsset({
        formatVersion: 1,
        duration: 42,
        holdLastKeyframe: false,
        nodeAnimations: {},
      }),
    });

    const appearanceState = await resolveNpcAppearanceBaseState(
      "Sheep",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
    );

    expect(appearanceState.basePreview).toEqual({
      type: "Model",
      model: { name: "SheepModel" },
      texture: [7, 7],
    });
    expect(appearanceState.idleAnimationPreview).toEqual({
      animation: {
        formatVersion: 1,
        duration: 42,
        holdLastKeyframe: false,
        nodeAnimations: {},
      },
      animationSpeed: 1.25,
      animationLooping: true,
    });
  });

  test("missing animation previews resolve to undefined without dropping the base model", async () => {
    const runtime = createRuntime({
      "Server/Models/Sheep.json": jsonAsset({
        Model: "Common/Models/Sheep.blockymodel",
      }),
      "Common/Models/Sheep.blockymodel": jsonAsset({ name: "SheepModel" }),
    }, {});

    const animationPreview = await resolveNpcAppearanceAnimationPreview(
      "Sheep",
      "Wake",
      runtime,
      createModelAssetIndex({
        Sheep: { sourcedFromFile: "Server/Models/Sheep.json" },
      }),
    );

    expect(animationPreview).toBeUndefined();
  });

  test("includes inherited default attachments in appearance previews", async () => {
    const runtime = createRuntime({
      "Server/Models/Child.json": jsonAsset({
        Parent: "Parent",
        Model: "Common/Models/Child.blockymodel",
      }),
      "Server/Models/Parent.json": jsonAsset({
        DefaultAttachments: [
          {
            Model: "Common/Attachments/Horns.blockymodel",
          },
        ],
      }),
      "Common/Models/Child.blockymodel": jsonAsset({ name: "ChildModel" }),
      "Common/Attachments/Horns.blockymodel": jsonAsset({ name: "HornsAttachment" }),
    }, {
      "Common/Attachments/Horns.png": [2, 4, 6],
    });

    const preview = await resolveNpcAppearancePreview(
      "Child",
      runtime,
      createModelAssetIndex({
        Child: { sourcedFromFile: "Server/Models/Child.json" },
        Parent: { sourcedFromFile: "Server/Models/Parent.json" },
      }),
    );

    expect(preview).toEqual({
      type: "Model",
      model: { name: "ChildModel" },
      texture: undefined,
      attachments: [
        {
          model: { name: "HornsAttachment" },
          texture: [2, 4, 6],
        },
      ],
    });
  });
});

function createModelAssetIndex(
  values: RegisteredAssetsIndexShard["values"],
): RegisteredAssetsIndexShard {
  return {
    hytaleVersion: "test",
    generatedAt: "test",
    indexKind: "registeredAssets",
    key: "ModelAsset",
    path: "Server/Models",
    extension: ".json",
    assetCount: Object.keys(values).length,
    fileCount: Object.keys(values).length,
    baseGameFileCount: Object.keys(values).length,
    values,
  };
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

function blockyanimAsset(rawJson: Record<string, unknown>): number[] {
  return Array.from(Buffer.from(JSON.stringify(rawJson), "utf8"));
}
