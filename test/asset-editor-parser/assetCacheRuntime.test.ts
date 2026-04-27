import path from "node:path";
import { describe, expect, test } from "vitest";

import { AssetCacheRuntime } from "../../src/asset-cache/assetCacheRuntime";
import { SchemaRuntime } from "../../src/schema/schemaLoader";

const schemaDir = path.resolve(process.cwd(), "default-data/export-data/schemas");

function createRuntime(): Promise<AssetCacheRuntime> {
  const logger = {
    error() {},
    warn() {},
    info() {},
    debug() {},
  };
  const runtime = new AssetCacheRuntime(
    "/tmp/nonexistent-assets.zip",
    new SchemaRuntime(schemaDir, logger),
    logger,
  );
  return runtime.ready.then(() => runtime);
}

describe("AssetCacheRuntime effective sources", () => {
  test("workspace sources override base-game sources and fall back when removed", async () => {
    const runtime = await createRuntime();
    const resourceSubpath = "Server/NPC/Roles/Components/Test_Component.json";

    runtime.processAssetSource({
      resourceSubpath,
      sourceKind: "baseGamePackage",
      packageName: "Hytale:Hytale",
      contentType: "json",
      parsedJson: {
        Type: "Component",
        Class: "Sensor",
        Interface: "Hytale.Test.Base",
        Parameters: {
          BaseRange: 4,
        },
      },
    });

    expect((await runtime.loadAsset("NPCRole", "Components/Test_Component"))?.package).toBe(
      "Hytale:Hytale",
    );
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).toHaveProperty(
      "Hytale.Test.Base",
    );

    runtime.processAssetSource({
      resourceSubpath,
      sourceKind: "workspaceFile",
      packageName: "Workspace",
      contentType: "json",
      parsedJson: {
        Type: "Component",
        Class: "Sensor",
        Interface: "Hytale.Test.Workspace",
        Parameters: {
          WorkspaceRange: 8,
        },
      },
    });

    const workspaceAsset = await runtime.loadAsset("NPCRole", "Components/Test_Component");
    expect(workspaceAsset?.package).toBe("Workspace");
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).not.toHaveProperty(
      "Hytale.Test.Base",
    );
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).toHaveProperty(
      "Hytale.Test.Workspace",
    );
    expect(runtime.derivedIndexes.get("npcInterfaceParameters")?.values).toEqual({
      "Hytale.Test.Workspace": ["WorkspaceRange"],
    });

    runtime.removeWorkspaceFile(resourceSubpath);

    const fallbackAsset = await runtime.loadAsset("NPCRole", "Components/Test_Component");
    expect(fallbackAsset?.package).toBe("Hytale:Hytale");
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).toHaveProperty(
      "Hytale.Test.Base",
    );
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).not.toHaveProperty(
      "Hytale.Test.Workspace",
    );
  });

  test("invalid workspace JSON does not poison lower-priority base-game source", async () => {
    const runtime = await createRuntime();
    const resourceSubpath = "Server/NPC/Roles/Components/Test_InvalidOverride.json";

    runtime.processAssetSource({
      resourceSubpath,
      sourceKind: "baseGamePackage",
      packageName: "Hytale:Hytale",
      contentType: "json",
      parsedJson: {
        Type: "Component",
        Class: "Action",
        Interface: "Hytale.Test.ValidBase",
      },
    });
    runtime.processAssetSource({
      resourceSubpath,
      sourceKind: "workspaceFile",
      packageName: "Workspace",
      contentType: "json",
      parseError: "Unexpected token",
    });

    const effectiveAsset = await runtime.loadAsset("NPCRole", "Components/Test_InvalidOverride");
    expect(effectiveAsset?.package).toBe("Hytale:Hytale");
    expect(runtime.derivedIndexes.get("npcComponentInterfaces")?.values).toHaveProperty(
      "Hytale.Test.ValidBase",
    );
  });

  test("registered asset and common path shards include workspace resources", async () => {
    const runtime = await createRuntime();

    runtime.processAssetSource({
      resourceSubpath: "Server/NPC/Roles/Components/Workspace_Component.json",
      sourceKind: "workspaceFile",
      packageName: "Workspace",
      contentType: "json",
      parsedJson: {
        Type: "Component",
      },
    });
    runtime.processAssetSource({
      resourceSubpath: "Common/BlockTextures/Workspace_Texture.png",
      sourceKind: "workspaceFile",
      packageName: "Workspace",
      contentType: "image",
      byteSource: {
        kind: "workspaceFile",
        fsPath: "/tmp/Workspace_Texture.png",
      },
    });

    const registeredShard = runtime.getRegisteredAssetsShard("NPCRole");
    expect(registeredShard.values["Components/Workspace_Component"]).toEqual({
      sourcedFromFile: "Server/NPC/Roles/Components/Workspace_Component.json",
      package: "Workspace",
    });

    const commonShard = runtime.getCommonAssetPathsShard();
    expect(commonShard.values.BlockTextures.png).toContain("Workspace_Texture.png");
  });
});
