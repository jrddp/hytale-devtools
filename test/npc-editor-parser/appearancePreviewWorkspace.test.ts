import { describe, expect, test } from "vitest";
import type { NpcDescriptorDocument } from "../../src/shared/npc-role-editor/descriptorTypes";
import { Workspace } from "../../webview/hytale-npc-role-editor/src/workspace.svelte";

describe("npc workspace appearance preview integration", () => {
  const descriptors: NpcDescriptorDocument = [
    {
      Name: "Generic",
      Category: "Role",
      Attributes: [
        {
          Name: "Appearance",
          Type: "Asset",
          Domain: "Model",
          Computable: true,
        },
      ],
    },
  ];

  test("resolves literal top-level appearance values", () => {
    const workspace = new Workspace();
    workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: "Sheep",
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("Sheep");
  });

  test("resolves direct-translation compute appearance values through literal parameters", () => {
    const workspace = new Workspace();
    workspace.setDescriptors({
      descriptors,
      descriptorPath: "npc_descriptors.json",
      descriptorSource: "default-data",
    });
    workspace.setDocument({
      documentPath: "/tmp/TestNpc.json",
      text: JSON.stringify({
        Type: "Generic",
        Appearance: { Compute: "Appearance" },
        Parameters: {
          Appearance: {
            Value: "Trork",
          },
        },
      }),
      version: 1,
    });

    expect(workspace.getEffectiveAppearanceAssetName()).toBe("Trork");
  });
});
