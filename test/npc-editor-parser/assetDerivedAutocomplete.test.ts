import { describe, expect, test, vi } from "vitest";

import { buildAssetDerivedIndexes } from "../../src/asset-cache/assetDerivedIndexes";
import type { JsonAssetInstance } from "../../src/shared/fieldTypes";

function createNpcRoleAsset(
  name: string,
  rawJson: Record<string, unknown>,
): JsonAssetInstance {
  return {
    name,
    type: "NPCRole",
    path: `Server/NPC/Roles/${name}.json`,
    package: "Hytale:Hytale",
    contentType: "json",
    rawJson,
  };
}

describe("asset-derived autocomplete", () => {
  test("waits for asset cache readiness before resolving component interface and parameter values", async () => {
    vi.resetModules();

    let resolveReady: (() => void) | undefined;
    const ready = new Promise<void>(resolve => {
      resolveReady = resolve;
    });
    const derivedIndexes = buildAssetDerivedIndexes(
      new Map([
        [
          "NPCRole",
          new Map([
            [
              "Component_Seek",
              createNpcRoleAsset("Component_Seek", {
                Type: "Component",
                Class: "Instruction",
                Interface: "Hytale.Test.Component.Seek",
                Parameters: {
                  Range: {
                    Value: 6,
                  },
                  Target: {
                    Value: "",
                  },
                },
              }),
            ],
            [
              "Component_Flee",
              createNpcRoleAsset("Component_Flee", {
                Type: "Component",
                Class: "Instruction",
                Interface: "Hytale.Test.Component.Flee",
                Parameters: {
                  Speed: {
                    Value: 1,
                  },
                },
              }),
            ],
          ]),
        ],
      ]),
    );

    vi.doMock("vscode", () => ({
      workspace: {
        getConfiguration: vi.fn(() => ({
          get: vi.fn(),
        })),
      },
    }));
    vi.doMock("../../src/extension", () => ({
      assetCacheRuntime: {
        ready,
        derivedIndexes,
      },
      indexes: new Map(),
      LOGGER: {
        error: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        debug: vi.fn(),
      },
    }));

    const { getValuesByIndexReferenceAsync } = await import("../../src/schema/symbolResolver");
    let didResolve = false;
    const valuesPromise = getValuesByIndexReferenceAsync({
      indexKind: "assetDerived",
      key: "npcComponentInterfaces",
    }).then(values => {
      didResolve = true;
      return values;
    });

    await Promise.resolve();
    expect(didResolve).toBe(false);

    resolveReady?.();
    expect(await valuesPromise).toEqual([
      "Hytale.Test.Component.Flee",
      "Hytale.Test.Component.Seek",
    ]);
    expect(
      await getValuesByIndexReferenceAsync({
        indexKind: "assetDerived",
        key: "npcInterfaceParameters",
        filter: {
          npcComponentInterfaces: ["Hytale.Test.Component.Seek"],
        },
      }),
    ).toEqual(["Range", "Target"]);

    vi.doUnmock("vscode");
    vi.doUnmock("../../src/extension");
  });
});
