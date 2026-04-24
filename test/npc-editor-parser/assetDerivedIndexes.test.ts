import { describe, expect, test } from "vitest";

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

describe("asset-derived NPC component indexes", () => {
  test("extracts component interfaces, parameters, import states, and component metadata", () => {
    const indexes = buildAssetDerivedIndexes(
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
                  _ImportStates: ["Idle", "Alerted"],
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
                  _ImportStates: ["Flee"],
                  Speed: {
                    Value: 1,
                  },
                },
              }),
            ],
            [
              "Generic_Role",
              createNpcRoleAsset("Generic_Role", {
                Type: "Generic",
              }),
            ],
          ]),
        ],
      ]),
    );

    expect(Object.keys(indexes.get("npcComponentInterfaces")?.values ?? {}).sort()).toEqual([
      "Hytale.Test.Component.Flee",
      "Hytale.Test.Component.Seek",
    ]);
    expect(indexes.get("npcComponents")?.values).toMatchObject({
      Component_Seek: {
        componentClass: "Instruction",
        interface: "Hytale.Test.Component.Seek",
        parameterNames: ["Range", "Target"],
        importStates: ["Idle", "Alerted"],
      },
    });
    expect(indexes.get("npcInterfaceParameters")?.values).toMatchObject({
      "Hytale.Test.Component.Seek": ["Range", "Target"],
      "Hytale.Test.Component.Flee": ["Speed"],
    });
    expect(indexes.get("npcComponents")?.values).not.toHaveProperty("Generic_Role");
  });
});
